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
	CategorySlug string
	ArticleType  string
	CourseType   string
	Tags         []string
	Valid         bool
	Error         string
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
		FileName: filename,
		Type:     "ARTICLE",
		Valid:     true,
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

	validate(&item)
	return item
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
	Type         string   `json:"type"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Body         string   `json:"body"`
	CategorySlug string   `json:"categorySlug"`
	ArticleType  string   `json:"articleType"`
	CourseType   string   `json:"courseType"`
	Tags         []string `json:"tags"`
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
		CategorySlug: ji.CategorySlug,
		ArticleType:  ji.ArticleType,
		CourseType:   ji.CourseType,
		Tags:         ji.Tags,
		Valid:         true,
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
	item.Valid = true
	item.Error = ""
}
