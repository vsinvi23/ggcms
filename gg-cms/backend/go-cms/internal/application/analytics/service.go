package analytics

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Service interface {
	TrackPageView(ctx context.Context, userID *uint, contentID, contentType *string, ip, userAgent string) error
	TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}, ip, userAgent string) error
	GetDashboardStats(ctx context.Context) (map[string]interface{}, error)
	GetContentViews(ctx context.Context, contentID, contentType string) (int64, error)
}

type service struct {
	analyticsRepo repository.AnalyticsRepository
}

func NewService(analyticsRepo repository.AnalyticsRepository) Service {
	return &service{analyticsRepo: analyticsRepo}
}

func (s *service) TrackPageView(ctx context.Context, userID *uint, contentID, contentType *string, ip, userAgent string) error {
	return s.TrackEvent(ctx, "page_view", userID, contentID, contentType, nil, ip, userAgent)
}

func (s *service) TrackEvent(ctx context.Context, eventType string, userID *uint, contentID, contentType *string, metadata map[string]interface{}, ip, userAgent string) error {
	event := &entity.AnalyticsEvent{
		EventType:   eventType,
		UserID:      userID,
		ContentID:   contentID,
		ContentType: contentType,
		Metadata:    metadata,
		IPAddress:   ip,
		UserAgent:   userAgent,
	}
	if err := s.analyticsRepo.TrackEvent(ctx, event); err != nil {
		// Non-fatal: log but don't fail the request
		return fmt.Errorf("analytics tracking failed: %w", err)
	}
	return nil
}

func (s *service) GetDashboardStats(ctx context.Context) (map[string]interface{}, error) {
	return s.analyticsRepo.GetDashboardStats(ctx)
}

func (s *service) GetContentViews(ctx context.Context, contentID, contentType string) (int64, error) {
	return s.analyticsRepo.GetContentViews(ctx, contentID, contentType)
}
