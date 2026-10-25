package dto

type LoginRequest struct {
	Identifier string `json:"identifier" binding:"required,max=254"`
	Password   string `json:"password" binding:"required,max=1024"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email" binding:"required,email,max=254"`
	Password string `json:"password" binding:"required,max=1024"`
	Name     string `json:"name" binding:"required,max=400"`
}

type AuthUserResponse struct {
	ID            uint   `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	Role          string `json:"role,omitempty"`
	EmailVerified bool   `json:"emailVerified"`
	PasswordSet   bool   `json:"passwordSet"`
}

// AuthResponse carries the user only; tokens travel exclusively in HttpOnly cookies.
type AuthResponse struct {
	User AuthUserResponse `json:"user"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email,max=254"`
}

type ResetPasswordRequest struct {
	Code                 string `json:"code" binding:"required,max=256"`
	Password             string `json:"password" binding:"required,max=1024"`
	PasswordConfirmation string `json:"passwordConfirmation" binding:"required,eqfield=Password"`
}

type RecoverPasswordRequest struct {
	Email       string `json:"email" binding:"required,email"`
	NewPassword string `json:"newPassword" binding:"required,max=1024"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"max=1024"`
	NewPassword     string `json:"newPassword" binding:"required,max=1024"`
}

type ReauthRequest struct {
	Password string `json:"password" binding:"required,max=1024"`
}

type VerifyEmailRequest struct {
	Token string `json:"token" binding:"required,max=256"`
}

type VerifyEmailResponse struct {
	Status string            `json:"status"`
	User   *AuthUserResponse `json:"user,omitempty"`
}

type LinkConfirmRequest struct {
	Ticket   string `json:"ticket" binding:"required,max=256"`
	Password string `json:"password" binding:"required,max=1024"`
}

type TicketRequest struct {
	Ticket string `json:"ticket" binding:"required,max=256"`
}

type SocialEmailRequest struct {
	Ticket string `json:"ticket" binding:"required,max=256"`
	Email  string `json:"email" binding:"required,email,max=254"`
}

type MeResponse struct {
	UserResponse
	EmailVerified bool   `json:"emailVerified"`
	PasswordSet   bool   `json:"passwordSet"`
	AvatarURL     string `json:"avatarUrl,omitempty"`
}
