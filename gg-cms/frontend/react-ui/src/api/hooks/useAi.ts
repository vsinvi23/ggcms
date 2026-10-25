import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiService } from '../services/aiService';
import { useAuth } from '@/contexts/AuthContext';
import {
  AiContentType, AiDifficulty, AiDraftKind, AiLevel, AiModerationStatus, AiSettingsUpdate, AiStatus, TutorAskRequest,
} from '../types';

export const aiKeys = {
  all: ['ai'] as const,
  status: () => [...aiKeys.all, 'status'] as const,
  drafts: (t: AiContentType, id: number, kind?: AiDraftKind) => [...aiKeys.all, 'drafts', t, id, kind ?? 'all'] as const,
  conversations: () => [...aiKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...aiKeys.all, 'conversation', id] as const,
  settings: () => [...aiKeys.all, 'settings'] as const,
  usage: (from?: string, to?: string) => [...aiKeys.all, 'usage', from ?? '', to ?? ''] as const,
  moderation: (status: AiModerationStatus, page: number) => [...aiKeys.all, 'moderation', status, page] as const,
};

export const useAiStatus = () => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: aiService.getStatus,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });
};

export type AiFeature = keyof AiStatus['features'];

/** Single gate for every AI surface: visible only when the feature is on; learner features also need a verified email. */
export const useAiFeature = (feature: AiFeature) => {
  const { user } = useAuth();
  const { data, isLoading } = useAiStatus();
  const on = !!data && data.enabled && data.configured && !!data.features?.[feature];
  const learner = feature === 'tutor' || feature === 'studyPlan';
  return {
    isLoading,
    visible: on && (!learner || !!user?.emailVerified),
    needsVerification: on && learner && !user?.emailVerified,
  };
};

export const useSuggestTags = () =>
  useMutation({ mutationFn: ({ t, id }: { t: AiContentType; id: number }) => aiService.suggestTags(t, id) });
export const useGenerateSummary = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ t, id }: { t: AiContentType; id: number }) => aiService.generateSummary(t, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...aiKeys.all, 'drafts'] }),
  });
};
export const useGenerateSeo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ t, id }: { t: AiContentType; id: number }) => aiService.generateSeo(t, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...aiKeys.all, 'drafts'] }),
  });
};
export const useQualityCheck = () =>
  useMutation({ mutationFn: ({ t, id }: { t: AiContentType; id: number }) => aiService.qualityCheck(t, id) });
export const useGenerateQuiz = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { t: AiContentType; id: number; count: number; difficulty: AiDifficulty }) =>
      aiService.generateQuiz(v.t, v.id, v.count, v.difficulty),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...aiKeys.all, 'drafts'] }),
  });
};
export const useAiDrafts = (t: AiContentType, id: number, kind: AiDraftKind | undefined, enabled: boolean) =>
  useQuery({ queryKey: aiKeys.drafts(t, id, kind), queryFn: () => aiService.listDrafts(t, id, kind), enabled: enabled && id > 0, retry: false });
export const useResolveDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => aiService.resolveDraft(id, accept),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...aiKeys.all, 'drafts'] }),
  });
};

export const useTutorAsk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: TutorAskRequest) => aiService.ask(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.conversations() }),
  });
};
export const useTutorConversations = (enabled: boolean) =>
  useQuery({ queryKey: aiKeys.conversations(), queryFn: aiService.listConversations, enabled, retry: false });
export const useTutorConversation = (id: string | null) =>
  useQuery({ queryKey: aiKeys.conversation(id ?? ''), queryFn: () => aiService.getConversation(id ?? ''), enabled: !!id, retry: false });
export const useDeleteConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiService.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.conversations() }),
  });
};
export const useTutorFeedback = () =>
  useMutation({ mutationFn: (v: { messageId: number; rating: 1 | -1 }) => aiService.sendFeedback(v.messageId, v.rating) });
export const useStudyPlan = () =>
  useMutation({ mutationFn: (v: { goals: string; level: AiLevel }) => aiService.studyPlan(v.goals, v.level) });

export const useAiSettings = (enabled = true) =>
  useQuery({ queryKey: aiKeys.settings(), queryFn: aiService.getSettings, enabled, retry: false });
export const useUpdateAiSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: AiSettingsUpdate) => aiService.updateSettings(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiKeys.settings() });
      qc.invalidateQueries({ queryKey: aiKeys.status() });
    },
  });
};
export const useAiUsage = (from?: string, to?: string) =>
  useQuery({ queryKey: aiKeys.usage(from, to), queryFn: () => aiService.getUsage(from, to), retry: false });
export const useAiModeration = (status: AiModerationStatus, page: number) =>
  useQuery({ queryKey: aiKeys.moderation(status, page), queryFn: () => aiService.getModeration(status, page), retry: false });
export const useResolveModeration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) => aiService.resolveModeration(id, approve),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...aiKeys.all, 'moderation'] }),
  });
};
export const useReindex = () => useMutation({ mutationFn: aiService.reindex });
