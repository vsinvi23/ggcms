import { AiDraft, AiSettingsView, AiStatus, TutorAnswer } from '@/api/types';

export const statusOn: AiStatus = {
  enabled: true,
  configured: true,
  features: { editorial: true, moderation: true, tutor: true, quiz: true, studyPlan: true },
};

export const statusOff: AiStatus = { ...statusOn, enabled: false };

export const groundedAnswer: TutorAnswer = {
  conversationId: 'c1',
  messageId: 7,
  answer: 'Hashing is one-way. <script>alert(1)</script>',
  grounded: true,
  citations: [
    { id: 'p1', title: 'Crypto 101', heading: 'Hashing', anchor: 'hashing', url: '/courses/crypto-101#hashing', contentType: 'course', contentId: 3 },
  ],
};

export const refusalAnswer: TutorAnswer = {
  conversationId: 'c1',
  messageId: 8,
  answer: 'I could not find support for that in this course.',
  grounded: false,
  citations: [],
};

export const summaryDraft: AiDraft = {
  id: 'd1',
  kind: 'summary',
  payload: { tldr: 'Short summary', takeaways: ['One'] },
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
};

export const settingsView: AiSettingsView = {
  enabled: true, editorialEnabled: true, moderationEnabled: false, tutorEnabled: true, quizEnabled: false, studyPlanEnabled: false,
  moderationFailClosed: false, modelDefault: 'claude-sonnet-5-5', modelCheap: 'claude-haiku-5-5',
  userPerMinute: 10, globalPerMinute: 120, userDailyTutor: 30, userDailyOther: 50,
  monthlyBudgetUsd: 50, perRequestBudgetUsd: 0.05, keyConfigured: true, provider: 'anthropic',
};
