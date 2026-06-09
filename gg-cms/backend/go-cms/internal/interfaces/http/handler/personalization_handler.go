package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/serenya/go-cms/internal/application/personalization"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type PersonalizationHandler struct {
	svc personalization.Service
}

func NewPersonalizationHandler(svc personalization.Service) *PersonalizationHandler {
	return &PersonalizationHandler{svc: svc}
}

// GET /api/personalization/profile — active/default profile
func (h *PersonalizationHandler) GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	profile, err := h.svc.GetProfile(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to load profile")
		return
	}
	response.OK(c, dto.MapProfileToResponse(profile))
}

// PUT /api/personalization/profile — upsert active/default profile
func (h *PersonalizationHandler) UpsertProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var body dto.UpsertProfileRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	name := body.Name
	if name == "" {
		name = "Default"
	}

	req := personalization.UpsertProfileRequest{
		Name:                 name,
		ExperienceLevel:      entity.ExperienceLevel(body.ExperienceLevel),
		RoleType:             entity.RoleType(body.RoleType),
		LearningGoals:        body.LearningGoals,
		OnboardingCompleted:  body.OnboardingCompleted,
		InterestedTagIDs:     body.InterestedTagIDs,
		PreferredCategoryIDs: body.PreferredCategoryIDs,
	}

	profile, err := h.svc.UpsertProfile(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalError(c, "failed to save profile")
		return
	}
	response.OK(c, dto.MapProfileToResponse(profile))
}

// GET /api/personalization/profiles — all profiles for current user
func (h *PersonalizationHandler) GetProfiles(c *gin.Context) {
	userID := middleware.GetUserID(c)
	profiles, err := h.svc.ListProfiles(c.Request.Context(), userID)
	if err != nil {
		response.InternalError(c, "failed to list profiles")
		return
	}
	out := make([]dto.UserProfileResponse, len(profiles))
	for i, p := range profiles {
		out[i] = dto.MapProfileToResponse(p)
	}
	response.OK(c, out)
}

// POST /api/personalization/profiles — create a new named profile
func (h *PersonalizationHandler) CreateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var body dto.CreateProfileRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	req := personalization.CreateProfileRequest{
		Name:                 body.Name,
		ExperienceLevel:      entity.ExperienceLevel(body.ExperienceLevel),
		RoleType:             entity.RoleType(body.RoleType),
		LearningGoals:        body.LearningGoals,
		InterestedTagIDs:     body.InterestedTagIDs,
		PreferredCategoryIDs: body.PreferredCategoryIDs,
	}

	profile, err := h.svc.CreateProfile(c.Request.Context(), userID, req)
	if err != nil {
		response.InternalError(c, "failed to create profile")
		return
	}
	response.Created(c, dto.MapProfileToResponse(profile))
}

// PUT /api/personalization/profiles/:id/activate — switch active profile
func (h *PersonalizationHandler) ActivateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	idStr := c.Param("id")
	profileID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || profileID == 0 {
		response.BadRequest(c, "invalid profile id")
		return
	}

	profile, err := h.svc.SetActiveProfile(c.Request.Context(), userID, uint(profileID))
	if err != nil {
		response.InternalError(c, "failed to activate profile")
		return
	}
	response.OK(c, dto.MapProfileToResponse(profile))
}

// GET /api/personalization/recommendations?limit=10
func (h *PersonalizationHandler) GetRecommendations(c *gin.Context) {
	userID := middleware.GetUserID(c)

	limit := 10
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	items, err := h.svc.GetRecommendations(c.Request.Context(), userID, limit)
	if err != nil {
		response.InternalError(c, "failed to compute recommendations")
		return
	}
	response.OK(c, items)
}
