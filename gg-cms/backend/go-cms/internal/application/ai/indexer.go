package ai

import (
	"context"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const chunkMaxChars = 1200

var anchorStripRe = regexp.MustCompile(`[^a-z0-9]+`)

func Anchor(heading string) string {
	a := strings.Trim(anchorStripRe.ReplaceAllString(strings.ToLower(heading), "-"), "-")
	if len(a) > 100 {
		a = strings.Trim(a[:100], "-")
	}
	return a
}

func ChunkMarkdown(title, md string) []entity.ContentChunk {
	var chunks []entity.ContentChunk
	heading := title
	var buf strings.Builder
	inFence := false
	flush := func() {
		body := strings.TrimSpace(buf.String())
		buf.Reset()
		if body == "" {
			return
		}
		chunks = append(chunks, entity.ContentChunk{Title: title, Heading: heading, Anchor: Anchor(heading), Body: body, Ordinal: len(chunks)})
	}
	for _, line := range strings.Split(md, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
		}
		if !inFence && strings.HasPrefix(trimmed, "#") {
			if text := strings.TrimSpace(strings.TrimLeft(trimmed, "#")); text != "" && len(trimmed)-len(strings.TrimLeft(trimmed, "#")) <= 4 {
				flush()
				heading = text
				continue
			}
		}
		if !inFence && trimmed == "" && buf.Len() >= chunkMaxChars {
			flush()
			continue
		}
		buf.WriteString(line + "\n")
	}
	flush()
	return chunks
}

var (
	htmlHeadingRe = regexp.MustCompile(`(?is)<h([1-4])[^>]*>(.*?)</h[1-4]>`)
	htmlBreakRe   = regexp.MustCompile(`(?i)</p>|<br\s*/?>|</li>|</div>|</pre>`)
)

func htmlToMarkdown(s string) string {
	s = htmlHeadingRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := htmlHeadingRe.FindStringSubmatch(m)
		return "\n\n" + strings.Repeat("#", int(sub[1][0]-'0')) + " " + htmlStripRe.ReplaceAllString(sub[2], "") + "\n\n"
	})
	s = htmlBreakRe.ReplaceAllString(s, "\n\n")
	s = htmlStripRe.ReplaceAllString(s, "")
	return strings.NewReplacer("&nbsp;", " ", "&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`).Replace(s)
}

func lessonToMarkdown(content string) string {
	c := strings.TrimSpace(content)
	if c == "" {
		return ""
	}
	if strings.HasPrefix(c, "[") {
		return BodyToMarkdown(c)
	}
	if strings.ContainsRune(c, '<') {
		return htmlToMarkdown(c)
	}
	return c
}

func (s *service) indexOne(ctx context.Context, contentType string, id uint) error {
	doc, err := s.Chunks.LoadIndexDoc(ctx, contentType, id)
	if err != nil || doc == nil {
		return err
	}
	var md strings.Builder
	md.WriteString(lessonToMarkdown(doc.Body))
	for _, l := range doc.Lessons {
		if text := lessonToMarkdown(l.Content); text != "" {
			md.WriteString("\n\n## " + strings.TrimSpace(l.Title) + "\n\n" + text)
		}
	}
	chunks := ChunkMarkdown(doc.Title, md.String())
	if len(chunks) == 0 {
		chunks = []entity.ContentChunk{{Title: doc.Title, Ordinal: -1, Body: " "}}
	}
	for i := range chunks {
		chunks[i].ContentType = contentType
		chunks[i].ContentID = id
		chunks[i].SourceStamp = doc.Stamp
	}
	return s.Chunks.ReplaceChunks(ctx, contentType, id, chunks)
}

func (s *service) reindex(ctx context.Context) (int, error) {
	stale, err := s.Chunks.StaleContent(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, ref := range stale {
		if ctx.Err() != nil {
			break
		}
		if err := s.indexOne(ctx, ref.ContentType, ref.ContentID); err != nil {
			logger.Warn("ai index failed", zap.String("type", ref.ContentType), zap.Uint("id", ref.ContentID), zap.Error(err))
			continue
		}
		n++
	}
	if err := s.Chunks.PruneUnpublished(ctx); err != nil {
		logger.Warn("ai chunk prune failed", zap.Error(err))
	}
	return n, nil
}

func (s *service) Reindex(ctx context.Context) (int, error) { return s.reindex(ctx) }

func RunIndexer(ctx context.Context, svc Service, interval time.Duration) {
	impl, ok := svc.(*service)
	if !ok {
		return
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			st := impl.Gateway.Settings(ctx)
			if st.Enabled && st.Tutor {
				if n, err := impl.reindex(ctx); err != nil {
					logger.Warn("ai indexer run failed", zap.Error(err))
				} else if n > 0 {
					logger.Info("ai indexer updated content", zap.Int("count", n))
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			}
		}
	}()
}

var stopwords = map[string]struct{}{}

func init() {
	for _, w := range strings.Fields("the and for are but not you with this that from have what how why when where which who does can could would should will about into your their there then than them they was were been being has had its our out any all one use used using get got explain tell please") {
		stopwords[w] = struct{}{}
	}
}

func BuildTSQuery(q string) string {
	seen := map[string]bool{}
	var terms []string
	for _, f := range strings.FieldsFunc(strings.ToLower(q), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if len(f) < 3 || len(f) > 40 {
			continue
		}
		if _, stop := stopwords[f]; stop || seen[f] {
			continue
		}
		ascii := true
		for _, r := range f {
			if r > unicode.MaxASCII {
				ascii = false
			}
		}
		if !ascii {
			continue
		}
		seen[f] = true
		terms = append(terms, f)
		if len(terms) == 10 {
			break
		}
	}
	return strings.Join(terms, " | ")
}
