package importer

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
)

type ParsedItem struct {
	FileName     string
	Type         string
	Title        string
	Description  string
	Body         string
	BodyFormat   string
	CategorySlug string
	ArticleType  string
	CourseType   string
	Status       string
	Tags         []string
	Sections     []ParsedSection
	Valid        bool
	Error        string
}

// ParsedLesson is a lesson parsed from a COURSE import's markdown/JSON structure.
type ParsedLesson struct {
	Title    string
	Type     string
	Duration int
	Order    int
	Body     string
}

// ParsedSection is a section parsed from a COURSE import's markdown/JSON structure.
type ParsedSection struct {
	Title   string
	Order   int
	Lessons []ParsedLesson
}

// Parse dispatches to the correct parser based on file extension.
func Parse(filename string, content []byte) []ParsedItem {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".md", ".markdown":
		return []ParsedItem{parseMarkdown(filename, string(content))}
	case ".json":
		return parseJSON(filename, content)
	case ".csv":
		return parseCSV(filename, content)
	case ".html", ".htm":
		return []ParsedItem{parseHTML(filename, string(content))}
	case ".zip":
		return parseZIP(filename, content)
	default:
		return []ParsedItem{{
			FileName: filename,
			Valid:    false,
			Error:    fmt.Sprintf("Wrong format: unsupported file type %q — expected .md, .json, .csv, .html, or .zip", ext),
		}}
	}
}

func parseMarkdown(filename, content string) ParsedItem {
	item := ParsedItem{
		FileName:   filename,
		Type:       "ARTICLE",
		BodyFormat: "markdown",
		Valid:       true,
	}

	content = strings.TrimSpace(content)

	// Extract YAML frontmatter between --- delimiters
	if strings.HasPrefix(content, "---") {
		rest := content[3:]
		if idx := strings.Index(rest, "---"); idx != -1 {
			parseFrontmatter(rest[:idx], &item)
			item.Body = strings.TrimSpace(rest[idx+3:])
		} else {
			item.Body = content
		}
	} else {
		item.Body = content
	}

	// Fall back to first # heading as title
	if item.Title == "" {
		for _, line := range strings.Split(item.Body, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "# ") {
				item.Title = strings.TrimPrefix(line, "# ")
				break
			}
		}
	}

	// Fall back to filename (without extension) as title
	if item.Title == "" {
		base := filepath.Base(filename)
		item.Title = strings.TrimSuffix(base, filepath.Ext(base))
	}

	if item.Type == "COURSE" {
		overview, sections := parseMarkdownCourseStructure(item.Body)
		item.Body = overview
		item.Sections = sections
	}

	validate(&item)
	return item
}

// parseMarkdownCourseStructure splits a COURSE markdown body into a flat overview
// (any content before the first "## Section:" heading) and a tree of sections/lessons.
// Convention: "## Section: <title>" starts a section, "### Lesson: <title>" starts a
// lesson within the current section; all text until the next heading is that lesson's
// (or, before any section heading, the course's) markdown body.
func parseMarkdownCourseStructure(body string) (string, []ParsedSection) {
	const sectionPrefix = "## Section:"
	const lessonPrefix = "### Lesson:"

	lines := strings.Split(body, "\n")

	var overviewLines []string
	var sections []ParsedSection
	var curSection *ParsedSection
	var curLesson *ParsedLesson
	var buf []string

	flushLesson := func() {
		if curLesson != nil {
			if curSection == nil {
				curSection = &ParsedSection{Title: fmt.Sprintf("Section %d", len(sections)+1), Order: len(sections)}
			}
			curLesson.Body = strings.TrimSpace(strings.Join(buf, "\n"))
			curSection.Lessons = append(curSection.Lessons, *curLesson)
			curLesson = nil
		}
		buf = nil
	}
	flushSection := func() {
		flushLesson()
		if curSection != nil {
			sections = append(sections, *curSection)
			curSection = nil
		}
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, sectionPrefix):
			flushSection()
			title := strings.TrimSpace(strings.TrimPrefix(trimmed, sectionPrefix))
			curSection = &ParsedSection{Title: title, Order: len(sections)}
			buf = nil
		case strings.HasPrefix(trimmed, lessonPrefix):
			if curSection == nil {
				// Lesson heading with no enclosing section — start an implicit one.
				curSection = &ParsedSection{Title: fmt.Sprintf("Section %d", len(sections)+1), Order: len(sections)}
			}
			flushLesson()
			title := strings.TrimSpace(strings.TrimPrefix(trimmed, lessonPrefix))
			curLesson = &ParsedLesson{Title: title, Type: "text", Order: len(curSection.Lessons)}
			buf = nil
		default:
			if curSection == nil {
				overviewLines = append(overviewLines, line)
			} else {
				buf = append(buf, line)
			}
		}
	}
	flushSection()

	overview := strings.TrimSpace(strings.Join(overviewLines, "\n"))
	return overview, sections
}

