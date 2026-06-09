package dto

type LoginRequest struct {
	Identifier string `json:"identifier" binding:"required"`
	Password   string `json:"password" binding:"required"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
}

type AuthUserResponse struct {
	ID     uint   `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Role   string `json:"role,omitempty"`
}

type AuthResponse struct {
	JWT  string           `json:"jwt"`
	User AuthUserResponse `json:"user"`
}
