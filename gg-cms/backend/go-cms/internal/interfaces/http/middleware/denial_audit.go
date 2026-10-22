package middleware

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
)

type denialKey struct {
	actor  uint
	method string
	route  string
}

type denialAuditor struct {
	svc auditsvc.Service
	mu  sync.Mutex
	hit map[denialKey]*denialStat
}

type denialStat struct {
	count int
	first time.Time
	ip    string
}

// DenialAudit counts 403 responses per actor and route and writes one
// summarised "authz.denied" audit event per key every interval, instead of one
// event per request.
func DenialAudit(svc auditsvc.Service, interval time.Duration) gin.HandlerFunc {
	d := &denialAuditor{svc: svc, hit: map[denialKey]*denialStat{}}
	go func() {
		for range time.Tick(interval) {
			d.flush()
		}
	}()
	return func(c *gin.Context) {
		c.Next()
		if c.Writer.Status() != http.StatusForbidden {
			return
		}
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		d.record(denialKey{GetUserID(c), c.Request.Method, route}, c.ClientIP())
	}
}

func (d *denialAuditor) record(k denialKey, ip string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if s, ok := d.hit[k]; ok {
		s.count++
		return
	}
	if len(d.hit) >= 5000 {
		return
	}
	d.hit[k] = &denialStat{count: 1, first: time.Now(), ip: ip}
}

func (d *denialAuditor) flush() {
	d.mu.Lock()
	pending := d.hit
	d.hit = map[denialKey]*denialStat{}
	d.mu.Unlock()
	for k, s := range pending {
		_ = d.svc.Log(context.Background(), k.actor, "", "authz.denied", "route", k.route, k.method, map[string]interface{}{
			"count": s.count, "since": s.first.UTC().Format(time.RFC3339),
		}, s.ip)
	}
}