func parseFrontmatter(fm string, item *ParsedItem) {
	for _, line := range strings.Split(fm, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)

		switch key {
		case "title":
			item.Title = val
		case "description":
			item.Description = val
		case "type":
			item.Type = strings.ToUpper(val)
		case "category", "categorySlug", "category_slug":
			item.CategorySlug = val
		case "articleType", "article_type":
			item.ArticleType = val
		case "courseType", "course_type":
			item.CourseType = val
		case "status", "state":
			item.Status = strings.ToUpper(val)
		case "tags":
			val = strings.Trim(val, "[]")
			for _, t := range strings.Split(val, ",") {
				tag := strings.TrimSpace(strings.Trim(t, `"'`))
				if tag != "" {
					item.Tags = append(item.Tags, tag)
				}
			}
		}
	}
}

type jsonImportItem struct {
	Type         string             `json:"type"`
	Title        string             `json:"title"`
	Description  string             `json:"description"`
	Body         string             `json:"body"`
	CategorySlug string             `json:"categorySlug"`
	ArticleType  string             `json:"articleType"`
	CourseType   string             `json:"courseType"`
	Status       string             `json:"status"`
	Tags         []string           `json:"tags"`
	Sections     []jsonSectionItem  `json:"sections"`
}

type jsonLessonItem struct {
	Title    string `json:"title"`
	Type     string `json:"type"`
	Duration int    `json:"duration"`
	Order    int    `json:"order"`
	Body     string `json:"body"`
}

type jsonSectionItem struct {
	Title   string            `json:"title"`
	Order   int               `json:"order"`
	Lessons []jsonLessonItem  `json:"lessons"`
}

func parseJSON(filename string, content []byte) []ParsedItem {
	// Try array first
	var arr []jsonImportItem
	if err := json.Unmarshal(content, &arr); err == nil {
		items := make([]ParsedItem, len(arr))
		for i, ji := range arr {
			items[i] = jsonToItem(filename, ji)
		}
		return items
	}
	// Try single object
	var single jsonImportItem
	if err := json.Unmarshal(content, &single); err == nil {
		return []ParsedItem{jsonToItem(filename, single)}
	}
	return []ParsedItem{{
		FileName: filename,
		Valid:    false,
		Error:    "Wrong format: invalid JSON — expected an object or array of objects",
	}}
}

func jsonToItem(filename string, ji jsonImportItem) ParsedItem {
	t := strings.ToUpper(ji.Type)
	if t == "" {
		t = "ARTICLE"
	}
	item := ParsedItem{
		FileName:     filename,
		Type:         t,
		Title:        ji.Title,
		Description:  ji.Description,
		Body:         ji.Body,
		BodyFormat:   "json",
		CategorySlug: ji.CategorySlug,
		ArticleType:  ji.ArticleType,
		CourseType:   ji.CourseType,
		Status:       strings.ToUpper(ji.Status),
		Tags:         ji.Tags,
		Valid:        true,
	}
	if t == "COURSE" && len(ji.Sections) > 0 {
		item.Sections = make([]ParsedSection, len(ji.Sections))
		for i, js := range ji.Sections {
			lessons := make([]ParsedLesson, len(js.Lessons))
			for j, jl := range js.Lessons {
				lessonType := jl.Type
				if lessonType == "" {
					lessonType = "text"
				}
				lessons[j] = ParsedLesson{
					Title:    jl.Title,
					Type:     lessonType,
					Duration: jl.Duration,
					Order:    jl.Order,
					Body:     jl.Body,
				}
			}
			item.Sections[i] = ParsedSection{Title: js.Title, Order: js.Order, Lessons: lessons}
		}
	}
	validate(&item)
	return item
}

