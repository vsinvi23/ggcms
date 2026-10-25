import type { UserEngagementRow, UserPreferences } from '@/api/types';

export const preferencesFixture: UserPreferences = {
  notifications: {
    review_decision: { inApp: true, email: true },
    review_assigned: { inApp: true, email: true },
    content_published: { inApp: true, email: true },
    comment_reply: { inApp: true, email: true },
    comment_mention: { inApp: true, email: true },
    enrollment: { inApp: true, email: false },
    course_completed: { inApp: true, email: true },
    welcome: { inApp: true, email: true },
  },
  digestFrequency: 'weekly',
  emailUnsubscribed: false,
  privacy: { profilePublic: false, showActivity: false },
  appearance: { theme: 'system', language: 'en' },
  profile: { bio: '', location: '', jobTitle: '' },
};

export const engagementFixture: UserEngagementRow[] = [
  {
    userId: 1,
    name: 'Asha Rao',
    email: 'asha@example.com',
    score: 82,
    level: 'high',
    churnRisk: 'low',
    atRisk: false,
    lastActiveAt: '2026-10-20T10:00:00Z',
    activeDays30d: 14,
    reads30d: 20,
    lessonsCompleted30d: 9,
  },
  {
    userId: 2,
    name: 'Ben =Cmd',
    email: 'ben@example.com',
    score: 12,
    level: 'dormant',
    churnRisk: 'high',
    atRisk: true,
    lastActiveAt: null,
    activeDays30d: 0,
    reads30d: 0,
    lessonsCompleted30d: 0,
  },
];
