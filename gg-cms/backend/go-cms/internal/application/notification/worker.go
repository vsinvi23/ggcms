package notification

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

type MailSender interface {
	Configured() bool
	SendMultipart(to, subject, text, html string, headers map[string]string) error
}

type WorkerConfig struct {
	Production    bool
	Poll          time.Duration
	BatchSize     int
	Lease         time.Duration
	AppURL        string
	RetentionDays int
	NotificationRetentionDays int
	DigestEnabled bool
	Now           func() time.Time
}

type Worker struct {
	queue  repository.EmailQueueRepository
	prefs  repository.UserPreferencesRepository
	lookup repository.NotificationLookup
	stats  repository.PlatformStatsRepository
	mail   MailSender
	svc    Service
	cfg    WorkerConfig
}

func NewWorker(svc Service, queue repository.EmailQueueRepository, prefs repository.UserPreferencesRepository, lookup repository.NotificationLookup, stats repository.PlatformStatsRepository, mail MailSender, cfg WorkerConfig) *Worker {
	if cfg.Poll <= 0 {
		cfg.Poll = 5 * time.Second
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 10
	}
	if cfg.Lease <= 0 {
		cfg.Lease = 2 * time.Minute
	}
	if cfg.RetentionDays <= 0 {
		cfg.RetentionDays = 30
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	cfg.AppURL = strings.TrimRight(cfg.AppURL, "/")
	return &Worker{queue: queue, prefs: prefs, lookup: lookup, stats: stats, mail: mail, svc: svc, cfg: cfg}
}

// Backoff returns the delay before retry number attempts (1-based): 30s doubling, capped at 1h.
func Backoff(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 8 {
		attempts = 8
	}
	d := 30 * time.Second << (attempts - 1)
	if d > time.Hour {
		d = time.Hour
	}
	return d
}

// ProcessBatch claims due emails and sends them, returning (sent, failed).
func (w *Worker) ProcessBatch(ctx context.Context) (int, int) {
	items, err := w.queue.Claim(ctx, w.cfg.BatchSize, w.cfg.Lease)
	if err != nil {
		logger.Warn("email queue: claim failed", zap.Error(err))
		return 0, 0
	}
	sent, failed := 0, 0
	for _, it := range items {
		if err := w.send(it); err != nil {
			failed++
			dead := it.Attempts >= it.MaxAttempts
			_ = w.queue.MarkFailed(ctx, it.ID, w.cfg.Now().Add(Backoff(it.Attempts)), err.Error(), dead)
			logger.Warn("email queue: send failed", zap.Uint("id", it.ID), zap.String("template", it.Template),
				zap.Int("attempt", it.Attempts), zap.Bool("dead", dead), zap.Error(err))
			continue
		}
		sent++
		_ = w.queue.MarkSent(ctx, it.ID, w.cfg.Now())
	}
	return sent, failed
}

func (w *Worker) send(it *entity.EmailQueueItem) error {
	subject, text, html, err := Render(it.Template, it.Subject, it.Data)
	if err != nil {
		return err
	}
	if w.mail == nil || !w.mail.Configured() {
		if w.cfg.Production {
			return fmt.Errorf("SMTP is not configured")
		}
		logger.Info("email (dev, SMTP not configured, not sent)", zap.String("to", it.ToEmail), zap.String("subject", subject), zap.String("text", text))
		return nil
	}
	headers := map[string]string{}
	if u, _ := it.Data["unsubscribe_url"].(string); u != "" {
		headers["List-Unsubscribe"] = "<" + u + ">"
		headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
	}
	return w.mail.SendMultipart(it.ToEmail, subject, text, html, headers)
}

// Start runs the delivery loop and the periodic sweeps until ctx is cancelled.
func (w *Worker) Start(ctx context.Context) {
	go func() {
		poll := time.NewTicker(w.cfg.Poll)
		sweep := time.NewTicker(5 * time.Minute)
		defer poll.Stop()
		defer sweep.Stop()
		w.Sweep(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-poll.C:
				w.ProcessBatch(ctx)
			case <-sweep.C:
				w.Sweep(ctx)
			}
		}
	}()
}