func parseCSV(filename string, content []byte) []ParsedItem {
	r := csv.NewReader(strings.NewReader(string(content)))
	r.TrimLeadingSpace = true

	records, err := r.ReadAll()
	if err != nil || len(records) < 2 {
		msg := "Wrong format: invalid CSV or empty file"
		if err != nil {
			msg = "Wrong format: CSV parse error — " + err.Error()
		}
		return []ParsedItem{{FileName: filename, Valid: false, Error: msg}}
	}

	// Build lowercase header→column index map
	header := records[0]
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}

	get := func(row []string, keys ...string) string {
		for _, k := range keys {
			if i, ok := idx[k]; ok && i < len(row) {
				return strings.TrimSpace(row[i])
			}
		}
		return ""
	}

	var items []ParsedItem
	for _, row := range records[1:] {
		if len(row) == 0 {
			continue
		}
		t := strings.ToUpper(get(row, "type"))
		if t == "" {
			t = "ARTICLE"
		}
		item := ParsedItem{
			FileName:     filename,
			Type:         t,
			Title:        get(row, "title"),
			Description:  get(row, "description"),
			Body:         get(row, "body"),
			BodyFormat:   "csv-flat",
			CategorySlug: get(row, "categoryslug", "category"),
			ArticleType:  get(row, "articletype", "article_type"),
			CourseType:   get(row, "coursetype", "course_type"),
			Status:       strings.ToUpper(get(row, "status", "state")),
			Valid:        true,
		}
		// Tags are semicolon-separated inside CSV cells
		if tags := get(row, "tags"); tags != "" {
			for _, t := range strings.Split(tags, ";") {
				tag := strings.TrimSpace(t)
				if tag != "" {
					item.Tags = append(item.Tags, tag)
				}
			}
		}
		validate(&item)
		items = append(items, item)
	}
	return items
}

func validate(item *ParsedItem) {
	if item.Title == "" {
		base := filepath.Base(item.FileName)
		item.Title = strings.TrimSuffix(base, filepath.Ext(base))
		if item.Title == "" {
			item.Title = "Untitled Content"
		}
	}
	if item.Type != "ARTICLE" && item.Type != "COURSE" && item.Type != "VIDEO" {
		item.Type = "ARTICLE"
	}
	for si, sec := range item.Sections {
		if sec.Title == "" {
			item.Sections[si].Title = fmt.Sprintf("Section %d", si+1)
		}
		for li, lesson := range sec.Lessons {
			if lesson.Title == "" {
				item.Sections[si].Lessons[li].Title = fmt.Sprintf("Lesson %d", li+1)
			}
		}
	}
	item.Valid = true
	item.Error = ""
}

const (
	maxZipEntries            = 500
	maxZipSingleFileSize     = 10 * 1024 * 1024 // 10MB per individual file
	maxZipTotalUncompressed  = 50 * 1024 * 1024 // 50MB max total uncompressed archive size
	maxZipDecompressionRatio = 100              // Max 100:1 ratio to prevent decompression bombs
)

