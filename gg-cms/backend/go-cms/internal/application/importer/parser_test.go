package importer

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"testing"
)

func TestParseMarkdownCourseStructure(t *testing.T) {
	content := `---
title: "My Course"
type: COURSE
---

Overview paragraph before any section.

## Section: Getting started
Some intro text for the section (ignored — not a lesson body).

### Lesson: Introduction
Welcome to the course.

### Lesson: Setup
Install the tools.

## Section: Advanced topics
### Lesson: Deep dive
Go deeper here.
`
	items := Parse("course.md", []byte(content))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]

	if !item.Valid {
		t.Fatalf("expected valid item, got error: %s", item.Error)
	}
	if item.Type != "COURSE" {
		t.Fatalf("expected type COURSE, got %s", item.Type)
	}
	if item.BodyFormat != "markdown" {
		t.Fatalf("expected bodyFormat markdown, got %s", item.BodyFormat)
	}
	if item.Body != "Overview paragraph before any section." {
		t.Fatalf("unexpected overview body: %q", item.Body)
	}
	if len(item.Sections) != 2 {
		t.Fatalf("expected 2 sections, got %d", len(item.Sections))
	}

	sec1 := item.Sections[0]
	if sec1.Title != "Getting started" {
		t.Fatalf("unexpected section 1 title: %q", sec1.Title)
	}
	if len(sec1.Lessons) != 2 {
		t.Fatalf("expected 2 lessons in section 1, got %d", len(sec1.Lessons))
	}
	if sec1.Lessons[0].Title != "Introduction" || sec1.Lessons[0].Body != "Welcome to the course." {
		t.Fatalf("unexpected lesson 1: %+v", sec1.Lessons[0])
	}
	if sec1.Lessons[1].Title != "Setup" || sec1.Lessons[1].Body != "Install the tools." {
		t.Fatalf("unexpected lesson 2: %+v", sec1.Lessons[1])
	}

	sec2 := item.Sections[1]
	if sec2.Title != "Advanced topics" {
		t.Fatalf("unexpected section 2 title: %q", sec2.Title)
	}
	if len(sec2.Lessons) != 1 || sec2.Lessons[0].Title != "Deep dive" {
		t.Fatalf("unexpected section 2 lessons: %+v", sec2.Lessons)
	}
}

func TestParseMarkdownArticleUnaffectedByCourseHeadings(t *testing.T) {
	content := `---
title: "My Article"
type: ARTICLE
---

Just a plain article body with a heading below.

## Section: not really a course section`
	items := Parse("article.md", []byte(content))
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item, got error: %s", item.Error)
	}
	if len(item.Sections) != 0 {
		t.Fatalf("expected no sections for ARTICLE, got %d", len(item.Sections))
	}
	if item.Body == "" {
		t.Fatalf("expected non-empty article body")
	}
}

func TestParseJSONCourseNestedSections(t *testing.T) {
	content := `[
		{
			"type": "COURSE",
			"title": "My Course",
			"body": "Course overview",
			"sections": [
				{
					"title": "Section A",
					"order": 0,
					"lessons": [
						{"title": "Lesson A1", "type": "video", "duration": 10, "order": 0, "body": "video body"},
						{"title": "Lesson A2", "order": 1, "body": "text body"}
					]
				}
			]
		}
	]`
	items := Parse("course.json", []byte(content))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item, got error: %s", item.Error)
	}
	if item.BodyFormat != "json" {
		t.Fatalf("expected bodyFormat json, got %s", item.BodyFormat)
	}
	if len(item.Sections) != 1 || len(item.Sections[0].Lessons) != 2 {
		t.Fatalf("unexpected sections: %+v", item.Sections)
	}
	if item.Sections[0].Lessons[0].Type != "video" {
		t.Fatalf("expected explicit lesson type preserved, got %q", item.Sections[0].Lessons[0].Type)
	}
	if item.Sections[0].Lessons[1].Type != "text" {
		t.Fatalf("expected default lesson type 'text', got %q", item.Sections[0].Lessons[1].Type)
	}
}

func TestValidateFillsEmptySectionTitle(t *testing.T) {
	content := `[
		{
			"type": "COURSE",
			"title": "My Course",
			"sections": [
				{"title": "", "order": 0, "lessons": []}
			]
		}
	]`
	items := Parse("course.json", []byte(content))
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item with fallback section title, got error: %s", item.Error)
	}
	if item.Sections[0].Title != "Section 1" {
		t.Fatalf("expected fallback section title 'Section 1', got %q", item.Sections[0].Title)
	}
}

func TestValidateFillsEmptyLessonTitle(t *testing.T) {
	content := `[
		{
			"type": "COURSE",
			"title": "My Course",
			"sections": [
				{"title": "Section A", "order": 0, "lessons": [
					{"title": "", "order": 0, "body": "x"}
				]}
			]
		}
	]`
	items := Parse("course.json", []byte(content))
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item with fallback lesson title, got error: %s", item.Error)
	}
	if item.Sections[0].Lessons[0].Title != "Lesson 1" {
		t.Fatalf("expected fallback lesson title 'Lesson 1', got %q", item.Sections[0].Lessons[0].Title)
	}
}

