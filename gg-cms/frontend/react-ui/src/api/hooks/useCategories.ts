import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService, CategoryQueryParams, CategoryPagedResponse } from '../services/categoryService';
import { CategoryCreateDto, CategoryResponseDto } from '../types';

// Query keys
export const categoryKeys = {
  all: ['categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
  paged: (params?: CategoryQueryParams) => [...categoryKeys.all, 'paged', params] as const,
  detail: (id: number) => [...categoryKeys.all, 'detail', id] as const,
};

/**
 * Hook to fetch categories (returns flat array with nested children)
 */
export const useCategories = () => {
  return useQuery({
    queryKey: categoryKeys.list(),
    queryFn: () => categoryService.getCategories(),
  });
};

/**
 * Hook to fetch paginated categories
 */
export const useCategoriesPaged = (params?: CategoryQueryParams) => {
  return useQuery({
    queryKey: categoryKeys.paged(params),
    queryFn: () => categoryService.getCategoriesPaged(params),
  });
};

/**
 * Hook to fetch a single category by ID
 */
export const useCategory = (id: number, enabled = true) => {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => categoryService.getCategory(id),
    enabled: enabled && id > 0,
  });
};

/**
 * Hook to create a new category (admin only)
 */
export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CategoryCreateDto) => categoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

/**
 * Hook to update a category (admin only)
 */
export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CategoryCreateDto }) => 
      categoryService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

/**
 * Hook to delete a category (admin only)
 */
export const useDeleteCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => categoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
};

// ============================================
// REVIEWER GROUP HOOKS
// ============================================

/**
 * Hook to fetch reviewer groups linked to a category.
 */
export const useCategoryReviewerGroups = (categoryId: number | null | undefined) => {
  return useQuery({
    queryKey: categoryId ? [...categoryKeys.detail(categoryId), 'reviewer-groups'] : categoryKeys.all,
    queryFn: () => categoryService.getCategoryReviewerGroups(categoryId!),
    enabled: !!categoryId && categoryId > 0,
  });
};

/**
 * Hook to fetch the flat list of reviewers for a category.
 * Used by the admin "Assign Reviewer" dropdown.
 */
export const useCategoryReviewers = (categoryId: number | null | undefined) => {
  return useQuery({
    queryKey: categoryId ? [...categoryKeys.detail(categoryId), 'reviewers'] : categoryKeys.all,
    queryFn: () => categoryService.getCategoryReviewers(categoryId!),
    enabled: !!categoryId && categoryId > 0,
  });
};

/**
 * Hook to link a reviewer group to a category.
 */
export const useAddCategoryReviewerGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, groupId }: { categoryId: number; groupId: number }) =>
      categoryService.addCategoryReviewerGroup(categoryId, groupId),
    onSuccess: (_, { categoryId }) => {
      queryClient.invalidateQueries({ queryKey: [...categoryKeys.detail(categoryId), 'reviewer-groups'] });
    },
  });
};

/**
 * Hook to fetch all non-virtual categories where the given group is a reviewer.
 * Used by the Group management UI to show and edit category assignments.
 */
export const useGroupCategories = (groupId: number | null | undefined) => {
  return useQuery({
    queryKey: groupId ? [...categoryKeys.all, 'group', groupId] : categoryKeys.all,
    queryFn: () => categoryService.getGroupCategories(groupId!),
    enabled: !!groupId && groupId > 0,
  });
};

/**
 * Hook to unlink a reviewer group from a category.
 */
export const useRemoveCategoryReviewerGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, groupId }: { categoryId: number; groupId: number }) =>
      categoryService.removeCategoryReviewerGroup(categoryId, groupId),
    onSuccess: (_, { categoryId }) => {
      queryClient.invalidateQueries({ queryKey: [...categoryKeys.detail(categoryId), 'reviewer-groups'] });
    },
  });
};
