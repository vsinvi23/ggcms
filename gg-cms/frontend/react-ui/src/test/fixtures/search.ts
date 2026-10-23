import type { PersonalizationFeed, SearchHit, SearchResponse, SuggestResponse } from '@/api/types';

export const searchHitArticle: SearchHit = {
  type: 'article',
  id: 11,
  publicId: 'a-11',
  slug: 'oauth-guide',
  path: '/article/security/oauth-guide',
  title: 'OAuth guide',
  titleHtml: '<mark>OAuth</mark> guide',
  snippetHtml: 'Learn the <mark>OAuth</mark> flows<script>alert(1)</script><img src=x onerror="alert(2)">',
  category: { id: 1, name: 'Security', slug: 'security' },
  level: 'beginner',
  subtype: 'GUIDE',
  score: 0.9,
};

export const searchHitCourse: SearchHit = {
  type: 'course',
  id: 21,
  publicId: 'c-21',
  slug: 'identity-basics',
  path: '/course/security/identity-basics',
  title: 'Identity basics',
  titleHtml: 'Identity basics',
  description: 'Fundamentals of identity',
  category: { id: 1, name: 'Security', slug: 'security' },
  matchedLesson: 'OAuth in practice',
  score: 0.5,
};

export const searchResponse = (page = 0, totalPages = 3): SearchResponse => ({
  query: 'oauth',
  total: 25,
  page,
  size: 10,
  totalPages,
  hits: [searchHitArticle, searchHitCourse],
});

export const emptySearchResponse: SearchResponse = { query: 'oautth', total: 0, page: 0, size: 10, totalPages: 0, hits: [] };

export const suggestResponse: SuggestResponse = {
  query: 'oau',
  titles: [
    { type: 'article', id: 11, title: 'OAuth guide', path: '/article/security/oauth-guide' },
    { type: 'course', id: 21, title: 'Identity basics', path: '/course/security/identity-basics' },
  ],
  topics: [{ id: 5, name: 'OAuth', slug: 'oauth' }],
  categories: [{ id: 1, name: 'Security', slug: 'security' }],
  queries: ['oauth flows'],
};

export const feedFixture = (recId: string, coldStart = false): PersonalizationFeed => ({
  recId,
  coldStart,
  generatedAt: '2026-01-01T00:00:00Z',
  continue: {
    kind: 'in_progress',
    reasonCode: 'CONTINUE_COURSE',
    reason: 'Continue where you left off',
    courseId: 7,
    courseSlug: 'go-basics',
    courseTitle: 'Go basics',
    progress: 40,
    recId,
  },
  items: [
    {
      id: 11,
      publicId: 'a-11',
      slug: 'oauth-guide',
      title: 'OAuth guide',
      description: null,
      thumbnailUrl: null,
      categoryId: 1,
      categoryName: 'Security',
      contentType: 'article',
      score: 1.2,
      reasonCode: 'NEXT_STEP',
      reason: 'Because you completed Identity basics',
      position: 1,
      recId,
    },
    {
      id: 22,
      publicId: 'c-22',
      slug: 'tls-deep-dive',
      title: 'TLS deep dive',
      description: null,
      thumbnailUrl: null,
      categoryId: 1,
      categoryName: 'Security',
      contentType: 'course',
      score: 0.8,
      reasonCode: 'TRENDING',
      reason: 'Trending now',
      position: 2,
      recId,
    },
  ],
});
