package dto

type CategoryResponse struct {
	ID                uint               `json:"id"`
	Name              string             `json:"name"`
	Slug              string             `json:"slug"`
	ParentID          *uint              `json:"parentId,omitempty"`
	IsVirtual         bool               `json:"isVirtual,omitempty"`
	RequiredApprovals int                `json:"requiredApprovals"`
	Children          []CategoryResponse `json:"children,omitempty"`
}

type CreateCategoryRequest struct {
	Data struct {
		Name     string `json:"name" binding:"required"`
		ParentID *uint  `json:"parentId,omitempty"`
	} `json:"data" binding:"required"`
}

type UpdateCategoryRequest struct {
	Data struct {
		Name              string `json:"name"`
		ParentID          *uint  `json:"parentId,omitempty"`
		RequiredApprovals int    `json:"requiredApprovals"`
	} `json:"data"`
}

type ReviewerGroupResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type ReviewerResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type AddReviewerGroupRequest struct {
	GroupID uint `json:"groupId" binding:"required"`
}
