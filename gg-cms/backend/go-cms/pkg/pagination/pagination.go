package pagination

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

type Params struct {
	Page int
	Size int
}

// FromQuery parses page/size from query string (0-indexed page).
func FromQuery(c *gin.Context) Params {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 0 {
		page = 0
	}
	if size <= 0 {
		size = 10
	}
	if size > 500 {
		size = 500
	}
	return Params{Page: page, Size: size}
}

// FromStrapiQuery parses Strapi-style pagination[page] / pagination[pageSize] (1-indexed).
// Converts to 0-indexed page for service layer.
func FromStrapiQuery(c *gin.Context) Params {
	pageStr := c.Query("pagination[page]")
	if pageStr == "" {
		pageStr = c.DefaultQuery("page", "1")
	}
	sizeStr := c.Query("pagination[pageSize]")
	if sizeStr == "" {
		sizeStr = c.DefaultQuery("pageSize", "10")
	}
	page, _ := strconv.Atoi(pageStr)
	size, _ := strconv.Atoi(sizeStr)
	if page < 1 {
		page = 1
	}
	if size <= 0 {
		size = 10
	}
	if size > 500 {
		size = 500
	}
	return Params{Page: page - 1, Size: size} // convert to 0-indexed
}

func (p Params) Offset() int {
	return p.Page * p.Size
}
