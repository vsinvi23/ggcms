import apiClient from '../client';
import { ApiResponse, CategoryCreateDto, CategoryResponseDto, CategoryListResponse, PagedResponse, ReviewerOption, CategoryReviewerGroup } from '../types';
import { transformCategory } from '../apiHelpers';

const CATEGORIES_BASE = '/categories';

export interface CategoryQueryParams {
  page?: number;
  size?: number;
}

export interface CategoryPagedResponse {
  items: CategoryResponseDto[];
  totalElements: number;
  page: number;
  size: number;
}

// Helper to extract array from various response formats
const extractCategoriesArray = (data: unknown): CategoryResponseDto[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  // Handle paged response format { items: [...] }
  if (typeof data === 'object' && 'items' in (data as object)) {
    return (data as PagedResponse<CategoryResponseDto>).items || [];
  }
  // Handle { data: [...] } format
  if (typeof data === 'object' && 'data' in (data as object)) {
    const nestedData = (data as { data: unknown }).data;
    if (Array.isArray(nestedData)) return nestedData;
  }
  return [];
};

export const categoryService = {
  /**
   * Get list of categories with tree structure
   * GET /categories?tree=true
   * Uses custom Strapi endpoint with tree structure support
   */
  getCategories: async (): Promise<CategoryListResponse> => {
    try {
      // Use tree=true to get hierarchical structure
      const response = await apiClient.get(CATEGORIES_BASE, {
        params: { tree: 'true' },
      });
      
      const categories = response.data.data || [];
      return categories.map(transformCategory);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return [];
    }
  },

  /**
   * Get paginated list of categories (flat, not tree)
   * GET /categories?pagination[page]=1&pagination[pageSize]=10
   */
  getCategoriesPaged: async (params?: CategoryQueryParams): Promise<CategoryPagedResponse> => {
    try {
      const response = await apiClient.get(CATEGORIES_BASE, {
        params: {
          'pagination[page]': (params?.page ?? 0) + 1,
          'pagination[pageSize]': params?.size ?? 10,
        },
      });
      
      const categories = response.data.data || [];
      const pagination = response.data.meta?.pagination || {};
      
      return {
        items: categories.map(transformCategory),
        totalElements: pagination.total || 0,
        page: (pagination.page || 1) - 1,
        size: pagination.pageSize || 10,
      };
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return { items: [], totalElements: 0, page: 0, size: 10 };
    }
  },

  /**
   * Get a single category by ID
   * GET /categories/:id
   */
  getCategory: async (id: number): Promise<CategoryResponseDto> => {
    try {
      const response = await apiClient.get(`${CATEGORIES_BASE}/${id}`);
      return transformCategory(response.data.data);
    } catch (error) {
      throw new Error('Failed to fetch category');
    }
  },

  /**
   * Create a new category (admin only)
   * POST /categories
   */
  createCategory: async (data: CategoryCreateDto): Promise<CategoryResponseDto> => {
    try {
      const response = await apiClient.post(CATEGORIES_BASE, { data });
      return transformCategory(response.data.data);
    } catch (error) {
      throw new Error('Failed to create category');
    }
  },

  /**
   * Update a category (admin only)
   * PUT /categories/:id
   */
  updateCategory: async (id: number, data: CategoryCreateDto): Promise<CategoryResponseDto> => {
    try {
      const response = await apiClient.put(`${CATEGORIES_BASE}/${id}`, { data });
      return transformCategory(response.data.data);
    } catch (error) {
      throw new Error('Failed to update category');
    }
  },

  /**
   * Delete a category (admin only)
   * DELETE /categories/:id
   */
  deleteCategory: async (id: number): Promise<void> => {
    try {
      await apiClient.delete(`${CATEGORIES_BASE}/${id}`);
    } catch (error) {
      throw new Error('Failed to delete category');
    }
  },

  /**
   * Get all reviewer groups linked to a category.
   * GET /categories/:id/reviewer-groups
   */
  getCategoryReviewerGroups: async (categoryId: number): Promise<CategoryReviewerGroup[]> => {
    const response = await apiClient.get(`${CATEGORIES_BASE}/${categoryId}/reviewer-groups`);
    return response.data.data ?? [];
  },

  /**
   * Link a reviewer group to a category (idempotent).
   * POST /categories/:id/reviewer-groups  body: { groupId }
   */
  addCategoryReviewerGroup: async (categoryId: number, groupId: number): Promise<void> => {
    await apiClient.post(`${CATEGORIES_BASE}/${categoryId}/reviewer-groups`, { groupId });
  },

  /**
   * Unlink a reviewer group from a category.
   * DELETE /categories/:id/reviewer-groups/:groupId
   */
  removeCategoryReviewerGroup: async (categoryId: number, groupId: number): Promise<void> => {
    await apiClient.delete(`${CATEGORIES_BASE}/${categoryId}/reviewer-groups/${groupId}`);
  },

  /**
   * Get the flat list of all users from every reviewer group linked to a category.
   * Used by the admin "Assign Reviewer" dropdown.
   * GET /categories/:id/reviewers
   */
  getCategoryReviewers: async (categoryId: number): Promise<ReviewerOption[]> => {
    const response = await apiClient.get(`${CATEGORIES_BASE}/${categoryId}/reviewers`);
    return response.data.data ?? [];
  },

  /**
   * Get all non-virtual categories where the given group acts as a reviewer.
   * GET /user-groups/:id/categories
   */
  getGroupCategories: async (groupId: number): Promise<CategoryResponseDto[]> => {
    const response = await apiClient.get(`/user-groups/${groupId}/categories`);
    const raw: any[] = response.data.data ?? [];
    return raw.map(transformCategory).filter(Boolean) as CategoryResponseDto[];
  },
};

export default categoryService;
