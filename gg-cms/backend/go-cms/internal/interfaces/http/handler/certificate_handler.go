package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	certsvc "github.com/serenya/go-cms/internal/application/certificate"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/dto"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/response"
)

type CertificateHandler struct {
	service certsvc.Service
}

func NewCertificateHandler(svc certsvc.Service) *CertificateHandler {
	return &CertificateHandler{service: svc}
}

// GET /api/certificates/me
func (h *CertificateHandler) ListMine(c *gin.Context) {
	certs, err := h.service.ListMine(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	out := make([]dto.CertificateResponse, len(certs))
	for i, cert := range certs {
		out[i] = h.mapCertificate(cert)
	}
	response.OK(c, out)
}

// GET /api/certificates/:code/pdf
func (h *CertificateHandler) PDF(c *gin.Context) {
	cert, err := h.service.GetForOwner(c.Request.Context(), middleware.GetUserID(c), middleware.IsAdmin(c), c.Param("code"))
	if err != nil || cert.Revoked {
		response.NotFound(c, "certificate not found")
		return
	}
	data, err := h.service.RenderPDF(cert)
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	c.Header("Content-Disposition", `attachment; filename="certificate-`+cert.Code+`.pdf"`)
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, "application/pdf", data)
}

// GET /api/public/certificates/:code
func (h *CertificateHandler) Verify(c *gin.Context) {
	cert, err := h.service.Verify(c.Request.Context(), c.Param("code"))
	if err != nil {
		if errors.Is(err, certsvc.ErrNotFound) {
			response.OK(c, dto.PublicCertificateResponse{Valid: false})
			return
		}
		response.InternalError(c, err.Error())
		return
	}
	issued := cert.IssuedAt.Format(time.RFC3339)
	response.OK(c, dto.PublicCertificateResponse{
		Valid: true, RecipientName: cert.RecipientName, CourseTitle: cert.CourseTitle, IssuedAt: &issued, Issuer: "GeekGully",
	})
}

// POST /api/certificates/:code/revoke (admin)
func (h *CertificateHandler) Revoke(c *gin.Context) {
	var req dto.RevokeCertificateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "a reason (max 500 chars) is required")
		return
	}
	cert, err := h.service.Revoke(c.Request.Context(), c.Param("code"), middleware.GetUserID(c), req.Reason)
	switch {
	case errors.Is(err, certsvc.ErrNotFound):
		response.NotFound(c, "certificate not found")
		return
	case errors.Is(err, certsvc.ErrAlreadyRevoke):
		response.Conflict(c, err.Error())
		return
	case err != nil:
		response.InternalError(c, err.Error())
		return
	}
	middleware.LogAudit(c, "certificate.revoke", "CERTIFICATE", cert.Code, cert.CourseTitle, map[string]interface{}{"reason": req.Reason, "userId": cert.UserID})
	response.OK(c, h.mapCertificate(cert))
}

func (h *CertificateHandler) mapCertificate(cert *entity.Certificate) dto.CertificateResponse {
	return dto.CertificateResponse{
		Code: cert.Code, CourseID: cert.CourseID, CourseTitle: cert.CourseTitle, Recipient: cert.RecipientName,
		Score: cert.Score, IssuedAt: cert.IssuedAt.Format(time.RFC3339), Revoked: cert.Revoked,
		VerifyURL: h.service.VerifyURL(cert.Code), PDFURL: "/api/certificates/" + cert.Code + "/pdf", LinkedInURL: h.service.LinkedInURL(cert),
	}
}
