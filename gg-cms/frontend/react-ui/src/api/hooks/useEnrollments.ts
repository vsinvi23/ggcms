import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enrollmentService } from '../services/enrollmentService';
import { EnrollmentProgressDto } from '../types';

// Query keys
export const enrollmentKeys = {
  all: ['enrollments'] as const,
  mine: () => [...enrollmentKeys.all, 'mine'] as const,
  byCourse: (courseId: number) => [...enrollmentKeys.all, 'course', courseId] as const,
};

/**
 * Hook to fetch all enrollments for the current user
 */
export const useMyEnrollments = (enabled = true) => {
  return useQuery({
    queryKey: enrollmentKeys.mine(),
    queryFn: () => enrollmentService.getMyEnrollments(),
    enabled,
  });
};

/**
 * Hook to fetch the current user's enrollment for a course
 */
export const useMyEnrollment = (courseId: number, enabled = true) => {
  return useQuery({
    queryKey: enrollmentKeys.byCourse(courseId),
    queryFn: () => enrollmentService.getMyEnrollment(courseId),
    enabled: enabled && !!courseId,
  });
};

/**
 * Hook to enroll in a course
 */
export const useEnroll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: number) => enrollmentService.enroll(courseId),
    onSuccess: (_, courseId) =>
      qc.invalidateQueries({ queryKey: enrollmentKeys.byCourse(courseId) }),
  });
};

/**
 * Hook to update enrollment progress
 */
export const useUpdateProgress = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      enrollmentId,
      data,
    }: {
      enrollmentId: number;
      data: EnrollmentProgressDto;
    }) => enrollmentService.updateProgress(enrollmentId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: enrollmentKeys.all }),
  });
};

/**
 * Hook to drop (unenroll from) a course
 */
export const useDrop = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: number) => enrollmentService.drop(enrollmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: enrollmentKeys.all }),
  });
};
