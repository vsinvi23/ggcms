import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import PracticeHub from './PracticeHub';
import { 
  getPracticeAttempt, 
  savePracticeAttempt, 
  clearPracticeAttempt, 
  markArticleAsRead, 
  markArticleAsReferred,
  getArticleReadState,
  markCourseAsReferred,
  updateCourseProgress,
  getCourseProgressState
} from '@/lib/contentStateStore';

// Mock components & hooks
vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="public-layout">{children}</div>,
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({
    data: {
      items: [
        {
          id: 101,
          title: 'OAuth 2.0 Security Practice Test',
          slug: 'oauth-security-practice',
          description: 'Comprehensive OAuth test',
          type: 'COURSE',
          categoryName: 'Security',
        },
      ],
    },
  }),
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

  it('saves and retrieves practice attempt', () => {
    expect(getPracticeAttempt('101')).toBeNull();

    savePracticeAttempt({
      quizId: '101',
      selectedAnswers: { 0: 0, 1: 0, 2: 1, 3: 0 },
      isSubmitted: true,
      score: 100,
      totalQuestions: 4,
      correctCount: 4,
      submittedAt: new Date().toISOString(),
    });

    const saved = getPracticeAttempt('101');
    expect(saved).not.toBeNull();
    expect(saved?.score).toBe(100);
    expect(saved?.isSubmitted).toBe(true);
  });

  it('clears practice attempt on retake', () => {
    savePracticeAttempt({
      quizId: '101',
      selectedAnswers: { 0: 0 },
      isSubmitted: true,
      score: 100,
      totalQuestions: 4,
      correctCount: 4,
      submittedAt: new Date().toISOString(),
    });

    clearPracticeAttempt('101');
    expect(getPracticeAttempt('101')).toBeNull();
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

describe('PracticeHub Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders practice hub heading and quiz cards', () => {
    render(
      <BrowserRouter>
        <PracticeHub />
      </BrowserRouter>
    );

    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getAllByText('OAuth 2.0 Security Practice Test Assessment').length).toBeGreaterThan(0);
  });
});
