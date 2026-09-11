package domain

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// DomainWithCounts pairs a Domain with its published article/course counts.
type DomainWithCounts struct {
	Domain       *entity.Domain
	ArticleCount int64
	CourseCount  int64
}

type Service interface {
	GetAll(ctx context.Context) ([]DomainWithCounts, error)
}

type service struct {
	domainRepo  repository.DomainRepository
	articleRepo repository.ArticleRepository
	courseRepo  repository.CourseRepository
}

func NewService(domainRepo repository.DomainRepository, articleRepo repository.ArticleRepository, courseRepo repository.CourseRepository) Service {
	return &service{domainRepo: domainRepo, articleRepo: articleRepo, courseRepo: courseRepo}
}

func (s *service) GetAll(ctx context.Context) ([]DomainWithCounts, error) {
	domains, err := s.domainRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]DomainWithCounts, len(domains))
	for i, d := range domains {
		articleCount, err := s.articleRepo.CountPublishedByDomainID(ctx, d.ID)
		if err != nil {
			return nil, err
		}
		courseCount, err := s.courseRepo.CountPublishedByDomainID(ctx, d.ID)
		if err != nil {
			return nil, err
		}
		result[i] = DomainWithCounts{Domain: d, ArticleCount: articleCount, CourseCount: courseCount}
	}
	return result, nil
}
