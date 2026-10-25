import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assessmentService } from '../services/assessmentService';
import { AssessmentAnswerDto } from '../types';
import { enrollmentKeys } from './useEnrollments';
import { certificateKeys } from './useCertificates';

export const assessmentKeys = {
  all: ['assessments'] as const,
  definition: (id: number) => [...assessmentKeys.all, 'definition', id] as const,
  attempts: (id: number) => [...assessmentKeys.all, 'attempts', id] as const,
};

export const useAssessmentDefinition = (assessmentId: number, enabled = true) =>
  useQuery({
    queryKey: assessmentKeys.definition(assessmentId),
    queryFn: () => assessmentService.getDefinition(assessmentId),
    enabled: enabled && !!assessmentId,
  });

export const useMyAssessmentAttempts = (assessmentId: number, enabled = true) =>
  useQuery({
    queryKey: assessmentKeys.attempts(assessmentId),
    queryFn: () => assessmentService.getMyAttempts(assessmentId),
    enabled: enabled && !!assessmentId,
  });

export const useStartAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: number) => assessmentService.start(assessmentId),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: assessmentKeys.attempts(id) }),
  });
};

export const useSubmitAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, attemptId, answers }: { assessmentId: number; attemptId: number; answers: AssessmentAnswerDto[] }) =>
      assessmentService.submit(assessmentId, attemptId, answers),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: assessmentKeys.attempts(v.assessmentId) });
      qc.invalidateQueries({ queryKey: enrollmentKeys.all });
      qc.invalidateQueries({ queryKey: certificateKeys.all });
    },
  });
};
