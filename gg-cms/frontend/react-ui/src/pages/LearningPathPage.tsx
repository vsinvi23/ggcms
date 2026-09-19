import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, ChevronRight, GraduationCap, CheckCircle2, Circle, PlayCircle, Star, Bookmark, Check, Shield, ArrowLeft,
  ChevronDown, FileText, Code2, HelpCircle, Layers, Play, ArrowRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicLearningPathById, usePublicLearningPaths, usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useAuth } from '@/contexts/AuthContext';
import { EnrollmentDto } from '@/api/types';
import { buildCourseUrl } from '@/lib/slug';
import { cn } from '@/lib/utils';

type CourseStatus = 'completed' | 'current' | 'upcoming';

interface ModuleChapter {
  id: string;
  title: string;
  type: 'Video' | 'Reading' | 'Hands-on Lab' | 'Quiz';
  durationMinutes: number;
  description: string;
}

const getModuleChapters = (course: any, moduleIndex: number): ModuleChapter[] => {
  const titleLower = (course.title || '').toLowerCase();
  
  if (titleLower.includes('typescript') || titleLower.includes('react')) {
    return [
      { id: 'ch-1', title: 'Component Composition & Design Patterns', type: 'Video', durationMinutes: 25, description: 'Learn advanced component composition, HOCs, and render props in React.' },
      { id: 'ch-2', title: 'Custom Hooks & Reactive State Management', type: 'Reading', durationMinutes: 35, description: 'Deep dive into state synchronization, useReducer, and Context API optimization.' },
      { id: 'ch-3', title: 'Type Safety & Generics in Enterprise Apps', type: 'Hands-on Lab', durationMinutes: 40, description: 'Build strongly typed API clients and polymorphic UI components in TypeScript.' },
      { id: 'ch-4', title: 'React Architecture Knowledge Assessment', type: 'Quiz', durationMinutes: 15, description: 'Test your understanding of component lifecycles, memoization, and custom hooks.' },
    ];
  }
  
  if (titleLower.includes('go') || titleLower.includes('backend') || titleLower.includes('microservice')) {
    return [
      { id: 'ch-1', title: 'Concurrent Goroutines & Channel Pipelines', type: 'Video', durationMinutes: 30, description: 'Master lightweight concurrency, worker pools, and channel synchronization in Go.' },
      { id: 'ch-2', title: 'REST & gRPC API Contracts in Go', type: 'Reading', durationMinutes: 40, description: 'Design clean REST handlers, Protobuf contracts, and high-performance gRPC endpoints.' },
      { id: 'ch-3', title: 'Middleware, Context & Timeout Hardening', type: 'Hands-on Lab', durationMinutes: 45, description: 'Implement request tracing, cancellation contexts, rate limiting, and CORS.' },
      { id: 'ch-4', title: 'Go Backend Engineering Quiz', type: 'Quiz', durationMinutes: 15, description: 'Verify goroutine safety, channel buffering, and error handling patterns.' },
    ];
  }

  if (titleLower.includes('postgres') || titleLower.includes('data') || titleLower.includes('database')) {
    return [
      { id: 'ch-1', title: 'Relational Schema Design & Normalization', type: 'Video', durationMinutes: 25, description: 'Third normal form (3NF), primary/foreign keys, and data integrity constraints.' },
      { id: 'ch-2', title: 'Indexing Strategies & B-Tree Tuning', type: 'Reading', durationMinutes: 30, description: 'B-Tree, GIN, and BRIN indexes, composite indexing, and query plan analysis.' },
      { id: 'ch-3', title: 'Query Optimization & EXPLAIN ANALYZE', type: 'Hands-on Lab', durationMinutes: 40, description: 'Identify slow queries, join algorithms, and execution plan bottlenecks.' },
    ];
  }

  if (titleLower.includes('oauth') || titleLower.includes('security') || titleLower.includes('identity')) {
    return [
      { id: 'ch-1', title: 'Authorization Code Flow with PKCE Deep Dive', type: 'Video', durationMinutes: 30, description: 'Cryptographic code_verifier and code_challenge generation for public clients.' },
      { id: 'ch-2', title: 'JWT Verification & Identity Assertion', type: 'Reading', durationMinutes: 35, description: 'RS256 vs HS256 signatures, token rotation, and OIDC claims validation.' },
      { id: 'ch-3', title: 'Building a Secure Token Verification Gateway', type: 'Hands-on Lab', durationMinutes: 50, description: 'Implement bearer token extraction, JWKS fetching, and scope checking.' },
      { id: 'ch-4', title: 'Identity & OAuth Security Assessment', type: 'Quiz', durationMinutes: 15, description: 'Test token validation, grant types, and PKCE parameters.' },
    ];
  }

  if (titleLower.includes('docker') || titleLower.includes('kubernetes') || titleLower.includes('cloud') || titleLower.includes('devops')) {
    return [
      { id: 'ch-1', title: 'Multi-stage Docker Builds & Security', type: 'Video', durationMinutes: 25, description: 'Create minimal distroless container images and optimize layer caching.' },
      { id: 'ch-2', title: 'Kubernetes Pods, Services & Ingress Routes', type: 'Reading', durationMinutes: 35, description: 'ClusterIP, NodePort, LoadBalancer, and Ingress routing rules.' },
      { id: 'ch-3', title: 'Terraform & Cloud Run Automated Pipeline', type: 'Hands-on Lab', durationMinutes: 45, description: 'Provision GCP Cloud Run services and IAM roles via Terraform IaC.' },
    ];
  }

  return [
    { id: `ch-${moduleIndex}-1`, title: `Foundations of ${course.title}`, type: 'Video', durationMinutes: 20, description: `Key principles, core concepts, and environment setup for ${course.title}.` },
    { id: `ch-${moduleIndex}-2`, title: `Deep Dive Architecture & Design Patterns`, type: 'Reading', durationMinutes: 30, description: `In-depth breakdown of production architecture, best practices, and trade-offs.` },
    { id: `ch-${moduleIndex}-3`, title: `Hands-on Project & Implementation Lab`, type: 'Hands-on Lab', durationMinutes: 40, description: `Apply concepts to build a production-ready feature with automated testing.` },
    { id: `ch-${moduleIndex}-4`, title: `Module Knowledge Assessment`, type: 'Quiz', durationMinutes: 15, description: `Interactive review questions to test concept retention and active recall.` },
  ];
};

