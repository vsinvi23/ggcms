package mailer

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"mime"
	"mime/multipart"
	"net/smtp"
	"net/textproto"
	"sort"
	"strings"
	"time"

	"github.com/serenya/go-cms/pkg/config"
)

type Mailer struct {
	cfg config.MailerConfig
}

func New(cfg config.MailerConfig) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) Configured() bool { return m.cfg.SMTPHost != "" }

func clean(s string) string {
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(s)
}

func (m *Mailer) deliver(to string, msg []byte) error {
	if m.cfg.SMTPHost == "" {
		return fmt.Errorf("SMTP_HOST is not configured")
	}
	addr := fmt.Sprintf("%s:%s", m.cfg.SMTPHost, m.cfg.SMTPPort)
	auth := smtp.PlainAuth("", m.cfg.SMTPUsername, m.cfg.SMTPPassword, m.cfg.SMTPHost)
	return smtp.SendMail(addr, auth, m.cfg.FromAddress, []string{clean(to)}, msg)
}

func (m *Mailer) Send(to, subject, body string) error {
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		clean(m.cfg.FromAddress), clean(to), mime.QEncoding.Encode("utf-8", clean(subject)), body)
	return m.deliver(to, []byte(msg))
}

// SendMultipart sends a multipart/alternative (text + HTML) message with extra headers
// such as List-Unsubscribe.
func (m *Mailer) SendMultipart(to, subject, text, html string, headers map[string]string) error {
	return m.deliver(to, BuildMultipart(m.cfg.FromAddress, to, subject, text, html, headers))
}

func BuildMultipart(from, to, subject, text, html string, headers map[string]string) []byte {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	var out bytes.Buffer
	idBytes := make([]byte, 12)
	_, _ = rand.Read(idBytes)
	domain := "localhost"
	if i := strings.LastIndex(from, "@"); i >= 0 {
		domain = strings.Trim(clean(from[i+1:]), "<> ")
	}
	fmt.Fprintf(&out, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s@%s>\r\nMIME-Version: 1.0\r\n",
		clean(from), clean(to), mime.QEncoding.Encode("utf-8", clean(subject)), time.Now().UTC().Format(time.RFC1123Z), hex.EncodeToString(idBytes), domain)
	keys := make([]string, 0, len(headers))
	for k := range headers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Fprintf(&out, "%s: %s\r\n", clean(k), clean(headers[k]))
	}
	fmt.Fprintf(&out, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", mw.Boundary())
	for _, part := range []struct{ ct, body string }{{"text/plain", text}, {"text/html", html}} {
		w, _ := mw.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {part.ct + "; charset=UTF-8"},
			"Content-Transfer-Encoding": {"8bit"},
		})
		_, _ = w.Write([]byte(part.body))
	}
	_ = mw.Close()
	out.Write(buf.Bytes())
	return out.Bytes()
}
