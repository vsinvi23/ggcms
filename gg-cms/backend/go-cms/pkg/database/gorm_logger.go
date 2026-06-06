package database

import (
	"context"
	"errors"
	"time"

	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// zapGormLogger bridges GORM's logger interface to our zap-based logger.
type zapGormLogger struct {
	level         gormlogger.LogLevel
	slowThreshold time.Duration
}

func newGormLogger(debug bool) gormlogger.Interface {
	level := gormlogger.Warn
	if debug {
		level = gormlogger.Info // log every SQL query
	}
	return &zapGormLogger{
		level:         level,
		slowThreshold: 200 * time.Millisecond,
	}
}

func (l *zapGormLogger) LogMode(level gormlogger.LogLevel) gormlogger.Interface {
	return &zapGormLogger{level: level, slowThreshold: l.slowThreshold}
}

func (l *zapGormLogger) Info(_ context.Context, msg string, args ...interface{}) {
	if l.level >= gormlogger.Info {
		applogger.Info("gorm", zap.String("msg", msg), zap.Any("args", args))
	}
}

func (l *zapGormLogger) Warn(_ context.Context, msg string, args ...interface{}) {
	if l.level >= gormlogger.Warn {
		applogger.Warn("gorm", zap.String("msg", msg), zap.Any("args", args))
	}
}

func (l *zapGormLogger) Error(_ context.Context, msg string, args ...interface{}) {
	if l.level >= gormlogger.Error {
		applogger.Error("gorm", zap.String("msg", msg), zap.Any("args", args))
	}
}

// Trace is called for every SQL statement GORM executes.
func (l *zapGormLogger) Trace(_ context.Context, begin time.Time, fc func() (string, int64), err error) {
	if l.level <= gormlogger.Silent {
		return
	}
	elapsed := time.Since(begin)
	sql, rows := fc()

	fields := []zap.Field{
		zap.Duration("elapsed", elapsed),
		zap.Int64("rows", rows),
		zap.String("sql", sql),
	}

	switch {
	case err != nil && errors.Is(err, gorm.ErrRecordNotFound):
		// "record not found" is expected in existence checks (e.g. FindByEmail during register).
		// Log at DEBUG only — it is not an application error.
		applogger.Debug("gorm:sql", fields...)
	case err != nil && l.level >= gormlogger.Error:
		applogger.Error("gorm:sql", append(fields, zap.Error(err))...)
	case elapsed > l.slowThreshold && l.level >= gormlogger.Warn:
		applogger.Warn("gorm:slow_query", fields...)
	case l.level >= gormlogger.Info:
		applogger.Debug("gorm:sql", fields...)
	}
}
