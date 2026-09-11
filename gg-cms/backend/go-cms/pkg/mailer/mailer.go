package mailer

import (
	"fmt"
	"net/smtp"

	"github.com/serenya/go-cms/pkg/config"
)

type Mailer struct {
	cfg config.MailerConfig
}

func New(cfg config.MailerConfig) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) Send(to, subject, body string) error {
	if m.cfg.SMTPHost == "" {
		return fmt.Errorf("SMTP_HOST is not configured")
	}

	addr := fmt.Sprintf("%s:%s", m.cfg.SMTPHost, m.cfg.SMTPPort)
	auth := smtp.PlainAuth("", m.cfg.SMTPUsername, m.cfg.SMTPPassword, m.cfg.SMTPHost)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		m.cfg.FromAddress, to, subject, body)

	return smtp.SendMail(addr, auth, m.cfg.FromAddress, []string{to}, []byte(msg))
}
