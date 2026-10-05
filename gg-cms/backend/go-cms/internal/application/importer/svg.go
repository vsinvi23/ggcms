package importer

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
)

// Inline <svg> blocks in markdown are converted to a sanitized data: URI image
// (`![SVG diagram](data:image/svg+xml;base64,...)`), which the editor already renders as an
// image block. They are deliberately NOT stored as .svg files: a stored SVG served from the
// app's own origin can run script, whereas an SVG used as <img src> cannot.

const (
	maxInlineSVGBytes = 1 << 20 // 1MB of source per SVG
	maxInlineSVGLines = 5000
	svgNamespace      = "http://www.w3.org/2000/svg"
)

var svgAllowedElements = setOf(
	"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
	"text", "tspan", "title", "desc", "defs", "linearGradient", "radialGradient", "stop",
	"clipPath", "mask", "pattern", "marker", "symbol", "use",
)

// svgTextElements are the only elements whose character data is kept.
var svgTextElements = setOf("text", "tspan", "title", "desc")

var svgAllowedAttrs = setOf(
	"id", "class", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
	"d", "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
	"stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "stroke-miterlimit", "opacity",
	"font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "alignment-baseline",
	"letter-spacing", "dx", "dy", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
	"spreadMethod", "fx", "fy", "clip-path", "clip-rule", "mask", "marker-start", "marker-mid", "marker-end",
	"markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits", "preserveAspectRatio", "patternUnits",
	"patternTransform", "clipPathUnits", "maskUnits", "style", "href", "role", "aria-label", "aria-hidden",
	"visibility", "display",
)

func setOf(vals ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(vals))
	for _, v := range vals {
		m[v] = struct{}{}
	}
	return m
}

// sanitizeSVG re-serializes an SVG document through an element/attribute allowlist. Scripts,
// foreignObject, style elements, external references, event handlers and anything else not
// listed are dropped. Returns an error if the input is not well-formed enough to parse.
func sanitizeSVG(raw string) (string, error) {
	if len(raw) > maxInlineSVGBytes {
		return "", fmt.Errorf("SVG is larger than %dKB", maxInlineSVGBytes/1024)
	}
	dec := xml.NewDecoder(strings.NewReader(raw))
	// Strict: mismatched or unclosed tags are rejected rather than silently repaired. The HTML
	// entity table is kept so named entities such as &nbsp; inside <text> still parse.
	dec.Strict = true
	dec.Entity = xml.HTMLEntity

	var out bytes.Buffer
	var stack []string // names of open, kept elements
	skipDepth := 0     // >0 while inside a dropped subtree
	sawRoot := false

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("not valid SVG/XML: %v", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if skipDepth > 0 {
				skipDepth++
				continue
			}
			name := t.Name.Local
			if !sawRoot && name != "svg" {
				return "", errors.New("root element is not <svg>")
			}
			if _, ok := svgAllowedElements[name]; !ok {
				skipDepth = 1
				continue
			}
			out.WriteByte('<')
			out.WriteString(name)
			if !sawRoot {
				out.WriteString(` xmlns="` + svgNamespace + `"`)
				sawRoot = true
			}
			for _, a := range t.Attr {
				if k, v, ok := cleanSVGAttr(a); ok {
					out.WriteString(" " + k + `="`)
					_ = xml.EscapeText(&out, []byte(v))
					out.WriteByte('"')
				}
			}
			out.WriteByte('>')
			stack = append(stack, name)
		case xml.EndElement:
			if skipDepth > 0 {
				skipDepth--
				continue
			}
			if len(stack) == 0 {
				continue
			}
			out.WriteString("</" + stack[len(stack)-1] + ">")
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if skipDepth == 0 && len(stack) > 0 {
				if _, ok := svgTextElements[stack[len(stack)-1]]; ok {
					_ = xml.EscapeText(&out, []byte(t))
				}
			}
		}
	}
	if !sawRoot {
		return "", errors.New("no <svg> element found")
	}
	if len(stack) != 0 {
		return "", errors.New("unclosed elements in SVG")
	}
	return out.String(), nil
}

