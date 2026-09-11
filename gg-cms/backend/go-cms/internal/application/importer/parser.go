package importer

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"path/filepath"
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
	Tags         []string
	Sections     []ParsedSection
	Valid         bool
	Error         string
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
	default:
		return []ParsedItem{{
			FileName: filename,
			Valid:     false,
			Error:     fmt.Sprintf("unsupported file type %q — use .md, .json, or .csv", ext),
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
				curSection = &ParsedSection{Title: "", Order: len(sections)}
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
		Valid:     false,
		Error:     "invalid JSON: expected an object or array of objects",
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
		Tags:         ji.Tags,
		Valid:         true,
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
		msg := "invalid CSV or empty file"
		if err != nil {
			msg = "CSV parse error: " + err.Error()
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
			Valid:         true,
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
		item.Valid = false
		item.Error = "title is required"
		return
	}
	if item.Type != "ARTICLE" && item.Type != "COURSE" && item.Type != "VIDEO" {
		item.Valid = false
		item.Error = fmt.Sprintf("unknown type %q — expected ARTICLE, COURSE, or VIDEO", item.Type)
		return
	}
	for si, sec := range item.Sections {
		if sec.Title == "" {
			item.Valid = false
			item.Error = fmt.Sprintf("section %d: title is required", si+1)
			return
		}
		for li, lesson := range sec.Lessons {
			if lesson.Title == "" {
				item.Valid = false
				item.Error = fmt.Sprintf("section %d, lesson %d: title is required", si+1, li+1)
				return
			}
		}
	}
	item.Valid = true
	item.Error = ""
}
