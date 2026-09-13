package postgres

import (
	"context"
	"fmt"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"gorm.io/gorm"
)

type domainRepository struct {
	write *gorm.DB
	read  *gorm.DB
}

func NewDomainRepository(write, read *gorm.DB) repository.DomainRepository {
	return &domainRepository{write: write, read: read}
}

func (r *domainRepository) Create(ctx context.Context, domain *entity.Domain) error {
	return r.write.WithContext(ctx).Create(domain).Error
}

func (r *domainRepository) Update(ctx context.Context, domain *entity.Domain) error {
	return r.write.WithContext(ctx).Save(domain).Error
}

func (r *domainRepository) Delete(ctx context.Context, id uint) error {
	return r.write.WithContext(ctx).Delete(&entity.Domain{}, id).Error
}

func (r *domainRepository) FindByID(ctx context.Context, id uint) (*entity.Domain, error) {
	var domain entity.Domain
	err := r.read.WithContext(ctx).First(&domain, id).Error
	if err != nil {
		return nil, fmt.Errorf("domain not found: %w", err)
	}
	return &domain, nil
}

func (r *domainRepository) FindBySlug(ctx context.Context, slug string) (*entity.Domain, error) {
	var domain entity.Domain
	err := r.read.WithContext(ctx).Where("slug = ?", slug).First(&domain).Error
	if err != nil {
		return nil, fmt.Errorf("domain not found: %w", err)
	}
	return &domain, nil
}

func (r *domainRepository) FindAll(ctx context.Context) ([]*entity.Domain, error) {
	var domains []*entity.Domain
	err := r.read.WithContext(ctx).Order("name ASC").Find(&domains).Error
	return domains, err
}