func parseZIP(filename string, content []byte) []ParsedItem {
	r, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return []ParsedItem{{
			FileName: filename,
			Valid:    false,
			Error:    fmt.Sprintf("Wrong format: invalid zip archive (%v)", err),
		}}
	}

	// Security Check 1: Max entries limit
	if len(r.File) > maxZipEntries {
		return []ParsedItem{{
			FileName: filename,
			Valid:    false,
			Error:    fmt.Sprintf("Security error: ZIP archive contains %d files (maximum allowed is %d)", len(r.File), maxZipEntries),
		}}
	}

	var items []ParsedItem
	var totalUncompressedSize uint64

	for _, f := range r.File {
		// Security Check 2: Skip directories and non-regular files (symlinks, FIFO, devices)
		if f.FileInfo().IsDir() || !f.Mode().IsRegular() {
			continue
		}

		base := filepath.Base(f.Name)
		if strings.HasPrefix(f.Name, "__MACOSX/") || strings.HasPrefix(base, "._") || base == ".DS_Store" || strings.HasPrefix(base, ".") {
			continue
		}

		// Security Check 3: Zip Slip / Path Traversal Prevention
		cleanPath := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanPath, "..") || strings.Contains(f.Name, "../") || strings.Contains(f.Name, "..\\") || strings.HasPrefix(cleanPath, "/") || filepath.IsAbs(f.Name) {
			return []ParsedItem{{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Security error: Zip Slip / Path traversal attempt detected in entry %q", f.Name),
			}}
		}

		ext := strings.ToLower(filepath.Ext(f.Name))
		// Security Check 4: Disallow recursive nested zip archives
		if ext == ".zip" {
			continue
		}

		if ext != ".md" && ext != ".markdown" && ext != ".json" && ext != ".csv" && ext != ".html" && ext != ".htm" {
			// Skip unsupported asset files (images, binary assets) inside zip
			continue
		}

		// Security Check 5: Declared header uncompressed size limits
		if f.UncompressedSize64 > maxZipSingleFileSize {
			return []ParsedItem{{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Security error: File %q exceeds maximum allowed single file size of 10MB (%d bytes)", f.Name, f.UncompressedSize64),
			}}
		}

		if totalUncompressedSize+f.UncompressedSize64 > maxZipTotalUncompressed {
			return []ParsedItem{{
				FileName: filename,
				Valid:    false,
				Error:    fmt.Sprintf("Security error: Total uncompressed archive size exceeds limit of 50MB"),
			}}
		}

		rc, err := f.Open()
		if err != nil {
			items = append(items, ParsedItem{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Wrong format: failed to open file inside zip (%v)", err),
			})
			continue
		}

		// Security Check 6: Enforce size limit during decompression with LimitReader (protects against deceptive headers)
		limitedReader := io.LimitReader(rc, maxZipSingleFileSize+1)
		fileBytes, readErr := io.ReadAll(limitedReader)
		rc.Close()

		if readErr != nil {
			items = append(items, ParsedItem{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Wrong format: failed to read file inside zip (%v)", readErr),
			})
			continue
		}

		if uint64(len(fileBytes)) > maxZipSingleFileSize {
			return []ParsedItem{{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Security error: File %q exceeded 10MB limit during extraction (decompression bomb protection)", f.Name),
			}}
		}

		totalUncompressedSize += uint64(len(fileBytes))
		if totalUncompressedSize > maxZipTotalUncompressed {
			return []ParsedItem{{
				FileName: filename,
				Valid:    false,
				Error:    "Security error: Total uncompressed archive size exceeded 50MB during extraction (decompression bomb protection)",
			}}
		}

		// Security Check 7: Decompression ratio check
		if f.CompressedSize64 > 0 && (uint64(len(fileBytes))/f.CompressedSize64) > maxZipDecompressionRatio {
			return []ParsedItem{{
				FileName: f.Name,
				Valid:    false,
				Error:    fmt.Sprintf("Security error: Suspicious compression ratio detected for %q (decompression bomb protection)", f.Name),
			}}
		}

		parsed := Parse(f.Name, fileBytes)
		items = append(items, parsed...)
	}

	if len(items) == 0 {
		return []ParsedItem{{
			FileName: filename,
			Valid:    false,
			Error:    "Wrong format: no importable content files (.md, .json, .csv, .html) found inside zip archive",
		}}
	}

	return items
}

