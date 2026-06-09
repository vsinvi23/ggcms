package dto

type UserResponse struct {
	ID        uint     `json:"id"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	MobileNo  *string  `json:"mobileNo,omitempty"`
	Status    string   `json:"status"`
	LastLogin *string  `json:"lastLogin,omitempty"`
	CreatedAt string   `json:"createdAt"`
	Groups    []string `json:"groups"`
	GroupIDs  []uint   `json:"groupIds"`
}

type CreateUserRequest struct {
	Name     string  `json:"name" binding:"required"`
	Email    string  `json:"email" binding:"required,email"`
	Password string  `json:"password" binding:"required,min=6"`
	GroupID  *uint   `json:"groupId,omitempty"`
}

type UpdateUserRequest struct {
	Name     string  `json:"name"`
	MobileNo *string `json:"mobileNo,omitempty"`
	Status   *string `json:"status,omitempty"`
	GroupID  *uint   `json:"groupId,omitempty"`
}
