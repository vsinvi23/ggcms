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
  getArticleReadState 
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

  it('marks article as read and retrieves read state', () => {
    expect(getArticleReadState(55)).toBeNull();

    markArticleAsRead(55, true);
    const state = getArticleReadState(55);
    expect(state).not.toBeNull();
    expect(state?.isRead).toBe(true);

    markArticleAsRead(55, false);
    expect(getArticleReadState(55)?.isRead).toBe(false);
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
