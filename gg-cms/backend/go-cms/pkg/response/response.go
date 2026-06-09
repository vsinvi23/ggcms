package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type PagedResponse struct {
	Success     bool        `json:"success"`
	Items       interface{} `json:"items"`
	Total       int64       `json:"total"`
	CurrentPage int         `json:"currentPage"`
	PageSize    int         `json:"pageSize"`
}

// StrapiPagedResponse matches the Strapi REST response shape expected by the frontend:
//
//	{ "data": [...], "meta": { "pagination": { "page": 1, "pageSize": 10, "pageCount": N, "total": N } } }
type StrapiPagedResponse struct {
	Data interface{}        `json:"data"`
	Meta StrapiPagedMeta    `json:"meta"`
}

type StrapiPagedMeta struct {
	Pagination StrapiPagination `json:"pagination"`
}

type StrapiPagination struct {
	Page      int   `json:"page"`      // 1-based
	PageSize  int   `json:"pageSize"`
	PageCount int   `json:"pageCount"`
	Total     int64 `json:"total"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{Success: true, Data: data})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{Success: true, Data: data})
}

func Paged(c *gin.Context, items interface{}, total int64, page, size int) {
	c.JSON(http.StatusOK, PagedResponse{
		Success:     true,
		Items:       items,
		Total:       total,
		CurrentPage: page,
		PageSize:    size,
	})
}

// StrapiPaged returns a Strapi-compatible paginated response.
// page is 0-based internally; it is converted to 1-based in the response.
func StrapiPaged(c *gin.Context, data interface{}, total int64, page, size int) {
	pageCount := 0
	if size > 0 {
		pageCount = int((total + int64(size) - 1) / int64(size))
	}
	c.JSON(http.StatusOK, StrapiPagedResponse{
		Data: data,
		Meta: StrapiPagedMeta{
			Pagination: StrapiPagination{
				Page:      page + 1, // convert to 1-based
				PageSize:  size,
				PageCount: pageCount,
				Total:     total,
			},
		},
	})
}

func BadRequest(c *gin.Context, msg string) {
	c.JSON(http.StatusBadRequest, Response{Success: false, Message: msg})
}

func Unauthorized(c *gin.Context, msg string) {
	c.JSON(http.StatusUnauthorized, Response{Success: false, Message: msg})
}

func Forbidden(c *gin.Context, msg string) {
	c.JSON(http.StatusForbidden, Response{Success: false, Message: msg})
}

func NotFound(c *gin.Context, msg string) {
	c.JSON(http.StatusNotFound, Response{Success: false, Message: msg})
}

func InternalError(c *gin.Context, msg string) {
	c.JSON(http.StatusInternalServerError, Response{Success: false, Message: msg})
}

func Conflict(c *gin.Context, msg string) {
	c.JSON(http.StatusConflict, Response{Success: false, Message: msg})
}
