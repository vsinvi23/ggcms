package engagement

import (
	"context"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

// FavouriteResult is returned by Toggle.
type FavouriteResult struct {
	IsFavourited bool `json:"isFavourited"`
}

// FavouriteService manages user bookmarks/favourites per content item.
type FavouriteService interface {
	Toggle(ctx context.Context, userID uint, contentType string, contentID uint) (*FavouriteResult, error)
	IsFavourited(ctx context.Context, userID uint, contentType string, contentID uint) (bool, error)
	ListUserFavourites(ctx context.Context, userID uint, page, size int) ([]*entity.Favourite, int64, error)
}

type favouriteService struct {
	favouriteRepo repository.FavouriteRepository
}

func NewFavouriteService(favouriteRepo repository.FavouriteRepository) FavouriteService {
	return &favouriteService{favouriteRepo: favouriteRepo}
}

func (s *favouriteService) Toggle(ctx context.Context, userID uint, contentType string, contentID uint) (*FavouriteResult, error) {
	f := &entity.Favourite{
		UserID:      userID,
		ContentType: contentType,
		ContentID:   contentID,
	}
	added, err := s.favouriteRepo.Toggle(ctx, f)
	if err != nil {
		return nil, err
	}
	return &FavouriteResult{IsFavourited: added}, nil
}

func (s *favouriteService) IsFavourited(ctx context.Context, userID uint, contentType string, contentID uint) (bool, error) {
	return s.favouriteRepo.IsFavourited(ctx, userID, contentType, contentID)
}

func (s *favouriteService) ListUserFavourites(ctx context.Context, userID uint, page, size int) ([]*entity.Favourite, int64, error) {
	return s.favouriteRepo.ListByUser(ctx, userID, page, size)
}
