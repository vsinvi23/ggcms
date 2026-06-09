import { Category, Course, Article, UserGroup, ReviewComment, VersionHistory } from '@/types/content';

// ===============================
// MOCK USER GROUPS
// ===============================

export const mockUserGroups: UserGroup[] = [
  {
    id: 'ug-1',
    name: 'Content Reviewers',
    description: 'Team responsible for reviewing content before publication',
    members: [
      { id: 'm-1', userId: 'u-1', userName: 'Sarah Johnson', email: 'sarah@company.com', role: 'admin', addedAt: '2024-01-15' },
      { id: 'm-2', userId: 'u-2', userName: 'Mike Chen', email: 'mike@company.com', role: 'member', addedAt: '2024-02-01' },
    ],
    permissions: [
      { id: 'p-1', name: 'review_content', description: 'Can review and approve content', enabled: true },
      { id: 'p-2', name: 'reject_content', description: 'Can reject content', enabled: true },
    ],
  },
  {
    id: 'ug-2',
    name: 'Course Creators',
    description: 'Team that creates and manages courses',
    members: [
      { id: 'm-3', userId: 'u-3', userName: 'Emily Davis', email: 'emily@company.com', role: 'admin', addedAt: '2024-01-10' },
      { id: 'm-4', userId: 'u-4', userName: 'John Smith', email: 'john@company.com', role: 'member', addedAt: '2024-03-01' },
    ],
    permissions: [
      { id: 'p-3', name: 'create_course', description: 'Can create new courses', enabled: true },
      { id: 'p-4', name: 'edit_course', description: 'Can edit courses', enabled: true },
    ],
  },
  {
    id: 'ug-3',
    name: 'Article Writers',
    description: 'Team responsible for writing articles',
    members: [
      { id: 'm-5', userId: 'u-5', userName: 'Alex Turner', email: 'alex@company.com', role: 'admin', addedAt: '2024-01-20' },
    ],
    permissions: [
      { id: 'p-5', name: 'create_article', description: 'Can create articles', enabled: true },
      { id: 'p-6', name: 'edit_article', description: 'Can edit articles', enabled: true },
    ],
  },
];

// ===============================
// MOCK CATEGORIES (TREE STRUCTURE)
// ===============================

export const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Technology',
    description: 'Technology related content',
    parentId: null,
    userGroups: [mockUserGroups[0], mockUserGroups[1]],
    settings: {
      defaultReviewerGroupId: 'ug-1',
      allowedContentTypes: ['course', 'article'],
      autoApproval: false,
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-06-15',
    children: [
      {
        id: 'cat-1-1',
        name: 'Web Development',
        description: 'Web development tutorials and courses',
        parentId: 'cat-1',
        userGroups: [mockUserGroups[1]],
        settings: {
          defaultReviewerGroupId: 'ug-1',
          allowedContentTypes: ['course', 'article'],
          autoApproval: false,
        },
        createdAt: '2024-01-10',
        updatedAt: '2024-06-10',
        children: [
          {
            id: 'cat-1-1-1',
            name: 'Frontend',
            description: 'Frontend development',
            parentId: 'cat-1-1',
            userGroups: [],
            settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course'], autoApproval: false },
            createdAt: '2024-02-01',
            updatedAt: '2024-05-20',
            children: [
              {
                id: 'cat-1-1-1-1',
                name: 'React',
                parentId: 'cat-1-1-1',
                userGroups: [],
                settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course'], autoApproval: false },
                createdAt: '2024-03-01',
                updatedAt: '2024-05-15',
                children: [],
              },
              {
                id: 'cat-1-1-1-2',
                name: 'Vue.js',
                parentId: 'cat-1-1-1',
                userGroups: [],
                settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course'], autoApproval: false },
                createdAt: '2024-03-01',
                updatedAt: '2024-05-15',
                children: [],
              },
            ],
          },
          {
            id: 'cat-1-1-2',
            name: 'Backend',
            description: 'Backend development',
            parentId: 'cat-1-1',
            userGroups: [],
            settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course', 'article'], autoApproval: false },
            createdAt: '2024-02-01',
            updatedAt: '2024-05-20',
            children: [],
          },
        ],
      },
      {
        id: 'cat-1-2',
        name: 'Mobile Development',
        description: 'Mobile app development',
        parentId: 'cat-1',
        userGroups: [],
        settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course'], autoApproval: false },
        createdAt: '2024-01-15',
        updatedAt: '2024-06-01',
        children: [],
      },
    ],
  },
  {
    id: 'cat-2',
    name: 'Business',
    description: 'Business and management content',
    parentId: null,
    userGroups: [mockUserGroups[2]],
    settings: {
      defaultReviewerGroupId: 'ug-1',
      allowedContentTypes: ['article'],
      autoApproval: true,
    },
    createdAt: '2024-01-05',
    updatedAt: '2024-06-20',
    children: [
      {
        id: 'cat-2-1',
        name: 'Marketing',
        parentId: 'cat-2',
        userGroups: [],
        settings: { defaultReviewerGroupId: null, allowedContentTypes: ['article'], autoApproval: true },
        createdAt: '2024-02-10',
        updatedAt: '2024-05-25',
        children: [],
      },
      {
        id: 'cat-2-2',
        name: 'Finance',
        parentId: 'cat-2',
        userGroups: [],
        settings: { defaultReviewerGroupId: null, allowedContentTypes: ['article'], autoApproval: false },
        createdAt: '2024-02-15',
        updatedAt: '2024-05-30',
        children: [],
      },
    ],
  },
  {
    id: 'cat-3',
    name: 'Design',
    description: 'Design and creative content',
    parentId: null,
    userGroups: [],
    settings: {
      defaultReviewerGroupId: null,
      allowedContentTypes: ['course', 'article'],
      autoApproval: false,
    },
    createdAt: '2024-01-20',
    updatedAt: '2024-06-18',
    children: [],
  },
];

