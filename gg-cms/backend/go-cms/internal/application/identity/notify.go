package identity

import (
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

type Sender interface {
	Configured() bool
	Send(to, subject, body string) error
}

// Notifier sends transactional mail asynchronously. Without SMTP it logs the
// message (including links) at debug level, and only outside production.
type Notifier struct {
	sender     Sender
	production bool
}

func NewNotifier(sender Sender, production bool) *Notifier {
	return &Notifier{sender: sender, production: production}
}

func (n *Notifier) Send(to, subject, body string) {
	if n == nil || n.sender == nil || !n.sender.Configured() {
		if n != nil && !n.production {
			logger.Debug("mail (SMTP not configured, dev only)", zap.String("to", to), zap.String("subject", subject), zap.String("body", body))
		} else {
			logger.Warn("mail dropped: SMTP not configured", zap.String("subject", subject))
		}
		return
	}
	go func() {
		defer func() { _ = recover() }()
		if err := n.sender.Send(to, subject, body); err != nil {
			logger.Warn("mail send failed", zap.String("subject", subject), zap.Error(err))
		}
	}()
}