func TestParseCSVSetsFlatBodyFormat(t *testing.T) {
	content := "type,title,categorySlug,description,articleType,body\nARTICLE,My Article,backend,Summary,standard,Body text\n"
	items := Parse("articles.csv", []byte(content))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].BodyFormat != "csv-flat" {
		t.Fatalf("expected bodyFormat csv-flat, got %s", items[0].BodyFormat)
	}
	if len(items[0].Sections) != 0 {
		t.Fatalf("expected no sections from CSV, got %d", len(items[0].Sections))
	}
}

func TestParseHTMLArticle(t *testing.T) {
	content := `<!DOCTYPE html>
<html>
<head>
	<title>HTML Article Title</title>
	<meta name="description" content="HTML article summary">
	<meta name="category" content="frontend">
	<meta name="article-type" content="guide">
	<meta name="tags" content="html, web, css">
</head>
<body>
	<h1>Main Header</h1>
	<p>This is the HTML body content.</p>
</body>
</html>`
	items := Parse("page.html", []byte(content))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item, got error: %s", item.Error)
	}
	if item.Title != "HTML Article Title" {
		t.Fatalf("unexpected title: %q", item.Title)
	}
	if item.Description != "HTML article summary" {
		t.Fatalf("unexpected description: %q", item.Description)
	}
	if item.CategorySlug != "frontend" {
		t.Fatalf("unexpected category slug: %q", item.CategorySlug)
	}
	if item.ArticleType != "guide" {
		t.Fatalf("unexpected article type: %q", item.ArticleType)
	}
	if len(item.Tags) != 3 || item.Tags[0] != "html" {
		t.Fatalf("unexpected tags: %+v", item.Tags)
	}
	if item.BodyFormat != "html" {
		t.Fatalf("expected bodyFormat html, got %s", item.BodyFormat)
	}
}

func TestParseUnsupportedFileType(t *testing.T) {
	items := Parse("image.png", []byte("fake image data"))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]
	if item.Valid {
		t.Fatalf("expected invalid item for unsupported file extension")
	}
	if item.Error == "" {
		t.Fatalf("expected error message for unsupported file")
	}
}

func TestParseMarkdownCourseStructureNilSectionProtection(t *testing.T) {
	// Markdown course with a lesson heading before any section heading
	content := `---
title: "Orphan Lesson Course"
type: COURSE
---
### Lesson: Orphan Lesson
Some lesson body without prior section.
`
	items := Parse("orphan.md", []byte(content))
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	item := items[0]
	if !item.Valid {
		t.Fatalf("expected valid item, got error: %s", item.Error)
	}
	if len(item.Sections) != 1 {
		t.Fatalf("expected 1 implicit section, got %d", len(item.Sections))
	}
}

func TestParseZIPWithMultipleFormats(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// Add Markdown file
	f1, err := zw.Create("article1.md")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f1.Write([]byte("# ZIP Markdown Title\nBody content from zip"))

	// Add JSON file inside subfolder
	f2, err := zw.Create("docs/article2.json")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f2.Write([]byte(`{"title":"ZIP JSON Title","body":"JSON body inside zip"}`))

	// Add HTML file
	f3, err := zw.Create("page.html")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f3.Write([]byte(`<html><head><title>ZIP HTML Title</title></head><body>HTML body</body></html>`))

	// Add unsupported file (e.g. image.png)
	f4, err := zw.Create("image.png")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f4.Write([]byte("fake binary data"))

	// Add Mac OS metadata file (should be skipped)
	f5, err := zw.Create("__MACOSX/._article1.md")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f5.Write([]byte("mac metadata"))

	if err := zw.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}

	items := Parse("bundle.zip", buf.Bytes())
	if len(items) != 3 { // article1.md, docs/article2.json, page.html (image.png skipped)
		t.Fatalf("expected 3 valid content items extracted from zip, got %d", len(items))
	}

	for _, item := range items {
		if !item.Valid {
			t.Fatalf("expected item %s to be valid, got error: %s", item.FileName, item.Error)
		}
	}
}

func TestParseZIP_SecurityZipSlip(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// Attempt path traversal inside zip
	f, err := zw.Create("../../../etc/passwd.md")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	f.Write([]byte("# Malicious File\ncontent"))

	if err := zw.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}

	items := Parse("malicious.zip", buf.Bytes())
	if len(items) == 0 || items[0].Valid {
		t.Fatalf("expected Zip Slip detection to mark item as invalid, got %+v", items)
	}
	if !strings.Contains(items[0].Error, "Zip Slip") && !strings.Contains(items[0].Error, "traversal") {
		t.Fatalf("expected Zip Slip error message, got: %s", items[0].Error)
	}
}

func TestParseZIP_SecurityMaxEntries(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// Create 501 entries to exceed limit of 500
	for i := 0; i < 501; i++ {
		f, err := zw.Create(fmt.Sprintf("file_%d.md", i))
		if err != nil {
			t.Fatalf("failed to create entry %d: %v", i, err)
		}
		f.Write([]byte("# Test\nBody"))
	}

	if err := zw.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}

	items := Parse("bomb.zip", buf.Bytes())
	if len(items) == 0 || items[0].Valid {
		t.Fatalf("expected archive with > 500 entries to be rejected, got: %+v", items)
	}
	if !strings.Contains(items[0].Error, "maximum allowed") {
		t.Fatalf("expected max entries error, got: %s", items[0].Error)
	}
}



