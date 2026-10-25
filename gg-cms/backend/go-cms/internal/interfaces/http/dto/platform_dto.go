package dto

type UpdateProfileRequest struct {
	Name      *string `json:"name"`
	MobileNo  *string `json:"mobileNo"`
	AvatarURL *string `json:"avatarUrl"`
	Bio       *string `json:"bio"`
	Location  *string `json:"location"`
	JobTitle  *string `json:"jobTitle"`
}

type ConsentRequest struct {
	PolicyVersion   string `json:"policyVersion" binding:"required,max=32"`
	Analytics       bool   `json:"analytics"`
	Personalization bool   `json:"personalization"`
	Marketing       bool   `json:"marketing"`
}

type DeleteAccountRequest struct {
	Password string `json:"password" binding:"max=1024"`
}

type RetentionPolicyResponse struct {
	ConsentPolicyVersion   string `json:"consentPolicyVersion"`
	AnalyticsRawEventsDays int    `json:"analyticsRawEventsDays"`
	AnalyticsRollupDays    int    `json:"analyticsRollupDays"`
	ReadNotificationsDays  int    `json:"readNotificationsDays"`
	SentEmailLogDays       int    `json:"sentEmailLogDays"`
	AccountDeletion        string `json:"accountDeletion"`
}
