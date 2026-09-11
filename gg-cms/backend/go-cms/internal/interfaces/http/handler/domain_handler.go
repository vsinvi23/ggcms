package handler

import (
	"github.com/gin-gonic/gin"
	domainsvc "github.com/serenya/go-cms/internal/application/domain"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/pkg/response"
)

type DomainHandler struct {
	service domainsvc.Service
}

func NewDomainHandler(svc domainsvc.Service) *DomainHandler {
	return &DomainHandler{service: svc}
}

// GET /api/domains
func (h *DomainHandler) GetAll(c *gin.Context) {
	domains, err := h.service.GetAll(c.Request.Context())
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	items := make([]dto.DomainResponse, len(domains))
	for i, d := range domains {
		items[i] = dto.DomainResponse{
			ID:           d.Domain.ID,
			Name:         d.Domain.Name,
			Slug:         d.Domain.Slug,
			Description:  d.Domain.Description,
			Icon:         d.Domain.Icon,
			ArticleCount: d.ArticleCount,
			CourseCount:  d.CourseCount,
		}
	}
	response.OK(c, items)
}