func (w *Worker) Sweep(ctx context.Context) {
	w.WelcomeSweep(ctx)
	if w.cfg.DigestEnabled {
		w.DigestSweep(ctx)
	}
	if d := w.cfg.NotificationRetentionDays; d > 0 {
		if _, err := w.lookup.PurgeReadOlderThan(ctx, w.cfg.Now().AddDate(0, 0, -d)); err != nil {
			logger.Warn("notification purge failed", zap.Error(err))
		}
	}
	if n, err := w.queue.PurgeOlderThan(ctx, w.cfg.Now().AddDate(0, 0, -w.cfg.RetentionDays)); err != nil {
		logger.Warn("email queue: purge failed", zap.Error(err))
	} else if n > 0 {
		logger.Info("email queue: purged old rows", zap.Int64("rows", n))
	}
}

// WelcomeSweep sends a welcome notification/email to recently verified users exactly once.
func (w *Worker) WelcomeSweep(ctx context.Context) {
	users, err := w.queue.RecentlyVerifiedUsers(ctx, w.cfg.Now().Add(-48*time.Hour), 100)
	if err != nil {
		logger.Warn("welcome sweep failed", zap.Error(err))
		return
	}
	link := "/"
	for _, u := range users {
		if has, err := w.lookup.HasType(ctx, u.UserID, TypeWelcome); err != nil || has {
			continue
		}
		_ = w.svc.Notify(ctx, Notice{
			UserID: u.UserID, Type: TypeWelcome, Title: "Welcome to GeekGully",
			Message:       "Your account is ready. Pick a course or article and start learning.",
			Link:          &link,
			EmailTemplate: TplWelcome,
			DedupeKey:     fmt.Sprintf("welcome:%d", u.UserID),
		})
	}
}

// DigestSweep queues the daily/weekly digest of newly published content.
func (w *Worker) DigestSweep(ctx context.Context) {
	now := w.cfg.Now()
	for freq, period := range map[string]time.Duration{"daily": 24 * time.Hour, "weekly": 7 * 24 * time.Hour} {
		users, err := w.prefs.DigestCandidates(ctx, freq, now.Add(-period), 200)
		if err != nil || len(users) == 0 {
			continue
		}
		fresh, err := w.stats.RecentlyPublished(ctx, now.Add(-period), 5)
		if err != nil {
			continue
		}
		items := make([]interface{}, 0, len(fresh))
		for _, c := range fresh {
			items = append(items, map[string]interface{}{"title": c.Title, "url": fmt.Sprintf("%s/%s/%s", w.cfg.AppURL, c.Type, c.Slug)})
		}
		year, week := now.ISOWeek()
		bucket := fmt.Sprintf("%d-w%d", year, week)
		if freq == "daily" {
			bucket = now.Format("2006-01-02")
		}
		for _, u := range users {
			if len(items) > 0 {
				data := map[string]interface{}{"name": u.Name, "items": items, "link": w.cfg.AppURL + "/explore"}
				if url, err := w.svc.UnsubscribeURL(ctx, u.UserID); err == nil {
					data["unsubscribe_url"] = url
				}
				uid := u.UserID
				if _, err := w.svc.QueueEmail(ctx, &uid, u.Email, TplDigest, "", data, fmt.Sprintf("digest:%d:%s:%s", u.UserID, freq, bucket)); err != nil {
					continue
				}
			}
			_ = w.prefs.MarkDigestSent(ctx, u.UserID, now)
		}
	}
}

// QueueSender adapts the email queue to the identity module's Sender interface so
// verification and reset emails get retries and backoff.
type QueueSender struct {
	svc Service
}

func NewQueueSender(svc Service) *QueueSender { return &QueueSender{svc: svc} }

func (q *QueueSender) Configured() bool { return true }

func (q *QueueSender) Send(to, subject, body string) error {
	_, err := q.svc.QueueEmail(context.Background(), nil, to, TplRaw, subject, map[string]interface{}{"subject": subject, "text": body}, "")
	return err
}
