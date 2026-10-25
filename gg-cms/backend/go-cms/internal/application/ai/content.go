package ai

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"

	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	"github.com/serenya/go-cms/internal/domain/entity"
)

type ContentDoc struct {
	Type        entity.CMSType
	ID          uint
	PublicID    string
	Slug        string
	Title       string
	Description string
	Body        string
	Status      string
	CategoryID  *uint
	CreatedByID uint
	ReviewerID  *uint
}

type ContentReader interface {
	Get(ctx context.Context, cmsType entity.CMSType, id uint) (*ContentDoc, error)
}

type cmsReader struct{ svc cmssvc.Service }

func NewCMSReader(svc cmssvc.Service) ContentReader { return &cmsReader{svc: svc} }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (r *cmsReader) Get(ctx context.Context, t entity.CMSType, id uint) (*ContentDoc, error) {
	item, err := r.svc.GetByID(ctx, id, t)
	if err != nil {
		return nil, ErrNotFound
	}
	switch v := item.(type) {
	case *entity.Course:
		return &ContentDoc{Type: t, ID: v.ID, PublicID: v.PublicID, Slug: v.Slug, Title: v.Title, Description: deref(v.Description), Body: deref(v.Body), Status: string(v.Status), CategoryID: v.CategoryID, CreatedByID: v.CreatedByID, ReviewerID: v.ReviewerID}, nil
	case *entity.Article:
		return &ContentDoc{Type: t, ID: v.ID, PublicID: v.PublicID, Slug: v.Slug, Title: v.Title, Description: deref(v.Description), Body: deref(v.Body), Status: string(v.Status), CategoryID: v.CategoryID, CreatedByID: v.CreatedByID, ReviewerID: v.ReviewerID}, nil
	}
	return nil, ErrNotFound
}

func ParseContentType(s string) (entity.CMSType, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "article":
		return entity.CMSTypeArticle, true
	case "course":
		return entity.CMSTypeCourse, true
	}
	return "", false
}

type block struct {
	Type      string   `json:"type"`
	Content   string   `json:"content"`
	ListItems []string `json:"listItems"`
	CodeData  *struct {
		Language string `json:"language"`
		Code     string `json:"code"`
	} `json:"codeData"`
	TableData *struct {
		Headers []string   `json:"headers"`
		Rows    [][]string `json:"rows"`
	} `json:"tableData"`
}

var (
	htmlStripRe = regexp.MustCompile(`(?s)<[^>]*>`)
)

func BodyToMarkdown(body string) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return ""
	}
	if !strings.HasPrefix(body, "[") {
		return strings.TrimSpace(lessonToMarkdown(body))
	}
	var blocks []block
	if err := json.Unmarshal([]byte(body), &blocks); err != nil {
		return body
	}
	var b strings.Builder
	for _, bl := range blocks {
		text := strings.TrimSpace(htmlStripRe.ReplaceAllString(bl.Content, ""))
		switch bl.Type {
		case "heading1":
			b.WriteString("# " + text + "\n\n")
		case "heading2":
			b.WriteString("## " + text + "\n\n")
		case "heading3":
			b.WriteString("### " + text + "\n\n")
		case "code":
			code, lang := text, ""
			if bl.CodeData != nil {
				code, lang = bl.CodeData.Code, bl.CodeData.Language
			}
			b.WriteString("```" + lang + "\n" + code + "\n```\n\n")
		case "quote":
			b.WriteString("> " + text + "\n\n")
		case "list", "ordered-list":
			for i, it := range bl.ListItems {
				it = strings.TrimSpace(htmlStripRe.ReplaceAllString(it, ""))
				if bl.Type == "ordered-list" {
					b.WriteString(strconv.Itoa(i+1) + ". " + it + "\n")
				} else {
					b.WriteString("- " + it + "\n")
				}
			}
			b.WriteString("\n")
		case "table":
			if bl.TableData != nil {
				b.WriteString(strings.Join(bl.TableData.Headers, " | ") + "\n")
				for _, row := range bl.TableData.Rows {
					b.WriteString(strings.Join(row, " | ") + "\n")
				}
				b.WriteString("\n")
			}
		case "image", "divider":
		default:
			if text != "" {
				b.WriteString(text + "\n\n")
			}
		}
	}
	return strings.TrimSpace(b.String())
}

func canEdit(doc *ContentDoc, userID uint, admin bool) bool {
	if admin || doc.CreatedByID == userID {
		return true
	}
	return doc.ReviewerID != nil && *doc.ReviewerID == userID
}
