package entity

import "time"

type RefreshToken struct {
	ID        string `gorm:"primaryKey;column:id"`
	UserID    uint   `gorm:"not null;index"`
	FamilyID  string `gorm:"not null;index"`
	TokenHash string `gorm:"not null;size:64"`
	AuthTime  time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
	RevokedAt *time.Time
	UserAgent string `gorm:"size:255"`
	IP        string `gorm:"size:64"`
	CreatedAt time.Time
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

type UserIdentity struct {
	ID             uint   `gorm:"primaryKey;autoIncrement"`
	UserID         uint   `gorm:"not null;index"`
	Provider       string `gorm:"not null;size:32"`
	ProviderUserID string `gorm:"not null;size:255"`
	ProviderEmail  string `gorm:"size:320"`
	EmailVerified  bool   `gorm:"not null;default:false"`
	DisplayName    string `gorm:"size:255"`
	AvatarURL      string
	LinkedAt       time.Time
	LastLoginAt    *time.Time
}

func (UserIdentity) TableName() string { return "user_identities" }

type OAuthTransaction struct {
	State        string `gorm:"primaryKey;size:64"`
	Provider     string `gorm:"not null;size:32"`
	Nonce        string `gorm:"not null;size:64"`
	CodeVerifier string `gorm:"not null;size:128"`
	BindingHash  string `gorm:"not null;size:64"`
	Intent       string `gorm:"not null;size:8"`
	LinkUserID   *uint
	RedirectPath string `gorm:"size:512"`
	ExpiresAt    time.Time
	UsedAt       *time.Time
	CreatedAt    time.Time
}

func (OAuthTransaction) TableName() string { return "oauth_transactions" }

const (
	EmailTokenVerify        = "verify_email"
	EmailTokenConfirmLink   = "confirm_link"
	EmailTokenLinkTicket    = "link_ticket"
	EmailTokenSignupTicket  = "signup_ticket"
	EmailTokenSignupConfirm = "signup_email"
)

type EmailVerificationToken struct {
	ID              string `gorm:"primaryKey;column:id"`
	UserID          *uint
	Email           string  `gorm:"not null;size:320"`
	TokenHash       string  `gorm:"not null;size:64"`
	Purpose         string  `gorm:"not null;size:24"`
	PendingIdentity *string `gorm:"type:jsonb"`
	ExpiresAt       time.Time
	UsedAt          *time.Time
	CreatedAt       time.Time
}

func (EmailVerificationToken) TableName() string { return "email_verification_tokens" }