func parseHTML(filename, content string) ParsedItem {
	item := ParsedItem{
		FileName:   filename,
		Type:       "ARTICLE",
		BodyFormat: "html",
		Valid:      true,
	}

	trimmed := strings.TrimSpace(content)

	// Check for HTML comment YAML frontmatter <!-- --- ... --- -->
	if strings.HasPrefix(trimmed, "<!--") {
		endComment := strings.Index(trimmed, "-->")
		if endComment != -1 {
			commentBody := strings.TrimSpace(trimmed[4:endComment])
			if strings.HasPrefix(commentBody, "---") {
				rest := commentBody[3:]
				if idx := strings.Index(rest, "---"); idx != -1 {
					parseFrontmatter(rest[:idx], &item)
				}
			}
		}
	}

	// Extract meta tags from HTML head
	extractHTMLMeta(content, &item)

	// Extract title from <title> or <h1> if not already set
	if item.Title == "" {
		item.Title = extractHTMLTagContent(content, "title")
	}
	if item.Title == "" {
		item.Title = extractHTMLTagContent(content, "h1")
	}

	// Fall back to filename (without extension) as title
	if item.Title == "" {
		base := filepath.Base(filename)
		item.Title = strings.TrimSuffix(base, filepath.Ext(base))
	}

	// Extract body content from <body>...</body> or full content
	bodyContent := extractHTMLTagContent(content, "body")
	if bodyContent != "" {
		item.Body = strings.TrimSpace(bodyContent)
	} else {
		item.Body = trimmed
	}

	if item.Type == "COURSE" {
		overview, sections := parseMarkdownCourseStructure(item.Body)
		item.Body = overview
		item.Sections = sections
	}

	validate(&item)
	return item
}

func extractHTMLMeta(html string, item *ParsedItem) {
	metaRegex := regexp.MustCompile(`(?i)<meta\s+[^>]*name=["']([^"']+)["']\s+[^>]*content=["']([^"']+)["']`)
	matches := metaRegex.FindAllStringSubmatch(html, -1)
	for _, m := range matches {
		if len(m) < 3 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(m[1]))
		val := strings.TrimSpace(m[2])
		applyMetaKV(key, val, item)
	}

	metaRegexRev := regexp.MustCompile(`(?i)<meta\s+[^>]*content=["']([^"']+)["']\s+[^>]*name=["']([^"']+)["']`)
	matchesRev := metaRegexRev.FindAllStringSubmatch(html, -1)
	for _, m := range matchesRev {
		if len(m) < 3 {
			continue
		}
		val := strings.TrimSpace(m[1])
		key := strings.ToLower(strings.TrimSpace(m[2]))
		applyMetaKV(key, val, item)
	}
}

func applyMetaKV(key, val string, item *ParsedItem) {
	switch key {
	case "title":
		if item.Title == "" {
			item.Title = val
		}
	case "description", "summary":
		if item.Description == "" {
			item.Description = val
		}
	case "type":
		item.Type = strings.ToUpper(val)
	case "category", "categoryslug", "category_slug", "category-slug":
		if item.CategorySlug == "" {
			item.CategorySlug = val
		}
	case "articletype", "article_type", "article-type":
		if item.ArticleType == "" {
			item.ArticleType = val
		}
	case "coursetype", "course_type", "course-type":
		if item.CourseType == "" {
			item.CourseType = val
		}
	case "keywords", "tags":
		if len(item.Tags) == 0 {
			for _, t := range strings.Split(val, ",") {
				tag := strings.TrimSpace(t)
				if tag != "" {
					item.Tags = append(item.Tags, tag)
				}
			}
		}
	}
}

func extractHTMLTagContent(html, tag string) string {
	pattern := fmt.Sprintf(`(?i)<%s[^>]*>([\s\S]*?)</%s>`, tag, tag)
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(html)
	if len(match) > 1 {
		// Strip nested HTML tags if extracting title or h1
		if tag == "title" || tag == "h1" {
			tagRegex := regexp.MustCompile(`<[^>]*>`)
			return strings.TrimSpace(tagRegex.ReplaceAllString(match[1], ""))
		}
		return strings.TrimSpace(match[1])
	}
	return ""
}

