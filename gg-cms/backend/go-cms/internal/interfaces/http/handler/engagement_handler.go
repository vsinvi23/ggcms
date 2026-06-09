package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/engagement"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/pagination"
	"github.com/serenya/go-cms/pkg/response"
)

// EngagementHandler handles reactions, notes, favourites and highlights.
type EngagementHandler struct {
	reactions  engagement.ReactionService
	notes      engagement.NoteService
	favourites engagement.FavouriteService
	highlights engagement.HighlightService
}

func NewEngagementHandler(
	reactions engagement.ReactionService,
	notes engagement.NoteService,
	favourites engagement.FavouriteService,
	highlights engagement.HighlightService,
) *EngagementHandler {
	return &EngagementHandler{
		reactions:  reactions,
		notes:      notes,
		favourites: favourites,
		highlights: highlights,
	}
}

// parseContentParams extracts and validates :contentType and :contentId route params.
func parseContentParams(c *gin.Context) (string, uint, bool) {
	ct := c.Param("contentType")
	if ct != "article" && ct != "course" {
		response.BadRequest(c, "contentType must be 'article' or 'course'")
		return "", 0, false
	}
	idStr := c.Param("contentId")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		response.BadRequest(c, "invalid contentId")
		return "", 0, false
	}
	return ct, uint(id), true
}

// ── Reactions ────────────────────────────────────────────────────────────────

// POST /api/engagement/:contentType/:contentId/react
func (h *EngagementHandler) React(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	var req dto.ReactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	if err := h.reactions.React(c.Request.Context(), userID, ct, cid, req.Value); err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "reaction saved"})
}

// DELETE /api/engagement/:contentType/:contentId/react
func (h *EngagementHandler) Unreact(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	if err := h.reactions.Unreact(c.Request.Context(), userID, ct, cid); err != nil {
		response.NotFound(c, "no reaction to remove")
		return
	}
	response.OK(c, gin.H{"message": "reaction removed"})
}

// GET /api/engagement/:contentType/:contentId/reactions
func (h *EngagementHandler) GetReactions(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c) // 0 when called from public (no auth)
	summary, err := h.reactions.GetSummary(c.Request.Context(), userID, ct, cid)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, dto.ReactionSummaryResponse{
		Likes:    summary.Likes,
		Dislikes: summary.Dislikes,
		UserVote: summary.UserVote,
	})
}

// ── Notes ────────────────────────────────────────────────────────────────────

// PUT /api/engagement/:contentType/:contentId/note
func (h *EngagementHandler) UpsertNote(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	var req dto.NoteUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	note, err := h.notes.Upsert(c.Request.Context(), userID, ct, cid, req.Body)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, mapNoteToDTO(note))
}

// GET /api/engagement/:contentType/:contentId/note
func (h *EngagementHandler) GetNote(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	note, err := h.notes.Get(c.Request.Context(), userID, ct, cid)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	if note == nil {
		response.OK(c, nil)
		return
	}
	response.OK(c, mapNoteToDTO(note))
}

// GET /api/engagement/notes?page=0&size=10
func (h *EngagementHandler) ListMyNotes(c *gin.Context) {
	userID := middleware.GetUserID(c)
	p := pagination.FromQuery(c)
	notes, total, err := h.notes.ListUserNotes(c.Request.Context(), userID, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.NoteResponse, len(notes))
	for i, n := range notes {
		items[i] = mapNoteToDTO(n)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// DELETE /api/engagement/notes/:id
func (h *EngagementHandler) DeleteNote(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		response.BadRequest(c, "invalid note id")
		return
	}
	userID := middleware.GetUserID(c)
	if err := h.notes.Delete(c.Request.Context(), id, userID); err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "note deleted"})
}

