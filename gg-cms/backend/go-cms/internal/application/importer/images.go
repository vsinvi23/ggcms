package importer

import (
	"fmt"
	"net/http"
	"path"
	"regexp"
	"strings"
)

// ImageAsset is a raster image found inside an uploaded zip.
type ImageAsset struct {
	Path string // cleaned, slash-separated path inside the zip
	Name string // base file name
	MIME string // detected from content, never from the extension
	Data []byte
}

// ImageRef is one image reference found in a document body.
type ImageRef struct {
	Raw string // the path exactly as written in the document
	Alt string
}

const maxImagesPerZip = 200

// imageMIMEs are the only formats accepted. SVG is intentionally absent: stored SVG files can
// execute script when opened directly, so SVG is only supported inline (see svg.go).
var imageMIMEs = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

var imageExts = setOf(".png", ".jpg", ".jpeg", ".gif", ".webp")

var (
	mdImageRe  = regexp.MustCompile(`!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)`)
	htmlImgRe  = regexp.MustCompile(`(?i)<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']`)
	externalRe = regexp.MustCompile(`(?i)^([a-z][a-z0-9+.-]*:|//|#)`)
)

// DetectImageMIME sniffs content and returns the MIME type if it is an accepted raster format.
func DetectImageMIME(data []byte) (string, bool) {
	n := len(data)
	if n > 512 {
		n = 512
	}
	mime := http.DetectContentType(data[:n])
	if _, ok := imageMIMEs[mime]; ok {
		return mime, true
	}
	return "", false
}

// ExtractImageRefs lists local (relative-path) image references in a markdown or HTML body.
// http(s):, data:, protocol-relative and fragment references are not local and are skipped, as
// are references inside fenced code blocks.
func ExtractImageRefs(body string) []ImageRef {
	var refs []ImageRef
	seen := map[string]bool{}
	add := func(raw, alt string) {
		raw = strings.TrimSpace(raw)
		if raw == "" || externalRe.MatchString(raw) || seen[raw] {
			return
		}
		seen[raw] = true
		refs = append(refs, ImageRef{Raw: raw, Alt: alt})
	}
	forEachNonCodeLine(body, func(line string) {
		for _, m := range mdImageRe.FindAllStringSubmatch(line, -1) {
			add(m[2], m[1])
		}
		for _, m := range htmlImgRe.FindAllStringSubmatch(line, -1) {
			add(m[1], "")
		}
	})
	return refs
}

// ResolveImagePath resolves ref relative to the directory of the document that contains it and
// returns the cleaned in-zip path. It fails for anything that would leave the archive.
func ResolveImagePath(docPath, ref string) (string, bool) {
	ref = strings.ReplaceAll(strings.TrimSpace(ref), "\\", "/")
	if i := strings.IndexAny(ref, "?#"); i >= 0 {
		ref = ref[:i]
	}
	if ref == "" {
		return "", false
	}
	var joined string
	if strings.HasPrefix(ref, "/") {
		joined = strings.TrimPrefix(ref, "/") // treated as relative to the zip root
	} else {
		joined = path.Join(path.Dir(strings.ReplaceAll(docPath, "\\", "/")), ref)
	}
	cleaned := path.Clean(joined)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || strings.HasPrefix(cleaned, "/") {
		return "", false
	}
	return cleaned, true
}

// LookupImage finds the asset a reference points at: exact path first, then a case-insensitive
// match (authors on Windows/macOS are not consistent about case).
func LookupImage(assets map[string]*ImageAsset, resolved string) (*ImageAsset, bool) {
	if a, ok := assets[resolved]; ok {
		return a, true
	}
	lower := strings.ToLower(resolved)
	for p, a := range assets {
		if strings.ToLower(p) == lower {
			return a, true
		}
	}
	return nil, false
}

// RewriteImageRefs replaces each local reference in body with its mapped URL. mapping is keyed
// by the reference exactly as written in the document.
func RewriteImageRefs(body string, mapping map[string]string) string {
	if len(mapping) == 0 {
		return body
	}
	lines := strings.Split(body, "\n")
	fence := ""
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if fence != "" {
			if strings.HasPrefix(t, fence) {
				fence = ""
			}
			continue
		}
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			fence = t[:3]
			continue
		}
		line = mdImageRe.ReplaceAllStringFunc(line, func(m string) string {
			sub := mdImageRe.FindStringSubmatch(m)
			if u, ok := mapping[strings.TrimSpace(sub[2])]; ok {
				return "![" + sub[1] + "](" + u + ")"
			}
			return m
		})
		line = htmlImgRe.ReplaceAllStringFunc(line, func(m string) string {
			sub := htmlImgRe.FindStringSubmatch(m)
			if u, ok := mapping[strings.TrimSpace(sub[1])]; ok {
				return strings.Replace(m, sub[1], u, 1)
			}
			return m
		})
		lines[i] = line
	}
	return strings.Join(lines, "\n")
}

// MissingImageWarning formats a per-reference warning for the preview.
func MissingImageWarning(ref string) string {
	return fmt.Sprintf("image %q is referenced but was not found in the zip", ref)
}

func forEachNonCodeLine(body string, fn func(string)) {
	fence := ""
	for _, line := range strings.Split(body, "\n") {
		t := strings.TrimSpace(line)
		if fence != "" {
			if strings.HasPrefix(t, fence) {
				fence = ""
			}
			continue
		}
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			fence = t[:3]
			continue
		}
		fn(line)
	}
}

// ImageExt returns the file extension to store an accepted image MIME type under.
func ImageExt(mime string) string { return imageMIMEs[mime] }
