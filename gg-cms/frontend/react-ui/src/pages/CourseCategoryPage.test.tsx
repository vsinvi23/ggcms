import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="public-layout">{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsList: () => ({
    data: {
      items: [
        { id: 1, title: 'Intro to OAuth 2.0', categoryName: 'Identity & Access', categoryId: 10, publishedAt: '2026-01-01' },
        { id: 2, title: 'PKI Fundamentals', categoryName: 'PKI & Cryptography', categoryId: 11, publishedAt: '2026-01-02' },
      ],
    },
    isLoading: false,
  }),
  usePublicCmsBody: () => ({
    data: '',
    isLoading: false,
  }),
}));

vi.mock('@/api/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 10, name: 'Identity & Access', domainId: 1, articleCount: 28 },
      { id: 11, name: 'PKI & Cryptography', domainId: 1, articleCount: 18 },
    ],
  }),
}));

vi.mock('@/api/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useDomains', () => ({
  useDomains: () => ({
    data: [
      { id: 1, name: 'Cybersecurity', articleCount: 80, courseCount: 10 },
      { id: 2, name: 'Cloud & Infrastructure', articleCount: 90, courseCount: 14 },
      { id: 3, name: 'Software Engineering', articleCount: 120, courseCount: 18 },
      { id: 4, name: 'Data', articleCount: 70, courseCount: 8 },
      { id: 5, name: 'AI & Machine Learning', articleCount: 60, courseCount: 6 },
    ],
  }),
}));

vi.mock('@/api/hooks/useEnrollments', () => ({
  useMyEnrollments: () => ({ data: [] }),
}));

import CourseCategoryPage from './CourseCategoryPage';

function renderExplorePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/explore/articles']}>
        <Routes>
          <Route path="/explore/:category" element={<CourseCategoryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CourseCategoryPage (Panel 2 Explore Layout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inside PublicLayout', () => {
    renderExplorePage();
    expect(screen.getByTestId('public-layout')).toBeInTheDocument();
  });

  it('renders Explore header and subtitle', () => {
    renderExplorePage();
    expect(screen.getByText(/Explore Articles/i)).toBeInTheDocument();
    expect(screen.getByText(/Discover articles, step-by-step tutorials/i)).toBeInTheDocument();
  });

  it('renders StatBadges for Articles, Courses, and Learning Paths', () => {
    renderExplorePage();
    expect(screen.getByText('Articles')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Learning Paths')).toBeInTheDocument();
  });

  it('renders all 5 Domain Selection Cards', () => {
    renderExplorePage();
    expect(screen.getByText('Cybersecurity')).toBeInTheDocument();
    expect(screen.getByText('Cloud & Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.getByText('AI & Machine Learning')).toBeInTheDocument();
  });

  it('renders Category cards in selected domain', () => {
    renderExplorePage();
    expect(screen.getAllByText('Identity & Access')[0]).toBeInTheDocument();
    expect(screen.getAllByText('PKI & Cryptography')[0]).toBeInTheDocument();
  });

  it('renders Guided Learning Path CTA Banner', () => {
    renderExplorePage();
    expect(screen.getByText('Not sure where to start?')).toBeInTheDocument();
    expect(screen.getByText('Try our curated learning paths based on your goals.')).toBeInTheDocument();
    expect(screen.getByText('View Learning Paths')).toBeInTheDocument();
  });
});