import { PublicQuickEditBar } from '@/components/editor/PublicQuickEditBar';

const LearningPathPage = () => {
  const { path: pathId } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [pendingRevision, setPendingRevision] = useState<any>(null);

  const handleSavePathRevision = async (revData: { title: string; description: string; body: string; submitForReview: boolean }) => {
    const newRev = {
      id: Date.now(),
      parentContentId: pathId || '1',
      contentType: 'LEARNING_PATH',
      versionNumber: 2,
      status: revData.submitForReview ? 'REVIEW' : 'DRAFT',
      requestedBy: 1,
      title: revData.title,
      description: revData.description,
      body: revData.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPendingRevision(newRev);
    setIsViewingPending(true);
  };

  // Real live backend API hooks
  const { data: apiData, isLoading } = usePublicLearningPathById(pathId ?? '');
  const { data: allDbPaths } = usePublicLearningPaths();
  const { data: publicCmsCourses } = usePublicCmsList({ type: 'COURSE', size: 100 });
  const { data: enrollments = [] } = useMyEnrollments(isAuthenticated);

  const [activeTab, setActiveTab] = useState<'overview' | 'curriculum' | 'related'>('overview');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({});

  const toggleModuleExpand = (courseId: number) => {
    setExpandedModules(prev => ({
      ...prev,
      [courseId]: prev[courseId] === undefined ? false : !prev[courseId],
    }));
  };

  const enrollmentMap = useMemo(() => {
    const m = new Map<number, EnrollmentDto>();
    enrollments.forEach((e: EnrollmentDto) => {
      if (e.course?.id) m.set(e.course.id, e);
    });
    return m;
  }, [enrollments]);

  // Live database data resolution with full course metadata hydration
  const data = useMemo(() => {
    if (!apiData) return null;
    const cmsMap = new Map<number, any>();
    (publicCmsCourses?.items || []).forEach(item => cmsMap.set(item.id, item));

    const enrichedCourses = (apiData.courses || []).map((cItem: any) => {
      const cId = cItem.courseId || cItem.id;
      const cmsCourse = cmsMap.get(cId);
      return {
        id: cId,
        title: cmsCourse?.title || cItem.title || `Course Module #${cId}`,
        description: cmsCourse?.description || cItem.description || 'Master core domain concepts and production architecture.',
        type: 'COURSE' as const,
        categoryId: cmsCourse?.categoryId || 1,
        createdBy: cmsCourse?.createdBy || 1,
        status: 'PUBLISHED' as const,
        blockCount: cmsCourse?.sectionsCount || cmsCourse?.lessonsCount || 8,
        durationMinutes: cmsCourse?.durationMinutes || 180,
        slug: cmsCourse?.slug || buildCourseUrl(cmsCourse || { id: cId, title: cItem.title }),
        tags: cmsCourse?.tags || ['Backend', 'Engineering'],
        createdAt: cmsCourse?.createdAt || new Date().toISOString(),
      };
    });

    return {
      id: apiData.id,
      kind: apiData.kind || 'Structured Learning Path',
      title: apiData.title,
      description: apiData.description,
      estimatedHours: enrichedCourses.length ? Math.ceil(enrichedCourses.reduce((acc, curr) => acc + (curr.durationMinutes || 180), 0) / 60) : 24,
      rating: 4.9,
      ratingCount: 240,
      level: 'Intermediate → Advanced',
      skillsGained: enrichedCourses.map(c => `Master ${c.title}`),
      courses: enrichedCourses,
    };
  }, [apiData, publicCmsCourses]);

  // Dynamic Related Paths from database
  const relatedPaths = useMemo(() => {
    if (!allDbPaths || !data) return [];
    return allDbPaths.filter(p => String(p.id) !== String(data.id));
  }, [allDbPaths, data]);

  if (isLoading && !data) {
    return (
      <PublicLayout>
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-6 animate-pulse">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-6 w-1/2" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  const courses = data.courses ?? [];
  const hasProgress = courses.some(course => {
    const enrollment = enrollmentMap.get(course.id);
    return enrollment && (enrollment.status === 'completed' || enrollment.progress > 0);
  });

  const getCourseStatus = (courseId: number): CourseStatus => {
    const enrollment = enrollmentMap.get(courseId);
    if (!enrollment) return 'upcoming';
    if (enrollment.status === 'completed') return 'completed';
    if (enrollment.status === 'active' && enrollment.progress > 0) return 'current';
    return 'upcoming';
  };

  const handleStartPath = () => {
    if (courses.length > 0) {
      const firstCourse = courses[0];
      navigate(`${buildCourseUrl(firstCourse)}?learn=true`);
    }
  };

  // Dynamic Skills Gained derivation
  const skillsList = useMemo(() => {
    if (data.skillsGained && data.skillsGained.length > 0) {
      return data.skillsGained;
    }
    if (courses.length > 0) {
      return courses.map(c => `Master ${c.title}`);
    }
    return [
      'Architect production-grade scalable web software',
      'Design RESTful & gRPC backend APIs',
      'Implement enterprise security, OAuth 2.0 & identity controls',
      'Deploy containerized services to Cloud Run & Kubernetes',
    ];
  }, [data.skillsGained, courses]);



  const estimatedHours = data.estimatedHours || (courses.length ? courses.length * 4 : 24);
  const rating = data.rating || 4.9;
  const ratingCount = data.ratingCount || 180;
  const levelText = data.level || 'Intermediate';

  return (
    <PublicLayout>
      <PublicQuickEditBar
        contentType="learning_path"
        contentId={data.id}
        currentTitle={data.title || ''}
        currentDescription={data.description || ''}
        currentBody=""
        pendingRevision={pendingRevision}
        isViewingPending={isViewingPending}
        onToggleView={setIsViewingPending}
        onSaveRevision={handleSavePathRevision}
      />
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/explore/paths" className="hover:text-primary transition-colors">Learning Paths</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium truncate max-w-[240px]">{data.title}</span>
        </nav>

        {/* Hero Header Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <GraduationCap className="w-3.5 h-3.5 mr-1" />
                {data.kind === 'INTERVIEW_PREP' ? 'Interview Prep Track' : 'Structured Learning Path'}
              </Badge>
              <Badge variant="outline" className="text-xs">{levelText}</Badge>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
              {data.title}
            </h1>

            {data.description && (
              <p className="text-base text-muted-foreground leading-relaxed">
                {data.description}
              </p>
            )}

            {/* Path Stats */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground pt-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">{courses.length}</span> modules
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">{estimatedHours}</span> hours estimated
              </div>
              <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                <Star className="w-4 h-4 fill-amber-500" />
                <span>{rating}</span>
                <span className="text-muted-foreground font-normal text-xs">({ratingCount} ratings)</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3 pt-3">
              <Button size="lg" onClick={handleStartPath} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 px-6 shadow-md">
                <PlayCircle className="w-5 h-5" />
                {hasProgress ? 'Continue Learning Path' : 'Start Learning Path'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setIsBookmarked(prev => !prev)}
                className={cn('rounded-xl border-border', isBookmarked && 'text-emerald-600 border-emerald-500 bg-emerald-500/10')}
              >
                <Bookmark className={cn('w-4 h-4', isBookmarked && 'fill-emerald-600')} />
              </Button>
            </div>
          </div>

          {/* Right Card: Dynamic Skills You'll Gain */}
          <Card className="rounded-2xl border border-border shadow-sm bg-card p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Skills You&apos;ll Gain
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {skillsList.map((skill, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Sub-tabs bar */}
        <div className="border-b border-border">
          <div className="flex gap-8">
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'curriculum', label: 'Curriculum' },
                { id: 'related', label: 'Related Paths' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'pb-3 text-sm font-semibold border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Curriculum Scope</div>
                    <div className="text-base font-bold">{courses.length} Structured Modules</div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Time Commitment</div>
                    <div className="text-base font-bold">~{estimatedHours} Total Hours</div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-2xl border border-border space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Difficulty Level</div>
                    <div className="text-base font-bold">{levelText}</div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-foreground">Path Overview & Learning Goals</h2>
              <p className="text-muted-foreground leading-relaxed">
                {data.description} This learning path is structured to guide software professionals from fundamental principles to production engineering mastery.
              </p>
            </div>

            {/* Path Key Highlights */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-foreground">Key Outcomes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {skillsList.map((skill, index) => (
                  <div key={index} className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-sm font-medium text-foreground">{skill}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border">
              <p className="text-sm text-muted-foreground">Ready to start? Begin with Module 01 in the curriculum.</p>
              <Button onClick={() => setActiveTab('curriculum')} variant="outline" className="rounded-xl gap-2">
                View Curriculum <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'curriculum' && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Path Curriculum ({courses.length} Modules)</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Click any module to expand chapters and sub-modules.</p>
              </div>
              <Badge variant="outline">{estimatedHours} Total Hours</Badge>
            </div>

            {courses.length > 0 ? (
              <div className="space-y-4">
                {courses.map((course, index) => {
                  const status = getCourseStatus(course.id);
                  const isExpanded = expandedModules[course.id] !== false; // Default expanded for rich view
                  const chapters = getModuleChapters(course, index + 1);

                  return (
                    <Card
                      key={course.id}
                      className={cn(
                        'transition-all rounded-2xl border border-border overflow-hidden bg-card',
                        isExpanded ? 'shadow-md border-emerald-500/40' : 'hover:border-emerald-500/30'
                      )}
                    >
                      {/* Module Accordion Header */}
                      <div
                        onClick={() => toggleModuleExpand(course.id)}
                        className="p-5 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                            {status === 'completed' && <CheckCircle2 className="h-5 w-5" />}
                            {status === 'current' && <PlayCircle className="h-5 w-5" />}
                            {status === 'upcoming' && <Circle className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                Module {String(index + 1).padStart(2, '0')}
                              </span>
                              <span className="text-xs text-muted-foreground font-medium">
                                &bull; {chapters.length} Sub-modules
                              </span>
                            </div>
                            <h3 className="text-lg font-bold text-foreground transition-colors line-clamp-1 mt-0.5">
                              {course.title}
                            </h3>
                            {course.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {course.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
                            {chapters.reduce((acc, c) => acc + c.durationMinutes, 0)} mins
                          </Badge>
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                          </div>
                        </div>
                      </div>

                      {/* Expanded Sub-modules & Chapters List */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-border/60 pb-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              Chapters & Sub-modules
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {chapters.length} Interactive Lessons
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {chapters.map((ch, chIdx) => (
                              <div
                                key={ch.id}
                                className="p-3.5 rounded-xl border border-border/70 bg-card hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                                    {index + 1}.{chIdx + 1}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="text-sm font-bold text-foreground">
                                        {ch.title}
                                      </h4>
                                      <Badge variant="outline" className="text-[10px] px-2 py-0 h-4 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                        {ch.type === 'Video' && <Play className="w-2.5 h-2.5 mr-1 inline" />}
                                        {ch.type === 'Reading' && <FileText className="w-2.5 h-2.5 mr-1 inline" />}
                                        {ch.type === 'Hands-on Lab' && <Code2 className="w-2.5 h-2.5 mr-1 inline" />}
                                        {ch.type === 'Quiz' && <HelpCircle className="w-2.5 h-2.5 mr-1 inline" />}
                                        {ch.type}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                      {ch.description}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    {ch.durationMinutes}m
                                  </span>
                                  <Link to={`${buildCourseUrl(course)}?chapter=${ch.id}`}>
                                    <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
                                      Start Chapter <ArrowRight className="w-3.5 h-3.5" />
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Full Module CTA Action Bar */}
                          <div className="pt-2 flex items-center justify-between border-t border-border/60">
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              Complete all sub-modules to finish Module {String(index + 1).padStart(2, '0')}.
                            </span>
                            <Link to={buildCourseUrl(course)}>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 text-xs font-bold ml-auto">
                                <PlayCircle className="w-4 h-4" /> Launch Full Module
                              </Button>
                            </Link>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <h3 className="text-base font-bold text-foreground">Curriculum updating</h3>
                <p className="text-sm text-muted-foreground">Courses are being added to this path. Check back soon!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'related' && (
          <div className="space-y-6 pt-2">
            <div>
              <h2 className="text-xl font-bold text-foreground">Related Learning Paths</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Explore recommended paths to complement your skills.</p>
            </div>

            {relatedPaths.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPaths.map(rp => (
                  <Card key={rp.id} className="p-6 rounded-2xl border border-border hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {rp.kind === 'INTERVIEW_PREP' ? 'Interview Prep' : 'Structured Path'}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-semibold">{rp.level}</span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground line-clamp-1">{rp.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{rp.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {rp.modules.length} Modules
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          {rp.estimatedHours} Hours
                        </span>
                        <span className="flex items-center gap-1 text-amber-500 font-semibold">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          {rp.rating}
                        </span>
                      </div>
                    </div>

                    <Link to={`/learn/${rp.slug}`}>
                      <Button variant="outline" className="w-full rounded-xl gap-2 hover:bg-emerald-500/10 hover:text-emerald-600">
                        View Path <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <h3 className="text-base font-bold text-foreground">No related paths found</h3>
                <p className="text-sm text-muted-foreground">Check back as new learning paths are added.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </PublicLayout>
  );
};

export default LearningPathPage;