// cleanSVGAttr returns the (name, value) to emit for an attribute, or ok=false to drop it.
func cleanSVGAttr(a xml.Attr) (string, string, bool) {
	name := a.Name.Local
	if a.Name.Space == "xmlns" || name == "xmlns" {
		return "", "", false // the root namespace is re-added; others are not needed
	}
	if _, ok := svgAllowedAttrs[name]; !ok {
		return "", "", false
	}
	v := a.Value
	lower := strings.ToLower(v)
	if strings.Contains(lower, "javascript:") || strings.Contains(lower, "data:") ||
		strings.Contains(lower, "@import") || strings.Contains(lower, "expression(") || strings.ContainsAny(v, "<>") {
		return "", "", false
	}
	if name == "href" { // <use href="#id"> only; never an external or scripted reference
		if !strings.HasPrefix(strings.TrimSpace(v), "#") {
			return "", "", false
		}
	}
	// url(...) is only allowed for same-document references such as fill="url(#grad)".
	for rest := lower; ; {
		i := strings.Index(rest, "url(")
		if i < 0 {
			break
		}
		rest = rest[i+4:]
		if !strings.HasPrefix(strings.TrimLeft(rest, " '\""), "#") {
			return "", "", false
		}
	}
	return name, v, true
}

func svgDataURI(svg string) string {
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}

// convertInlineSVG replaces line-leading inline <svg>...</svg> blocks in markdown with a
// sanitized data-URI image on its own line. Fenced code blocks are left untouched so SVG
// shown as a code sample stays code. Blocks that cannot be parsed are left as-is and reported.
func convertInlineSVG(body string) (string, []string) {
	if !strings.Contains(strings.ToLower(body), "<svg") {
		return body, nil
	}
	lines := strings.Split(body, "\n")
	out := make([]string, 0, len(lines))
	var warns []string
	fence := ""

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		t := strings.TrimSpace(line)

		if fence != "" {
			out = append(out, line)
			if strings.HasPrefix(t, fence) {
				fence = ""
			}
			continue
		}
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			fence = t[:3]
			out = append(out, line)
			continue
		}
		if !startsWithSVGTag(t) {
			out = append(out, line)
			continue
		}

		// Collect lines up to and including the one that contains </svg>.
		end := -1
		for j := i; j < len(lines) && j-i < maxInlineSVGLines; j++ {
			if indexFold(lines[j], "</svg>") >= 0 {
				end = j
				break
			}
		}
		if end < 0 {
			out = append(out, line) // unterminated: not ours to guess at
			continue
		}
		endLine := lines[end]
		cut := indexFold(endLine, "</svg>") + len("</svg>")
		block := append([]string{}, lines[i:end]...)
		block = append(block, endLine[:cut])
		rest := strings.TrimSpace(endLine[cut:])

		clean, err := sanitizeSVG(strings.TrimSpace(strings.Join(block, "\n")))
		if err != nil {
			warns = append(warns, fmt.Sprintf("inline <svg> starting at line %d was left unchanged: %v", i+1, err))
			out = append(out, lines[i:end+1]...)
		} else {
			out = append(out, "", "![SVG diagram]("+svgDataURI(clean)+")", "")
			if rest != "" {
				out = append(out, rest)
			}
		}
		i = end
	}
	return strings.Join(out, "\n"), warns
}

func startsWithSVGTag(trimmed string) bool {
	if len(trimmed) < 4 || !strings.EqualFold(trimmed[:4], "<svg") {
		return false
	}
	if len(trimmed) == 4 {
		return true
	}
	switch trimmed[4] {
	case ' ', '\t', '>', '\r', '\n', '/':
		return true
	}
	return false
}

func indexFold(s, substr string) int {
	return strings.Index(strings.ToLower(s), strings.ToLower(substr))
}
