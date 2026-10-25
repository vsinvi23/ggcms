package metrics

import (
	"database/sql"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Registry struct {
	reg      *prometheus.Registry
	Requests *prometheus.CounterVec
	Latency  *prometheus.HistogramVec
}

func New() *Registry {
	r := &Registry{
		reg: prometheus.NewRegistry(),
		Requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total", Help: "HTTP requests by method, route and status.",
		}, []string{"method", "route", "status"}),
		Latency: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "http_request_duration_seconds", Help: "HTTP request latency by method and route.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		}, []string{"method", "route"}),
	}
	r.reg.MustRegister(r.Requests, r.Latency, collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return r
}

func (r *Registry) Handler() http.Handler {
	return promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{})
}

// GaugeFunc registers a gauge whose value is read at scrape time.
func (r *Registry) GaugeFunc(name, help string, fn func() float64) {
	r.reg.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: name, Help: help}, fn))
}

// CounterFunc registers a counter whose value is read at scrape time.
func (r *Registry) CounterFunc(name, help string, fn func() float64) {
	r.reg.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{Name: name, Help: help}, fn))
}

// RegisterDBPool exposes sql.DB pool statistics labelled by pool name (write|read).
func (r *Registry) RegisterDBPool(pool string, db *sql.DB) {
	if db == nil {
		return
	}
	labels := prometheus.Labels{"pool": pool}
	for _, g := range []struct {
		name, help string
		fn         func(sql.DBStats) float64
		counter    bool
	}{
		{"db_pool_open_connections", "Open connections.", func(s sql.DBStats) float64 { return float64(s.OpenConnections) }, false},
		{"db_pool_in_use_connections", "Connections in use.", func(s sql.DBStats) float64 { return float64(s.InUse) }, false},
		{"db_pool_idle_connections", "Idle connections.", func(s sql.DBStats) float64 { return float64(s.Idle) }, false},
		{"db_pool_wait_count_total", "Total connection waits.", func(s sql.DBStats) float64 { return float64(s.WaitCount) }, true},
	} {
		fn := g.fn
		read := func() float64 { return fn(db.Stats()) }
		if g.counter {
			r.reg.MustRegister(prometheus.NewCounterFunc(prometheus.CounterOpts{Name: g.name, Help: g.help, ConstLabels: labels}, read))
		} else {
			r.reg.MustRegister(prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: g.name, Help: g.help, ConstLabels: labels}, read))
		}
	}
}
