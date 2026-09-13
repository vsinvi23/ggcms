package entity

import "time"

type ContentGenerationRun struct {
	ID              uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	ContentID       uint       `gorm:"not null;index:idx_gen_runs_content" json:"content_id"`
	ContentType     string     `gorm:"type:varchar(20);not null;index:idx_gen_runs_content" json:"content_type"`
	Model           string     `gorm:"type:varchar(100);not null;index:idx_gen_runs_model" json:"model"`
	Provider        string     `gorm:"type:varchar(100);not null;index:idx_gen_runs_model" json:"provider"`
	PromptVersion   string     `gorm:"type:varchar(50)" json:"prompt_version,omitempty"`
	AgentVersion    string     `gorm:"type:varchar(50)" json:"agent_version,omitempty"`
	KnowledgePackID string     `gorm:"type:varchar(100)" json:"knowledge_pack_id,omitempty"`
	QualityScore    *float64   `json:"quality_score,omitempty"`
	QualityReport   string     `gorm:"type:jsonb" json:"quality_report,omitempty"`
	GeneratedAt     *time.Time `json:"generated_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

func (ContentGenerationRun) TableName() string { return "content_generation_runs" }
