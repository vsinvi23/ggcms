package notification

import (
	"bytes"
	"errors"
	"fmt"
	"html"
	"html/template"
	"regexp"
	"strings"
	ttemplate "text/template"
)

const (
	TplRaw              = "raw"
	TplWelcome          = "welcome"
	TplReset            = "reset"
	TplCompletion       = "completion"
	TplReviewDecision   = "review_decision"
	TplReviewAssigned   = "review_assigned"
	TplContentPublished = "content_published"
	TplComment          = "comment"
	TplEnrollment       = "enrollment"
	TplDigest           = "digest"
)

var ErrUnknownTemplate = errors.New("unknown email template")

type tplDef struct {
	subject string
	heading string
	action  string
}

var tplDefs = map[string]tplDef{
	TplWelcome:          {"Welcome to GeekGully", "Welcome aboard, {{.Name}}", "Start learning"},
	TplReset:            {"Reset your password", "Reset your password", "Choose a new password"},
	TplCompletion:       {"You completed {{.Title}}", "Course completed", "View your progress"},
	TplReviewDecision:   {"Review decision: {{.Title}}", "A review decision was made", "Open the content"},
	TplReviewAssigned:   {"You were assigned a review: {{.Title}}", "New review assignment", "Open the review"},
	TplContentPublished: {"Published: {{.Title}}", "Your content is live", "View it"},
	TplComment:          {"{{.Title}}", "New comment activity", "View the discussion"},
	TplEnrollment:       {"You are enrolled: {{.Title}}", "Enrollment confirmed", "Continue learning"},
	TplDigest:           {"Your weekly learning digest", "What is new for you", "Browse more"},
}

const htmlLayout = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td><h2 style="margin:0 0 16px;font-size:20px">{{.Heading}}</h2>
{{if .Message}}<p style="font-size:15px;line-height:1.5;margin:0 0 16px">{{.Message}}</p>{{end}}
{{if .Items}}<ul style="padding-left:18px;margin:0 0 16px">{{range .Items}}<li style="margin-bottom:8px"><a href="{{.URL}}">{{.Title}}</a></li>{{end}}</ul>{{end}}
{{if .ActionURL}}<p style="margin:20px 0"><a href="{{.ActionURL}}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">{{.ActionLabel}}</a></p>{{end}}
{{if .UnsubscribeURL}}<p style="font-size:12px;color:#6b7280;margin-top:28px">You receive this because of your notification settings. <a href="{{.UnsubscribeURL}}">Unsubscribe from emails</a>.</p>{{end}}
</td></tr></table></td></tr></table></body></html>`

const textLayout = `{{.Heading}}

{{if .Message}}{{.Message}}

{{end}}{{range .Items}}- {{.Title}}: {{.URL}}
{{end}}{{if .ActionURL}}{{.ActionLabel}}: {{.ActionURL}}

{{end}}{{if .UnsubscribeURL}}Unsubscribe from emails: {{.UnsubscribeURL}}
{{end}}`

var (
	htmlTpl = template.Must(template.New("layout").Parse(htmlLayout))
	textTpl = ttemplate.Must(ttemplate.New("layout").Parse(textLayout))
	urlRe   = regexp.MustCompile(`https?://[^\s<>"]+`)
)

type MailItem struct {
	Title string
	URL   string
}

type mailView struct {
	Name           string
	Title          string
	Heading        string
	Message        string
	ActionLabel    string
	ActionURL      string
	UnsubscribeURL string
	Items          []MailItem
}

func str(m map[string]interface{}, k string) string {
	s, _ := m[k].(string)
	return s
}

func fill(tpl string, v mailView) string {
	t, err := ttemplate.New("s").Parse(tpl)
	if err != nil {
		return tpl
	}
	var b bytes.Buffer
	if err := t.Execute(&b, v); err != nil {
		return tpl
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func oneLine(s string) string { return strings.Join(strings.Fields(s), " ") }

// Render produces subject, plain-text and HTML bodies for a queued email.
// Recognised data keys: name, title, message, link, action_label, unsubscribe_url, subject, text, items.
func Render(tplName, subjectOverride string, data map[string]interface{}) (subject, text, htmlBody string, err error) {
	if tplName == TplRaw {
		body := str(data, "text")
		subject = oneLine(str(data, "subject"))
		if subject == "" {
			subject = oneLine(subjectOverride)
		}
		esc := html.EscapeString(body)
		esc = urlRe.ReplaceAllStringFunc(esc, func(u string) string {
			return fmt.Sprintf(`<a href="%s">%s</a>`, u, u)
		})
		esc = strings.ReplaceAll(esc, "\n", "<br>")
		return subject, body, `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">` + esc + `</body></html>`, nil
	}
	def, ok := tplDefs[tplName]
	if !ok {
		return "", "", "", ErrUnknownTemplate
	}
	v := mailView{
		Name: oneLine(str(data, "name")), Title: oneLine(str(data, "title")), Message: str(data, "message"),
		ActionLabel: str(data, "action_label"), ActionURL: str(data, "link"), UnsubscribeURL: str(data, "unsubscribe_url"),
	}
	if v.Name == "" {
		v.Name = "there"
	}
	if v.ActionLabel == "" {
		v.ActionLabel = def.action
	}
	if raw, ok := data["items"].([]interface{}); ok {
		for _, it := range raw {
			if m, ok := it.(map[string]interface{}); ok {
				v.Items = append(v.Items, MailItem{Title: str(m, "title"), URL: str(m, "url")})
			}
		}
	}
	v.Heading = fill(def.heading, v)
	subject = fill(def.subject, v)
	if s := oneLine(subjectOverride); s != "" {
		subject = s
	}
	var hb, tb bytes.Buffer
	if err = htmlTpl.Execute(&hb, v); err != nil {
		return
	}
	if err = textTpl.Execute(&tb, v); err != nil {
		return
	}
	return subject, tb.String(), hb.String(), nil
}
