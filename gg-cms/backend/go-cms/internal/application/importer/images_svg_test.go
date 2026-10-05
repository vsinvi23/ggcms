package importer

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

// Minimal PNG and GIF: just enough for content sniffing.
var (
	pngBytes, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
	gifBytes    = []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")
)

func buildZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	for name, data := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write(data)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestZip_CollectsImagesAndResolvesRefs(t *testing.T) {
	md := "# Guide\n\n![logo](./img/logo.png)\n\nText\n\n![remote](https://x.test/a.png)\n"
	z := buildZip(t, map[string][]byte{"docs/guide.md": []byte(md), "docs/img/logo.png": pngBytes})
	res := ParseZIPWithImages("b.zip", z)
	if len(res.Items) != 1 || !res.Items[0].Valid {
		t.Fatalf("expected 1 valid item, got %+v", res.Items)
	}
	if _, ok := res.Images["docs/img/logo.png"]; !ok {
		t.Fatalf("image not collected: %v", res.Images)
	}
	if len(res.Items[0].ImageRefs) != 1 || res.Items[0].ImageRefs[0].Raw != "./img/logo.png" {
		t.Errorf("only the local reference should be listed, got %+v", res.Items[0].ImageRefs)
	}
	if len(res.Items[0].Warnings) != 0 {
		t.Errorf("unexpected warnings: %v", res.Items[0].Warnings)
	}
}

func TestZip_MissingImageWarns(t *testing.T) {
	z := buildZip(t, map[string][]byte{"a.md": []byte("# A\n\n![x](missing.png)\n")})
	res := ParseZIPWithImages("b.zip", z)
	if len(res.Items[0].Warnings) != 1 || !strings.Contains(res.Items[0].Warnings[0], "missing.png") {
		t.Errorf("expected a missing-image warning, got %v", res.Items[0].Warnings)
	}
}

func TestZip_ImageEscapingArchiveWarns(t *testing.T) {
	z := buildZip(t, map[string][]byte{"a.md": []byte("# A\n\n![x](../../etc/passwd.png)\n")})
	res := ParseZIPWithImages("b.zip", z)
	if len(res.Items[0].Warnings) != 1 {
		t.Errorf("expected a warning for a path leaving the zip, got %v", res.Items[0].Warnings)
	}
}

func TestZip_ImageContentMustMatchExtension(t *testing.T) {
	z := buildZip(t, map[string][]byte{"a.md": []byte("# A\n\n![x](evil.png)\n"), "evil.png": []byte("<?php echo 1; ?>")})
	res := ParseZIPWithImages("b.zip", z)
	if len(res.Images) != 0 {
		t.Errorf("non-image bytes named .png must not be collected: %v", res.Images)
	}
}

func TestZip_SVGFilesAreNeverStored(t *testing.T) {
	svg := `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`
	z := buildZip(t, map[string][]byte{"a.md": []byte("# A\n\n![x](d.svg)\n"), "d.svg": []byte(svg)})
	res := ParseZIPWithImages("b.zip", z)
	if len(res.Images) != 0 {
		t.Errorf("svg files must not be collected: %v", res.Images)
	}
}

func TestResolveImagePath(t *testing.T) {
	cases := []struct {
		doc, ref, want string
		ok             bool
	}{
		{"docs/guide.md", "img/a.png", "docs/img/a.png", true},
		{"docs/guide.md", "./img/a.png", "docs/img/a.png", true},
		{"docs/guide.md", "../shared/a.png", "shared/a.png", true},
		{"guide.md", "a.png", "a.png", true},
		{"docs/guide.md", "/assets/a.png", "assets/a.png", true},
		{"docs/guide.md", "img\\a.png", "docs/img/a.png", true},
		{"docs/guide.md", "img/a.png?raw=1", "docs/img/a.png", true},
		{"guide.md", "../a.png", "", false},
		{"docs/guide.md", "../../a.png", "", false},
	}
	for _, c := range cases {
		got, ok := ResolveImagePath(c.doc, c.ref)
		if ok != c.ok || got != c.want {
			t.Errorf("ResolveImagePath(%q,%q) = %q,%v want %q,%v", c.doc, c.ref, got, ok, c.want, c.ok)
		}
	}
}

func TestExtractImageRefs_SkipsExternalAndCode(t *testing.T) {
	body := "![a](a.png)\n![b](https://h/b.png)\n![c](data:image/png;base64,AAA)\n![d](//cdn/d.png)\n```\n![code](in-code.png)\n```\n<img src=\"h.png\" alt=\"h\">\n![a again](a.png)"
	var got []string
	for _, r := range ExtractImageRefs(body) {
		got = append(got, r.Raw)
	}
	if strings.Join(got, ",") != "a.png,h.png" {
		t.Errorf("got %v", got)
	}
}

func TestRewriteImageRefs(t *testing.T) {
	body := "![a](./a.png)\n```\n![a](./a.png)\n```\n<img src=\"./a.png\">"
	out := RewriteImageRefs(body, map[string]string{"./a.png": "/uploads/x.png"})
	if !strings.HasPrefix(out, "![a](/uploads/x.png)") || !strings.Contains(out, `<img src="/uploads/x.png">`) {
		t.Errorf("not rewritten: %q", out)
	}
	if strings.Count(out, "./a.png") != 1 {
		t.Errorf("reference inside a code fence must stay untouched: %q", out)
	}
}

