// ==========================================
// GEEKGULLY KNOWLEDGE GRAPH & TAXONOMY TYPES
// ==========================================

export type ContentType = 
  | 'article'
  | 'guide'
  | 'tutorial'
  | 'deep-dive'
  | 'cheat-sheet'
  | 'reference'
  | 'lab'
  | 'project'
  | 'course';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Domain {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconName?: string;
  technologiesCount: number;
  topicsCount: number;
  subdomains?: {
    name: string;
    slug: string;
    topics: string[];
  }[];
}

export interface Technology {
  id: string;
  slug: string;
  name: string;
  category: 'language' | 'cloud' | 'database' | 'devops' | 'framework' | 'tool';
  icon?: string;
  description: string;
  coursesCount: number;
  articlesCount: number;
  cheatSheetsCount: number;
  labsCount: number;
  interviewQuestionsCount: number;
  popularTopics: string[];
}

export interface Topic {
  id: string;
  slug: string;
  name: string;
  domainSlug: string;
  technologySlugs: string[];
  description: string;
  overviewMarkdown?: string;
  relatedConcepts: string[];
  prerequisites?: string[];
  metrics: {
    coursesCount: number;
    articlesCount: number;
    cheatSheetsCount: number;
    labsCount: number;
    quizzesCount: number;
    interviewQuestionsCount: number;
  };
}

export interface KnowledgeGraphItem {
  id: string;
  title: string;
  slug: string;
  type: ContentType;
  excerpt: string;
  domainSlug: string;
  technologySlugs: string[];
  topicSlugs: string[];
  difficulty: DifficultyLevel;
  estimatedMinutes: number;
  author?: string;
  publishedAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
  rating?: number;
  reviewsCount?: number;
  tags: string[];
  contentUrl?: string;
  
  // Graph relationships
  prerequisites?: string[]; // array of topic or content slugs
  relatedTopicSlugs: string[];
  relatedContentSlugs?: string[];
  includedInPathSlugs?: string[];
  supportsQuizIds?: string[];
  supportsInterviewQuestionIds?: string[];
}

// ==========================================
// PRACTICE & QUIZ ENGINE TYPES
// ==========================================

export interface QuizQuestion {
  id: string;
  question: string;
  codeSnippet?: {
    language: string;
    code: string;
  };
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  topicSlug: string;
}

export interface Quiz {
  id: string;
  slug: string;
  title: string;
  description: string;
  topicSlug: string;
  technologySlug?: string;
  domainSlug: string;
  difficulty: DifficultyLevel;
  questionsCount: number;
  estimatedMinutes: number;
  questions: QuizQuestion[];
}

export interface PracticeAttempt {
  quizId: string;
  score: number; // percentage
  totalQuestions: number;
  correctAnswers: number;
  timeSpentSeconds: number;
  completedAt: string;
  weakTopicSlugs: string[];
  strongTopicSlugs: string[];
}

// ==========================================
// INTERVIEW PREPARATION TYPES
// ==========================================

export type InterviewRole = 
  | 'backend-engineer'
  | 'cloud-engineer'
  | 'devops-engineer'
  | 'security-engineer'
  | 'sre'
  | 'software-engineer';

export type InterviewRound = 
  | 'coding'
  | 'technical'
  | 'system-design'
  | 'scenario'
  | 'behavioral';

export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'staff';

export interface InterviewQuestion {
  id: string;
  slug: string;
  question: string;
  difficulty: DifficultyLevel;
  role: InterviewRole;
  round: InterviewRound;
  experienceLevel: ExperienceLevel;
  topicSlugs: string[];
  technologySlugs: string[];
  hint?: string;
  answerExplanation: string;
  commonMistakes: string[];
  relatedQuestionSlugs?: string[];
  relatedCourseSlug?: string[];
  relatedArticleSlug?: string[];
}

// ==========================================
// LEARNING PATH TYPES
// ==========================================

export interface LearningPathResource {
  id: string;
  title: string;
  slug: string;
  type: ContentType | 'quiz' | 'interview-set';
  estimatedMinutes: number;
  isOptional?: boolean;
}

export interface LearningPathStage {
  id: string;
  stageNumber: number;
  title: string;
  description: string;
  whyItMatters: string;
  whatYouShouldKnowBefore: string[];
  resources: LearningPathResource[];
}

export interface LearningPath {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  targetRole: InterviewRole | string;
  difficulty: DifficultyLevel | 'beginner-to-advanced';
  totalStages: number;
  totalResources: number;
  estimatedHours: number;
  skillsAcquired: string[];
  prerequisites: string[];
  stages: LearningPathStage[];
  progressPercentage?: number;
}

// ==========================================
// SEARCH & RECOMMENDATION TYPES
// ==========================================

export interface CategorizedSearchResults {
  topics: Topic[];
  courses: KnowledgeGraphItem[];
  articles: KnowledgeGraphItem[];
  cheatSheets: KnowledgeGraphItem[];
  practiceQuizzes: Quiz[];
  interviewQuestions: InterviewQuestion[];
  learningPaths: LearningPath[];
  technologies: Technology[];
}

export interface ContextualNextStep {
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  type: ContentType | 'quiz' | 'learning-path' | 'interview-prep';
  topicBadge?: string;
}
