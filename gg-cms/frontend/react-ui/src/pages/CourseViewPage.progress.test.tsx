import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseViewPage } from './CourseViewPage';

const svc = vi.hoisted(() => ({
  getMyEnrollment: vi.fn(),
  getMyEnrollments: vi.fn(),
  getResume: vi.fn(),
  updateProgress: vi.fn(),
  syncLocal: vi.fn(),
  enroll: vi.fn(),
  drop: vi.fn(),
}));
vi.mock('@/api/services/enrollmentService', () => ({ enrollmentService: svc }));

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: auth.isAuthenticated, isLoading: false, isAdmin: false, isMasterAdmin: false, canQuickEditPublic: false }),
}));

vi.mock('@/components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/auth/AuthModal', () => ({ AuthModal: () => null }));
vi.mock('@/components/engagement/HighlightOverlay', () => ({ HighlightOverlay: () => null }));
vi.mock('@/components/engagement/HighlightsPanel', () => ({ HighlightsPanel: () => null }));
vi.mock('@/components/engagement/InteractionBar', () => ({ InteractionBar: () => null }));
vi.mock('@/components/shared/CommentsSection', () => ({ CommentsSection: () => null }));

vi.mock('@/api/hooks/usePublicCms', () => ({
  usePublicCmsById: () => ({
    data: { id: 7, slug: 'go-basics', type: 'COURSE', title: 'Go Basics', description: 'Learn Go', body: null, categoryName: 'Programming', status: 'PUBLISHED' },
    isLoading: false,
  }),
  usePublicCmsList: () => ({ data: { items: [] }, isLoading: false }),
  usePublicLearningPathById: () => ({ data: undefined }),
  usePublicLearningPaths: () => ({ data: [] }),
}));

vi.mock('@/api/hooks/useSections', () => ({
  useSectionsByCourse: () => ({
    data: [
      {
        id: 1,
        title: 'Intro',
        order: 1,
        lessons: [
          { id: 11, title: 'Hello Go', type: 'text', duration: 5, order: 1, content: '<p>Welcome lesson</p>' },
          { id: 12, title: 'Second lesson', type: 'text', duration: 5, order: 2, content: '<p>Second body</p>' },
        ],
      },
    ],
  }),
}));

vi.mock('@/api/hooks/useCms', () => ({
  useUpdateCms: () => ({ mutateAsync: vi.fn() }),
  useSubmitCmsForReview: () => ({ mutateAsync: vi.fn() }),
  useCmsById: () => ({ data: undefined }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const enrollment = { id: 5, status: 'active', progress: 0, enrolledAt: null, lastAccessedAt: null, completedAt: null, course: { id: 7, title: 'Go Basics' }, completedLessons: [] };

function renderPage(url = '/course/programming/go-basics?learn=true') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/course/*" element={<CourseViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CourseViewPage server-authoritative progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.isAuthenticated = true;
    svc.getMyEnrollment.mockResolvedValue(enrollment);
    svc.getMyEnrollments.mockResolvedValue([enrollment]);
    svc.syncLocal.mockResolvedValue([]);
  });

  it('opens the next lesson from resume (not local progress) and completes that lesson', async () => {
    localStorage.setItem('ggcms_completed_lessons_7', JSON.stringify([12]));
    svc.getResume.mockResolvedValue({
      enrollmentId: 5, courseId: 7, status: 'active', progress: 50, totalLessons: 2, completedCount: 1,
      completedLessonIds: [11], lastLessonId: 11, nextLesson: { id: 12, title: 'Second lesson', type: 'text', sectionId: 1 },
      awaitingAssessment: false, assessmentId: null,
    });
    svc.updateProgress.mockResolvedValue({ ...enrollment, progress: 100 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Mark as Complete/i }));
    await waitFor(() => expect(svc.updateProgress).toHaveBeenCalledTimes(1));
    expect(svc.updateProgress).toHaveBeenCalledWith(5, { completedLessons: [{ id: 12 }], lastLessonId: 12 });
  });

  it('marks complete via PUT with completedLessons and lastLessonId, never progress', async () => {
    svc.getResume.mockResolvedValue({
      enrollmentId: 5, courseId: 7, status: 'active', progress: 0, totalLessons: 2, completedCount: 0,
      completedLessonIds: [], lastLessonId: null, nextLesson: { id: 11, title: 'Hello Go', type: 'text', sectionId: 1 },
      awaitingAssessment: false, assessmentId: null,
    });
    svc.updateProgress.mockResolvedValue({ ...enrollment, progress: 50 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Mark as Complete/i }));
    await waitFor(() => expect(svc.updateProgress).toHaveBeenCalledTimes(1));
    expect(svc.updateProgress).toHaveBeenCalledWith(5, { completedLessons: [{ id: 11 }], lastLessonId: 11 });
  });

  it('shows the assessment call to action when the server says an assessment is required', async () => {
    svc.getResume.mockResolvedValue({
      enrollmentId: 5, courseId: 7, status: 'active', progress: 100, totalLessons: 2, completedCount: 2,
      completedLessonIds: [11, 12], lastLessonId: 12, nextLesson: null, awaitingAssessment: true, assessmentId: 40,
    });
    renderPage('/course/programming/go-basics');
    expect(await screen.findByRole('button', { name: /Take the assessment/i })).toBeInTheDocument();
  });
});
