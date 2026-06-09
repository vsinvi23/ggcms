package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var log *zap.Logger
var debugEnabled bool

// Init configures the global logger.
//
//   - level:       "debug" | "info" | "warn" | "error"
//   - development: true → human-friendly coloured console output; false → JSON
//   - logFile:     path to the log file (e.g. "logs/app.log").
//     Empty string disables file logging.
//     The directory is created automatically if it does not exist.
//
// Output is always written to stderr AND to the file (when configured),
// using zapcore.NewTee so both sinks receive every log line.
func Init(level, logFile string, development bool) {
	zapLevel := parseLevel(level)
	debugEnabled = zapLevel == zapcore.DebugLevel

	encoderCfg := zap.NewDevelopmentEncoderConfig()
	if !development {
		encoderCfg = zap.NewProductionEncoderConfig()
		encoderCfg.TimeKey = "timestamp"
		encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	}

	// ── Console core ──────────────────────────────────────────────────────────
	var consoleEncoder zapcore.Encoder
	if development {
		encoderCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
		consoleEncoder = zapcore.NewConsoleEncoder(encoderCfg)
	} else {
		consoleEncoder = zapcore.NewJSONEncoder(encoderCfg)
	}
	consoleCore := zapcore.NewCore(consoleEncoder, zapcore.AddSync(os.Stderr), zapLevel)

	cores := []zapcore.Core{consoleCore}

	// ── File core (JSON, always — easier to grep/parse) ───────────────────────
	if logFile != "" {
		fileCore, err := buildFileCore(logFile, zapLevel)
		if err != nil {
			// Non-fatal: log the error to console and continue without file sink.
			fmt.Fprintf(os.Stderr, "logger: failed to open log file %q: %v\n", logFile, err)
		} else {
			cores = append(cores, fileCore)
		}
	}

	opts := []zap.Option{zap.AddCaller()}
	if development {
		opts = append(opts, zap.AddStacktrace(zapcore.ErrorLevel))
	}

	log = zap.New(zapcore.NewTee(cores...), opts...)

	log.Info("logger initialised",
		zap.String("level", zapLevel.String()),
		zap.Bool("development", development),
		zap.String("log_file", logFile),
	)
}

func buildFileCore(path string, level zapcore.Level) (zapcore.Core, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}

	// File output is always JSON regardless of development flag.
	fileCfg := zap.NewProductionEncoderConfig()
	fileCfg.TimeKey = "timestamp"
	fileCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	return zapcore.NewCore(zapcore.NewJSONEncoder(fileCfg), zapcore.AddSync(f), level), nil
}

func parseLevel(level string) zapcore.Level {
	switch strings.ToLower(level) {
	case "debug":
		return zapcore.DebugLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

// IsDebug returns true when the active log level is DEBUG.
func IsDebug() bool { return debugEnabled }

func Get() *zap.Logger {
	if log == nil {
		Init("info", "", true)
	}
	return log
}

func Info(msg string, fields ...zap.Field)  { Get().Info(msg, fields...) }
func Error(msg string, fields ...zap.Field) { Get().Error(msg, fields...) }
func Debug(msg string, fields ...zap.Field) { Get().Debug(msg, fields...) }
func Warn(msg string, fields ...zap.Field)  { Get().Warn(msg, fields...) }
func Fatal(msg string, fields ...zap.Field) { Get().Fatal(msg, fields...) }