// ===============================
// MOCK COURSES
// ===============================

export const mockCourses: Course[] = [
  {
    id: 'course-1',
    title: 'React Fundamentals',
    description: 'Learn the basics of React including components, state, and hooks.',
    categoryId: 'cat-1-1-1-1',
    categoryPath: ['Technology', 'Web Development', 'Frontend', 'React'],
    thumbnail: '/placeholder.svg',
    instructor: 'Sarah Johnson',
    duration: 480,
    status: 'published',
    tags: ['react', 'javascript', 'frontend'],
    language: 'English',
    createdAt: '2024-03-01',
    updatedAt: '2024-06-01',
    publishedAt: '2024-06-01',
    sections: [
      {
        id: 'sec-1',
        title: 'Getting Started',
        order: 1,
        subsections: [
          {
            id: 'subsec-1-1',
            title: 'Introduction',
            order: 1,
            lessons: [
              { id: 'les-1-1-1', title: 'What is React?', order: 1, content: '', duration: 10, attachments: [], tags: [] },
              { id: 'les-1-1-2', title: 'Setting up your environment', order: 2, content: '', duration: 15, attachments: [], tags: [] },
            ],
          },
          {
            id: 'subsec-1-2',
            title: 'Your First Component',
            order: 2,
            lessons: [
              { id: 'les-1-2-1', title: 'Creating a component', order: 1, content: '', duration: 20, attachments: [], tags: [] },
            ],
          },
        ],
      },
      {
        id: 'sec-2',
        title: 'State Management',
        order: 2,
        subsections: [
          {
            id: 'subsec-2-1',
            title: 'useState Hook',
            order: 1,
            lessons: [
              { id: 'les-2-1-1', title: 'Introduction to useState', order: 1, content: '', duration: 25, attachments: [], tags: [] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'course-2',
    title: 'Advanced TypeScript',
    description: 'Deep dive into TypeScript features for professional development.',
    categoryId: 'cat-1-1-1-1',
    categoryPath: ['Technology', 'Web Development', 'Frontend', 'React'],
    instructor: 'Mike Chen',
    duration: 600,
    status: 'in_review',
    tags: ['typescript', 'javascript'],
    language: 'English',
    createdAt: '2024-04-15',
    updatedAt: '2024-06-10',
    sections: [
      {
        id: 'sec-3',
        title: 'Type System',
        order: 1,
        subsections: [
          {
            id: 'subsec-3-1',
            title: 'Basic Types',
            order: 1,
            lessons: [
              { id: 'les-3-1-1', title: 'Primitive types', order: 1, content: '', duration: 15, attachments: [], tags: [] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'course-3',
    title: 'Node.js Backend Development',
    description: 'Build scalable backend services with Node.js and Express.',
    categoryId: 'cat-1-1-2',
    categoryPath: ['Technology', 'Web Development', 'Backend'],
    instructor: 'Emily Davis',
    duration: 720,
    status: 'draft',
    tags: ['nodejs', 'backend', 'express'],
    language: 'English',
    createdAt: '2024-05-01',
    updatedAt: '2024-06-15',
    sections: [],
  },
  {
    id: 'course-4',
    title: 'Vue.js Complete Guide',
    description: 'Master Vue.js from basics to advanced concepts.',
    categoryId: 'cat-1-1-1-2',
    categoryPath: ['Technology', 'Web Development', 'Frontend', 'Vue.js'],
    instructor: 'John Smith',
    duration: 540,
    status: 'submitted',
    tags: ['vuejs', 'javascript', 'frontend'],
    language: 'English',
    createdAt: '2024-05-10',
    updatedAt: '2024-06-12',
    sections: [],
  },
];

// ===============================
// MOCK ARTICLES
// ===============================

export const mockArticles: Article[] = [
  {
    id: 'article-1',
    title: '10 Best Practices for React Development',
    slug: '10-best-practices-react-development',
    content: '<p>React has become one of the most popular JavaScript libraries...</p>',
    excerpt: 'Learn the top 10 best practices that will improve your React development workflow.',
    categoryId: 'cat-1-1-1-1',
    categoryPath: ['Technology', 'Web Development', 'Frontend', 'React'],
    author: 'Sarah Johnson',
    status: 'published',
    seo: {
      metaTitle: '10 Best Practices for React Development | Tech Blog',
      metaDescription: 'Discover the top 10 best practices for React development that will help you write cleaner, more maintainable code.',
      keywords: ['react', 'best practices', 'javascript', 'frontend'],
    },
    featuredImage: '/placeholder.svg',
    attachments: [],
    tags: ['react', 'best-practices'],
    createdAt: '2024-04-01',
    updatedAt: '2024-06-01',
    publishedAt: '2024-06-01',
  },
  {
    id: 'article-2',
    title: 'Digital Marketing Trends 2024',
    slug: 'digital-marketing-trends-2024',
    content: '<p>The digital marketing landscape continues to evolve...</p>',
    excerpt: 'Explore the latest digital marketing trends shaping the industry in 2024.',
    categoryId: 'cat-2-1',
    categoryPath: ['Business', 'Marketing'],
    author: 'Alex Turner',
    status: 'in_review',
    seo: {
      metaTitle: 'Digital Marketing Trends 2024 | Business Insights',
      metaDescription: 'Stay ahead with the latest digital marketing trends for 2024.',
      keywords: ['marketing', 'digital', 'trends', '2024'],
    },
    attachments: [],
    tags: ['marketing', 'trends'],
    createdAt: '2024-05-15',
    updatedAt: '2024-06-10',
  },
  {
    id: 'article-3',
    title: 'Understanding Financial Statements',
    slug: 'understanding-financial-statements',
    content: '<p>Financial statements are crucial for understanding...</p>',
    excerpt: 'A comprehensive guide to reading and understanding financial statements.',
    categoryId: 'cat-2-2',
    categoryPath: ['Business', 'Finance'],
    author: 'Mike Chen',
    status: 'draft',
    seo: {
      metaTitle: 'Understanding Financial Statements | Finance Guide',
      metaDescription: 'Learn how to read and interpret financial statements effectively.',
      keywords: ['finance', 'accounting', 'financial statements'],
    },
    attachments: [],
    tags: ['finance', 'accounting'],
    createdAt: '2024-06-01',
    updatedAt: '2024-06-15',
  },
];

// ===============================
// MOCK REVIEW COMMENTS
// ===============================

export const mockReviewComments: ReviewComment[] = [
  {
    id: 'rc-1',
    authorId: 'u-1',
    authorName: 'Sarah Johnson',
    authorAvatar: '/placeholder.svg',
    content: 'Great content overall! Please add more examples in section 2.',
    createdAt: '2024-06-10T10:30:00Z',
    replies: [
      {
        id: 'rc-1-1',
        authorId: 'u-2',
        authorName: 'Mike Chen',
        content: 'Thanks for the feedback! I\'ll add more examples.',
        createdAt: '2024-06-10T11:00:00Z',
        replies: [],
      },
    ],
  },
  {
    id: 'rc-2',
    authorId: 'u-3',
    authorName: 'Emily Davis',
    content: 'The introduction needs to be more engaging. Consider adding a hook.',
    createdAt: '2024-06-11T09:15:00Z',
    replies: [],
  },
];

// ===============================
// MOCK VERSION HISTORY
// ===============================

export const mockVersionHistory: VersionHistory[] = [
  {
    id: 'vh-1',
    version: 3,
    changedBy: 'Mike Chen',
    changedAt: '2024-06-15T14:30:00Z',
    changes: 'Updated section 2 with additional examples',
    status: 'in_review',
  },
  {
    id: 'vh-2',
    version: 2,
    changedBy: 'Mike Chen',
    changedAt: '2024-06-10T10:00:00Z',
    changes: 'Added new lesson on hooks',
    status: 'submitted',
  },
  {
    id: 'vh-3',
    version: 1,
    changedBy: 'Mike Chen',
    changedAt: '2024-06-01T09:00:00Z',
    changes: 'Initial creation',
    status: 'draft',
  },
];

// ===============================
// HELPER FUNCTIONS
// ===============================

export const getStatusCounts = (items: { status: string }[]) => {
  return {
    draft: items.filter(i => i.status === 'draft').length,
    submitted: items.filter(i => i.status === 'submitted').length,
    in_review: items.filter(i => i.status === 'in_review').length,
    approved: items.filter(i => i.status === 'approved').length,
    published: items.filter(i => i.status === 'published').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };
};

export const flattenCategories = (categories: Category[]): Category[] => {
  const result: Category[] = [];
  const traverse = (cats: Category[]) => {
    cats.forEach(cat => {
      result.push(cat);
      if (cat.children.length > 0) {
        traverse(cat.children);
      }
    });
  };
  traverse(categories);
  return result;
};
