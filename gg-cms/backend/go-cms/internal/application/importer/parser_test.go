package importer

import "testing"

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

func TestValidateRejectsEmptySectionTitle(t *testing.T) {
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
	if item.Valid {
		t.Fatalf("expected invalid item due to empty section title")
	}
	if item.Error == "" {
		t.Fatalf("expected a validation error message")
	}
}

func TestValidateRejectsEmptyLessonTitle(t *testing.T) {
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
	if item.Valid {
		t.Fatalf("expected invalid item due to empty lesson title")
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
