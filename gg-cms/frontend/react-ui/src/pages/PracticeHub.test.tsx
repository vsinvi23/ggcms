import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import PracticeHub from './PracticeHub';
import {
  markArticleAsRead,
  markArticleAsReferred,
  getArticleReadState,
  markCourseAsReferred,
  updateCourseProgress,
  getCourseProgressState,
  collectGuestProgress,
  clearGuestProgress,
} from '@/lib/contentStateStore';

// Mock components & hooks
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="public-layout">{children}</div>,
}));

const cmsItems = vi.hoisted(() => ({ items: [] as Record<string, unknown>[] }));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({ data: { items: cmsItems.items }, isLoading: false }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [{ id: 1, name: 'Security' }],
  }),
}));

describe('contentStateStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('collects guest progress for sync and clears it afterwards', () => {
    localStorage.setItem('ggcms_completed_lessons_7', JSON.stringify([1, 2]));
    updateCourseProgress(9, [4], 4);
    const items = collectGuestProgress();
    expect(items).toEqual(
      expect.arrayContaining([
        { courseId: 7, completedLessonIds: [1, 2] },
        { courseId: 9, completedLessonIds: [4] },
      ]),
    );
    clearGuestProgress();
    expect(collectGuestProgress()).toEqual([]);
    expect(localStorage.getItem('ggcms_completed_lessons_7')).toBeNull();
  });

  it('marks article as referred and read correctly', () => {
    expect(getArticleReadState(55)).toBeNull();

    markArticleAsReferred(55);
    const referredState = getArticleReadState(55);
    expect(referredState?.status).toBe('REFERRED');
    expect(referredState?.isReferred).toBe(true);
    expect(referredState?.isRead).toBe(false);

    markArticleAsRead(55, true);
    const readState = getArticleReadState(55);
    expect(readState?.status).toBe('READ');
    expect(readState?.isRead).toBe(true);

    // markArticleAsReferred should not downgrade a READ article
    markArticleAsReferred(55);
    expect(getArticleReadState(55)?.status).toBe('READ');
  });

  it('handles course referred status and completes ONLY when all lessons finished', () => {
    expect(getCourseProgressState(200)).toBeNull();

    markCourseAsReferred(200);
    const initial = getCourseProgressState(200);
    expect(initial?.status).toBe('REFERRED');
    expect(initial?.isCompleted).toBe(false);

    // Partial lessons completed -> REFERRED (In Progress)
    const partial = updateCourseProgress(200, [1, 2], 4);
    expect(partial.status).toBe('REFERRED');
    expect(partial.progress).toBe(50);
    expect(partial.isCompleted).toBe(false);

    // All lessons completed -> COMPLETED (100%)
    const full = updateCourseProgress(200, [1, 2, 3, 4], 4);
    expect(full.status).toBe('COMPLETED');
    expect(full.progress).toBe(100);
    expect(full.isCompleted).toBe(true);
  });
});

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/auth/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('@/components/assessment/AssessmentTaker', () => ({
  AssessmentTaker: ({ assessmentId }: { assessmentId: number }) => <div data-testid="taker">{assessmentId}</div>,
}));

const assessment = {
  id: 101,
  title: 'OAuth 2.0 Security Practice Test',
  slug: 'oauth-security-practice',
  description: 'Comprehensive OAuth test',
  type: 'COURSE',
  courseType: 'ASSESSMENT',
  categoryName: 'Security',
  interactiveMetadata: JSON.stringify({ questions: [{ id: 'q1', question: 'Q?', options: ['a', 'b'] }] }),
};

describe('PracticeHub Component', () => {
  beforeEach(() => {
    localStorage.clear();
    auth.isAuthenticated = true;
  });

  it('shows an empty state when no assessments exist', () => {
    cmsItems.items = [];
    render(<MemoryRouter><PracticeHub /></MemoryRouter>);
    expect(screen.getByText(/No practice tests are published yet/)).toBeInTheDocument();
  });

  it('lists real assessments and ignores non-assessment courses', () => {
    cmsItems.items = [assessment, { ...assessment, id: 5, title: 'Plain course', courseType: 'STANDARD' }];
    render(<MemoryRouter><PracticeHub /></MemoryRouter>);
    expect(screen.getByText('OAuth 2.0 Security Practice Test')).toBeInTheDocument();
    expect(screen.queryByText('Plain course')).toBeNull();
    expect(screen.getByText('1 questions')).toBeInTheDocument();
  });

  it('mounts the server-backed taker for a selected assessment', () => {
    cmsItems.items = [assessment];
    render(
      <MemoryRouter initialEntries={['/practice/oauth-security-practice']}>
        <Routes><Route path="/practice/:quizId" element={<PracticeHub />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('taker')).toHaveTextContent('101');
  });

  it('asks anonymous visitors to sign in instead of starting a test', () => {
    auth.isAuthenticated = false;
    cmsItems.items = [assessment];
    render(
      <MemoryRouter initialEntries={['/practice/101']}>
        <Routes><Route path="/practice/:quizId" element={<PracticeHub />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('taker')).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in to start/i })).toBeInTheDocument();
  });
});
