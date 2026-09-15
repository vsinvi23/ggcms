package logging

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"`     // INFO, WARN, ERROR, DEBUG
	Source    string                 `json:"source"`    // "server" or "ui_client"
	Message   string                 `json:"message"`
	UserEmail string                 `json:"userEmail,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type DebugLogStore struct {
	mu         sync.RWMutex
	maxEntries int
	entries    []LogEntry
}

var globalLogStore = NewDebugLogStore(1000)

func NewDebugLogStore(maxEntries int) *DebugLogStore {
	if maxEntries <= 0 {
		maxEntries = 1000
	}
	return &DebugLogStore{
		maxEntries: maxEntries,
		entries:    make([]LogEntry, 0, maxEntries),
	}
}

func GetGlobalLogStore() *DebugLogStore {
	return globalLogStore
}

func (s *DebugLogStore) Record(level, source, message, userEmail string, meta map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := LogEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Level:     level,
		Source:    source,
		Message:   message,
		UserEmail: userEmail,
		Metadata:  meta,
	}

	if len(s.entries) >= s.maxEntries {
		// Drop oldest entry (ring buffer)
		s.entries = s.entries[1:]
	}
	s.entries = append(s.entries, entry)
}

func (s *DebugLogStore) List(levelFilter string, limit int) []LogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.entries) {
		limit = len(s.entries)
	}

	result := make([]LogEntry, 0, limit)
	// Return newest first
	for i := len(s.entries) - 1; i >= 0 && len(result) < limit; i-- {
		e := s.entries[i]
		if levelFilter != "" && levelFilter != "all" && e.Level != levelFilter {
			continue
		}
		result = append(result, e)
	}
	return result
}

func (s *DebugLogStore) Export(format string) ([]byte, string, string) {
	s.mu.RLock()
	entries := make([]LogEntry, len(s.entries))
	copy(entries, s.entries)
	s.mu.RUnlock()

	dateStr := time.Now().Format("2006-01-02_150405")

	if format == "json" {
		data, _ := json.MarshalIndent(entries, "", "  ")
		return data, "application/json", fmt.Sprintf("debug-logs-%s.json", dateStr)
	}

	if format == "csv" {
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write([]string{"Timestamp", "Level", "Source", "User", "Message", "Metadata"})
		for _, e := range entries {
			metaBytes, _ := json.Marshal(e.Metadata)
			_ = w.Write([]string{e.Timestamp, e.Level, e.Source, e.UserEmail, e.Message, string(metaBytes)})
		}
		w.Flush()
		return buf.Bytes(), "text/csv", fmt.Sprintf("debug-logs-%s.csv", dateStr)
	}

	// Default TXT
	var buf bytes.Buffer
	for _, e := range entries {
		metaStr := ""
		if len(e.Metadata) > 0 {
			metaBytes, _ := json.Marshal(e.Metadata)
			metaStr = fmt.Sprintf(" | Meta: %s", string(metaBytes))
		}
		buf.WriteString(fmt.Sprintf("[%s] [%s] [%s] User: %s | %s%s\n", e.Timestamp, e.Level, e.Source, e.UserEmail, e.Message, metaStr))
	}
	return buf.Bytes(), "text/plain", fmt.Sprintf("debug-logs-%s.txt", dateStr)
}