func mapNoteToDTO(n *entity.Note) dto.NoteResponse {
	return dto.NoteResponse{
		ID:          n.ID.Hex(),
		ContentType: n.ContentType,
		ContentID:   n.ContentID,
		Body:        n.Body,
		UpdatedAt:   n.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// ── Favourites ───────────────────────────────────────────────────────────────

// POST /api/engagement/:contentType/:contentId/favourite
func (h *EngagementHandler) ToggleFavourite(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	result, err := h.favourites.Toggle(c.Request.Context(), userID, ct, cid)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, dto.FavouriteResponse{IsFavourited: result.IsFavourited})
}

// GET /api/engagement/:contentType/:contentId/favourite
func (h *EngagementHandler) IsFavourited(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	isFav, err := h.favourites.IsFavourited(c.Request.Context(), userID, ct, cid)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.OK(c, dto.FavouriteResponse{IsFavourited: isFav})
}

// GET /api/engagement/favourites?page=0&size=10
func (h *EngagementHandler) ListMyFavourites(c *gin.Context) {
	userID := middleware.GetUserID(c)
	p := pagination.FromQuery(c)
	favs, total, err := h.favourites.ListUserFavourites(c.Request.Context(), userID, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.FavouriteItem, len(favs))
	for i, f := range favs {
		items[i] = dto.FavouriteItem{
			ID:          f.ID.Hex(),
			ContentType: f.ContentType,
			ContentID:   f.ContentID,
			CreatedAt:   f.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// ── Highlights ───────────────────────────────────────────────────────────────

// POST /api/engagement/:contentType/:contentId/highlights
func (h *EngagementHandler) CreateHighlight(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	var req dto.HighlightCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	userID := middleware.GetUserID(c)
	hl, err := h.highlights.Create(c.Request.Context(), userID, ct, cid, req.Text, req.StartOffset, req.EndOffset, req.Color, req.Note, req.ContentTitle, req.ContentSlug)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Created(c, mapHighlightToDTO(hl))
}

// PUT /api/engagement/highlights/:id
func (h *EngagementHandler) UpdateHighlight(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetUserID(c)
	var req dto.HighlightUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}
	if err := h.highlights.Update(c.Request.Context(), id, userID, req.Note, req.Color); err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "highlight updated"})
}

// GET /api/engagement/:contentType/:contentId/highlights
func (h *EngagementHandler) ListHighlights(c *gin.Context) {
	ct, cid, ok := parseContentParams(c)
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	highlights, err := h.highlights.List(c.Request.Context(), userID, ct, cid)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.HighlightResponse, len(highlights))
	for i, hl := range highlights {
		items[i] = mapHighlightToDTO(hl)
	}
	response.OK(c, items)
}

// GET /api/engagement/highlights?page=0&size=20
func (h *EngagementHandler) ListMyHighlights(c *gin.Context) {
	userID := middleware.GetUserID(c)
	p := pagination.FromQuery(c)
	highlights, total, err := h.highlights.ListUserHighlights(c.Request.Context(), userID, p.Page, p.Size)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.HighlightResponse, len(highlights))
	for i, hl := range highlights {
		items[i] = mapHighlightToDTO(hl)
	}
	response.StrapiPaged(c, items, total, p.Page, p.Size)
}

// DELETE /api/engagement/highlights/:id
func (h *EngagementHandler) DeleteHighlight(c *gin.Context) {
	id := c.Param("id")
	userID := middleware.GetUserID(c)
	if err := h.highlights.Delete(c.Request.Context(), id, userID); err != nil {
		response.NotFound(c, err.Error())
		return
	}
	response.OK(c, gin.H{"message": "highlight deleted"})
}

func mapHighlightToDTO(hl *entity.Highlight) dto.HighlightResponse {
	r := dto.HighlightResponse{
		ID:           hl.ID.Hex(),
		ContentType:  hl.ContentType,
		ContentID:    hl.ContentID,
		ContentTitle: hl.ContentTitle,
		ContentSlug:  hl.ContentSlug,
		Text:         hl.Text,
		StartOffset:  hl.StartOffset,
		EndOffset:    hl.EndOffset,
		Color:        hl.Color,
		Note:         hl.Note,
		CreatedAt:    hl.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if !hl.UpdatedAt.IsZero() {
		r.UpdatedAt = hl.UpdatedAt.Format("2006-01-02T15:04:05Z07:00")
	}
	return r
}
