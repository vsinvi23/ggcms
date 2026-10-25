package handler

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
)

type LessonPreviewPolicy string

const (
	LessonPreviewFirst LessonPreviewPolicy = "first"
	LessonPreviewNone  LessonPreviewPolicy = "none"
	LessonPreviewAll   LessonPreviewPolicy = "all"
)

// ParseLessonPreview maps PUBLIC_LESSON_PREVIEW to a policy; unknown or empty values default to "first".
func ParseLessonPreview(v string) LessonPreviewPolicy {
	switch LessonPreviewPolicy(strings.ToLower(strings.TrimSpace(v))) {
	case LessonPreviewNone:
		return LessonPreviewNone
	case LessonPreviewAll:
		return LessonPreviewAll
	}
	return LessonPreviewFirst
}

func (p LessonPreviewPolicy) gates(c *gin.Context) bool {
	if p == LessonPreviewAll || middleware.GetUserID(c) > 0 {
		return false
	}
	return true
}

type lessonGate struct {
	policy LessonPreviewPolicy
	seen   bool
}

func (g *lessonGate) allow() bool {
	if g.policy == LessonPreviewFirst && !g.seen {
		g.seen = true
		return true
	}
	g.seen = true
	return false
}

func gateSections(sections []dto.SectionResponse, policy LessonPreviewPolicy) {
	g := &lessonGate{policy: policy}
	gateSectionTree(sections, g)
}

func gateSectionTree(sections []dto.SectionResponse, g *lessonGate) {
	for i := range sections {
		for j := range sections[i].Lessons {
			if !g.allow() {
				sections[i].Lessons[j].Content = nil
				sections[i].Lessons[j].Locked = true
			}
		}
		gateSectionTree(sections[i].ChildSections, g)
	}
}

type snapLesson struct {
	ID      uint   `json:"id"`
	Title   string `json:"title"`
	Type    string `json:"type"`
	Content string `json:"content,omitempty"`
	Order   int    `json:"order"`
	Locked  bool   `json:"locked,omitempty"`
}

type snapSection struct {
	ID            uint          `json:"id"`
	Title         string        `json:"title"`
	Description   string        `json:"description"`
	Order         int           `json:"order"`
	Lessons       []snapLesson  `json:"lessons"`
	ChildSections []snapSection `json:"childSections"`
}

func gateSnapshotTree(secs []snapSection, g *lessonGate) {
	for i := range secs {
		for j := range secs[i].Lessons {
			if !g.allow() {
				secs[i].Lessons[j].Content = ""
				secs[i].Lessons[j].Locked = true
			}
		}
		gateSnapshotTree(secs[i].ChildSections, g)
	}
}

// gateChaptersSnapshot redacts lesson bodies inside a chapters-snapshot JSON string
// following the same first/none rule as gateSections. On parse failure the snapshot is dropped.
func gateChaptersSnapshot(snapshot *string, policy LessonPreviewPolicy) *string {
	if snapshot == nil || *snapshot == "" {
		return snapshot
	}
	var secs []snapSection
	if err := json.Unmarshal([]byte(*snapshot), &secs); err != nil {
		return nil
	}
	gateSnapshotTree(secs, &lessonGate{policy: policy})
	b, err := json.Marshal(secs)
	if err != nil {
		return nil
	}
	out := string(b)
	return &out
}

// applyPublicCourseGate hides lesson content embedded in a public course response
// (chapter snapshots) from callers who may not read it.
func applyPublicCourseGate(c *gin.Context, r *dto.CMSResponse, policy LessonPreviewPolicy, preview bool) {
	if preview {
		return
	}
	r.ReviewBaselineChapters = nil
	if policy.gates(c) {
		r.PublishedChaptersSnapshot = gateChaptersSnapshot(r.PublishedChaptersSnapshot, policy)
	}
}