func TestDetectImageMIME(t *testing.T) {
	if m, ok := DetectImageMIME(pngBytes); !ok || m != "image/png" {
		t.Errorf("png: %v %v", m, ok)
	}
	if m, ok := DetectImageMIME(gifBytes); !ok || m != "image/gif" {
		t.Errorf("gif: %v %v", m, ok)
	}
	for _, bad := range []string{`<svg xmlns="http://www.w3.org/2000/svg"/>`, "<html></html>", "plain"} {
		if _, ok := DetectImageMIME([]byte(bad)); ok {
			t.Errorf("%q must not be accepted", bad)
		}
	}
}

// ---- inline SVG ----

func TestInlineSVG_ConvertedToDataURI(t *testing.T) {
	md := "# T\n\nbefore\n\n<svg viewBox=\"0 0 10 10\" width=\"10\"><circle cx=\"5\" cy=\"5\" r=\"4\" fill=\"red\"/></svg>\n\nafter\n"
	out, warns := convertInlineSVG(md)
	if len(warns) != 0 {
		t.Fatalf("warnings: %v", warns)
	}
	if strings.Contains(out, "<svg") {
		t.Errorf("raw svg should be gone: %q", out)
	}
	prefix := "data:image/svg+xml;base64,"
	i := strings.Index(out, prefix)
	if i < 0 {
		t.Fatalf("no data URI: %q", out)
	}
	enc := out[i+len(prefix):]
	enc = enc[:strings.Index(enc, ")")]
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "<circle") || !strings.Contains(string(raw), `xmlns="http://www.w3.org/2000/svg"`) {
		t.Errorf("decoded svg unexpected: %s", raw)
	}
}

func TestInlineSVG_MultilineAndTrailingText(t *testing.T) {
	md := "<svg viewBox=\"0 0 1 1\">\n  <rect width=\"1\" height=\"1\"/>\n</svg> trailing words\nnext"
	out, _ := convertInlineSVG(md)
	if !strings.Contains(out, "![SVG diagram](data:image/svg+xml;base64,") || !strings.Contains(out, "trailing words") || !strings.Contains(out, "next") {
		t.Errorf("unexpected: %q", out)
	}
}

func TestInlineSVG_SanitizesActiveContent(t *testing.T) {
	src := `<svg onload="alert(1)" viewBox="0 0 5 5"><script>alert(1)</script><foreignObject><div>x</div></foreignObject>` +
		`<style>@import url(http://evil/x.css)</style><a href="javascript:alert(1)"><rect width="5" height="5" onclick="x()" fill="url(http://evil/#a)"/></a>` +
		`<image href="http://evil/p.png"/><use href="http://evil/s.svg#a"/><path d="M0 0L5 5" stroke="blue"/></svg>`
	clean, err := sanitizeSVG(src)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"script", "alert", "foreignObject", "onload", "onclick", "javascript", "evil", "<style", "<image", "<a "} {
		if strings.Contains(clean, bad) {
			t.Errorf("sanitized output still contains %q: %s", bad, clean)
		}
	}
	if !strings.Contains(clean, `<path d="M0 0L5 5" stroke="blue">`) {
		t.Errorf("legitimate content was lost: %s", clean)
	}
}

func TestInlineSVG_KeepsSameDocumentRefs(t *testing.T) {
	clean, err := sanitizeSVG(`<svg viewBox="0 0 2 2"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="2" height="2" fill="url(#g)"/><use href="#g"/></svg>`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(clean, `fill="url(#g)"`) || !strings.Contains(clean, `href="#g"`) {
		t.Errorf("same-document references should survive: %s", clean)
	}
}

func TestInlineSVG_LeftAloneInsideCodeFence(t *testing.T) {
	md := "```html\n<svg><circle r=\"1\"/></svg>\n```"
	out, _ := convertInlineSVG(md)
	if out != md {
		t.Errorf("svg inside a code fence must be unchanged: %q", out)
	}
}

func TestInlineSVG_MalformedLeftUnchangedWithWarning(t *testing.T) {
	md := "<svg><g></svg>"
	out, warns := convertInlineSVG(md)
	if out != md || len(warns) != 1 {
		t.Errorf("out=%q warns=%v", out, warns)
	}
}

func TestInlineSVG_OversizeRejected(t *testing.T) {
	big := "<svg>" + strings.Repeat("<g/>", maxInlineSVGBytes) + "</svg>"
	if _, err := sanitizeSVG(big); err == nil {
		t.Error("oversize svg must be rejected")
	}
}

func TestMarkdownParse_InlineSVGReachesBody(t *testing.T) {
	items := Parse("a.md", []byte("# Title\n\n<svg viewBox=\"0 0 1 1\"><rect width=\"1\" height=\"1\"/></svg>\n"))
	if len(items) != 1 || !strings.Contains(items[0].Body, "![SVG diagram](data:image/svg+xml;base64,") {
		t.Errorf("%+v", items)
	}
}
