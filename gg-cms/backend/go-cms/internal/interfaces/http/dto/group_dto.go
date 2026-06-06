package dto

import "github.com/serenya/go-cms/internal/domain/entity"

type GroupUserResponse struct {
	ID    uint   `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type GroupResponse struct {
	ID          uint                      `json:"id"`
	Name        string                    `json:"name"`
	Role        string                    `json:"role"`
	Permissions entity.GroupPermissions   `json:"permissions"`
	Users       []GroupUserResponse       `json:"users,omitempty"`
}

type CreateGroupRequest struct {
	Data struct {
		Name        string                   `json:"name" binding:"required"`
		Role        string                   `json:"role"`
		Permissions *entity.GroupPermissions `json:"permissions"`
	} `json:"data" binding:"required"`
}

type UpdateGroupRequest struct {
	Data struct {
		Name        string                   `json:"name"`
		Role        string                   `json:"role"`
		Permissions *entity.GroupPermissions `json:"permissions"`
	} `json:"data"`
}

type AddMemberRequest struct {
	UserID uint `json:"userId" binding:"required"`
}
