import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CategoryResponseDto } from '@/api/types';

/**
 * Hook to filter categories based on user's group permissions.
 * 
 * Group naming convention for content creation:
 * - {CategoryName}_Article_create - Can create articles in that category
 * - {CategoryName}_Course_create - Can create courses in that category
 * 
 * Examples:
 * - Java_Article_create → User can create articles in Java category
 * - Python_Course_create → User can create courses in Python category
 * 
 * Admin users can access all categories.
 */
export function useAllowedCategories(
  categories: CategoryResponseDto[],
  contentType: 'ARTICLE' | 'COURSE'
) {
  const { isAdmin, groupNames } = useAuth();

  const allowedCategories = useMemo(() => {
    // Admin can access all categories
    if (isAdmin) {
      return categories;
    }

    // No categories if no groups
    if (groupNames.length === 0) {
      return [];
    }

    // Filter categories based on user groups
    // Group format: {CategoryName}_{Type}_create (e.g., Java_Article_create)
    const suffix = contentType === 'ARTICLE' ? '_ARTICLE_CREATE' : '_COURSE_CREATE';

    return categories.filter((category) => {
      // Check if user has a matching group for this category
      const categoryGroupName = `${category.name.toUpperCase()}${suffix}`;
      return groupNames.includes(categoryGroupName);
    });
  }, [categories, contentType, isAdmin, groupNames]);

  return allowedCategories;
}
