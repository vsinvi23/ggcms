package dto

// ── Reaction ──────────────────────────────────────────────────────────────────

type ReactRequest struct {
	Value string `json:"value" binding:"required,oneof=like dislike"`
}

type ReactionSummaryResponse struct {
	Likes    int64  `json:"likes"`
	Dislikes int64  `json:"dislikes"`
	UserVote string `json:"userVote"` // "like" | "dislike" | ""
}

// ── Note ─────────────────────────────────────────────────────────────────────

type NoteUpsertRequest struct {
	Body string `json:"body" binding:"required"`
}

type NoteResponse struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	ContentID   uint   `json:"contentId"`
	Body        string `json:"body"`
	UpdatedAt   string `json:"updatedAt"`
}

// ── Favourite ─────────────────────────────────────────────────────────────────

type FavouriteResponse struct {
	IsFavourited bool `json:"isFavourited"`
}

type FavouriteItem struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	ContentID   uint   `json:"contentId"`
	CreatedAt   string `json:"createdAt"`
}

// ── Highlight ────────────────────────────────────────────────────────────────

type HighlightCreateRequest struct {
	Text         string `json:"text" binding:"required"`
	StartOffset  int    `json:"startOffset"`
	EndOffset    int    `json:"endOffset"`
	Color        string `json:"color"`        // "yellow" | "green" | "blue"
	Note         string `json:"note"`         // optional personal note
	ContentTitle string `json:"contentTitle"` // stored for display (avoids join)
	ContentSlug  string `json:"contentSlug"`  // stored for deep-link generation
}

type HighlightUpdateRequest struct {
	Note  string `json:"note"`
	Color string `json:"color"`
}

type HighlightResponse struct {
	ID           string `json:"id"`
	ContentType  string `json:"contentType"`
	ContentID    uint   `json:"contentId"`
	ContentTitle string `json:"contentTitle,omitempty"`
	ContentSlug  string `json:"contentSlug,omitempty"`
	Text         string `json:"text"`
	StartOffset  int    `json:"startOffset"`
	EndOffset    int    `json:"endOffset"`
	Color        string `json:"color"`
	Note         string `json:"note,omitempty"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt,omitempty"`
}
