import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Target, CheckCircle2, AlertTriangle, Trophy, BarChart3, Clock, ArrowRight, HelpCircle, BookOpen, Filter, X, RefreshCw, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Quiz, QuestionItem } from '@/types/knowledge-graph';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { cn } from '@/lib/utils';



function generateQuestionsForSlug(slug: string): QuestionItem[] {
  const cleanTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return [
    {
      id: `${slug}-1`,
      question: `What is a primary architectural principle of ${cleanTitle}?`,
      options: [
        'Separation of concerns and modular component isolation',
        'Direct hardcoding of credentials inside application source files',
        'Bypassing network encryption in local dev environments',
        'Executing synchronous blocking calls on UI looper threads',
      ],
      correctOptionIndex: 0,
      explanation: `${cleanTitle} relies on clear separation of concerns, abstraction boundaries, and resilient microservice design.`,
      topicSlug: slug,
    },
    {
      id: `${slug}-2`,
      question: `Which approach is best practice when scaling ${cleanTitle} for high-traffic workloads?`,
      options: [
        'Horizontal pod autoscaling combined with connection pooling and caching',
        'Increasing single-node RAM without load balancing',
        'Disabling database indexing to speed up write throughput',
        'Storing transient session states in local container filesystems',
      ],
      correctOptionIndex: 0,
      explanation: 'Stateless service scaling with connection pooling and caching ensures linear horizontal scalability under load.',
      topicSlug: slug,
    },
    {
      id: `${slug}-3`,
      question: `How should security and authentication be enforced in ${cleanTitle}?`,
      options: [
        'Relying on perimeter firewalls without internal token validation',
        'Enforcing Zero Trust verification with JWT Bearer tokens and TLS encryption',
        'Using hardcoded fallback tokens in HTTP client headers',
        'Disabling CORS checks on public API endpoints',
      ],
      correctOptionIndex: 1,
      explanation: 'Zero Trust architecture mandates cryptographically validated tokens and TLS encryption across every boundary.',
      topicSlug: slug,
    },
    {
      id: `${slug}-4`,
      question: `What metric is most critical for monitoring health in ${cleanTitle}?`,
      options: [
        'Latency percentiles (p95/p99), error rate, and saturation',
        'Raw git commit count per developer per day',
        'Total line count of client-side bundles',
        'Database table column count',
      ],
      correctOptionIndex: 0,
      explanation: 'SRE Golden Signals (Latency, Traffic, Errors, and Saturation) provide the most accurate visibility into system performance.',
      topicSlug: slug,
    },
  ];
}

export function PracticeHub() {
  const navigate = useNavigate();
  const { quizId } = useParams<{ quizId?: string }>();

  // Live backend database API hooks - fetching both ARTICLES and COURSES from PostgreSQL
  const { data: publicArticles } = usePublicCmsList({ size: 50, type: 'ARTICLE' });
  const { data: publicCourses } = usePublicCmsList({ size: 50, type: 'COURSE' });
  const { data: backendCategories } = useCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const combinedCmsItems = useMemo(() => {
    const articles = publicArticles?.items || [];
    const courses = publicCourses?.items || [];
    return [...courses, ...articles];
  }, [publicArticles, publicCourses]);

  const dbQuizzes = useMemo((): Quiz[] => {
    if (combinedCmsItems.length === 0) return [];
    return combinedCmsItems.map(item => ({
      id: String(item.id),
      slug: item.slug || String(item.id),
      title: item.title.includes('Assessment') || item.title.includes('Quiz') ? item.title : `${item.title} Assessment`,
      description: item.description || `Test key concepts and practice hands-on scenarios for ${item.title}.`,
      topicSlug: item.tags?.[0] || item.slug || 'general',
      domainSlug: (item.categoryName || 'Engineering').toLowerCase(),
      difficulty: (item.level as any)?.toLowerCase() || 'intermediate',
      questionsCount: 4,
      estimatedMinutes: item.durationMinutes || 10,
      questions: generateQuestionsForSlug(item.slug || item.title),
    }));
  }, [combinedCmsItems]);

  const allQuizzes = useMemo(() => {
    return dbQuizzes;
  }, [dbQuizzes]);

  const categories = useMemo(() => {
    const fetched = (backendCategories ?? []).map(c => c.name).filter(Boolean);
    if (fetched.length > 0) {
      return ['All', ...Array.from(new Set(fetched))];
    }
    return ['All', 'Quizzes', 'Tests', 'Coding', 'Hands-on Labs', 'Challenges'];
  }, [backendCategories]);

  const startQuiz = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setCurrentQuestionIdx(0);
    setSelectedAnswers({});
    setIsSubmitted(false);
  };

  useEffect(() => {
    if (quizId) {
      const found = allQuizzes.find(q => q.id === quizId || q.slug === quizId);
      if (found) {
        startQuiz(found);
      } else {
        const cleanTitle = quizId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const fallbackQuiz: Quiz = {
          id: quizId,
          slug: quizId,
          title: cleanTitle.includes('Quiz') || cleanTitle.includes('Test') ? cleanTitle : `${cleanTitle} Practice Test`,
          description: `Comprehensive interactive practice assessment for ${cleanTitle}.`,
          topicSlug: quizId,
          domainSlug: 'practice',
          difficulty: 'intermediate',
          questionsCount: 4,
          estimatedMinutes: 10,
          questions: generateQuestionsForSlug(quizId),
        };
        startQuiz(fallbackQuiz);
      }
    }
  }, [quizId, allQuizzes]);

  const handleSelectOption = (qIdx: number, optionIdx: number) => {
    if (isSubmitted) return;
    setSelectedAnswers(prev => ({ ...prev, [qIdx]: optionIdx }));
  };

  const calculateScore = () => {
    if (!activeQuiz) return 0;
    let correct = 0;
    activeQuiz.questions.forEach((q, i) => {
      if (selectedAnswers[i] === q.correctOptionIndex) {
        correct++;
      }
    });
    return Math.round((correct / activeQuiz.questions.length) * 100);
  };

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        {/* Clean Sub-Header Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Practice
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Quizzes & tests</p>
              </div>
            </div>

            {/* Centered Search Bar */}
            {!activeQuiz && (
              <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
                <div className="relative w-full">
                  <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search practice quizzes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border shadow-2xs w-full"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Right Spacer / Back Button */}
            <div className="sm:w-1/4 flex justify-end">
              {activeQuiz && (
                <Button variant="outline" size="sm" onClick={() => setActiveQuiz(null)} className="rounded-xl gap-2 text-xs">
                  <X className="w-3.5 h-3.5" /> Close Quiz
                </Button>
              )}
            </div>
          </div>
        </div>

        {activeQuiz ? (
          /* 3-Column Interactive Quiz View */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Button variant="ghost" size="sm" onClick={() => setActiveQuiz(null)} className="rounded-xl gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back to All Practice Tests
              </Button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-bold uppercase">{activeQuiz.domainSlug}</Badge>
                <Badge variant="outline" className="text-xs font-semibold capitalize">{activeQuiz.difficulty}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: Questions Navigator (3 Cols) */}
              <div className="lg:col-span-3 space-y-3 bg-card border border-border rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-primary" />
                    Questions
                  </span>
                  <span className="text-xs font-bold text-primary">
                    {Object.keys(selectedAnswers).length} / {activeQuiz.questions.length} Answered
                  </span>
                </div>

                <div className="space-y-2">
                  {activeQuiz.questions.map((q, qIdx) => {
                    const isCurrent = currentQuestionIdx === qIdx;
                    const isAnswered = selectedAnswers[qIdx] !== undefined;

                    return (
                      <button
                        key={q.id || qIdx}
                        onClick={() => setCurrentQuestionIdx(qIdx)}
                        className={cn(
                          'w-full text-left p-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between gap-2',
                          isCurrent
                            ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                            : isAnswered
                            ? 'border-emerald-500/40 bg-emerald-500/5 text-foreground'
                            : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold',
                            isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}>
                            {qIdx + 1}
                          </span>
                          <span className="truncate">Question {qIdx + 1}</span>
                        </div>

                        {isAnswered && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-border">
                  <Progress value={(Object.keys(selectedAnswers).length / (activeQuiz.questions.length || 1)) * 100} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center font-medium">
                    Click any question above to jump directly.
                  </p>
                </div>
              </div>

              {/* CENTER COLUMN: Main Content & Question Runner (6 Cols) */}
              <div className="lg:col-span-6 space-y-6">
                <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
                  <div className="border-b border-border pb-4 space-y-1">
                    <h2 className="text-xl font-extrabold text-foreground">{activeQuiz.title}</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">{activeQuiz.description}</p>
                  </div>

                  {activeQuiz.questions.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      Full practice set coming soon. Select &ldquo;OAuth 2.0 & OIDC Practice Test&rdquo; for live interactive questions.
                    </div>
                  ) : !isSubmitted ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>Question {currentQuestionIdx + 1} of {activeQuiz.questions.length}</span>
                        <span>{Math.round(((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100)}% Complete</span>
                      </div>
                      <Progress value={((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100} className="h-1.5" />

                      <div className="space-y-4">
                        <h3 className="text-base font-bold text-foreground leading-snug">
                          {activeQuiz.questions[currentQuestionIdx].question}
                        </h3>

                        <div className="space-y-2.5 pt-2">
                          {activeQuiz.questions[currentQuestionIdx].options.map((opt, optIdx) => {
                            const isSelected = selectedAnswers[currentQuestionIdx] === optIdx;
                            return (
                              <button
                                key={optIdx}
                                onClick={() => handleSelectOption(currentQuestionIdx, optIdx)}
                                className={cn(
                                  'w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between',
                                  isSelected
                                    ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                                    : 'bg-card border-border text-foreground hover:bg-muted/60'
                                )}
                              >
                                <span>{opt}</span>
                                <div className={cn(
                                  'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                                  isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                                )}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentQuestionIdx === 0}
                          onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
                          className="rounded-xl text-xs"
                        >
                          Previous
                        </Button>

                        {currentQuestionIdx < activeQuiz.questions.length - 1 ? (
                          <Button
                            size="sm"
                            disabled={selectedAnswers[currentQuestionIdx] === undefined}
                            onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                            className="rounded-xl text-xs font-bold"
                          >
                            Next Question
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={Object.keys(selectedAnswers).length < activeQuiz.questions.length}
                            onClick={() => setIsSubmitted(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs"
                          >
                            Submit Test
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 text-center">
                      <div className="p-6 rounded-3xl bg-primary/5 border border-primary/20 space-y-2">
                        <Trophy className="w-12 h-12 text-primary mx-auto mb-1" />
                        <h3 className="text-3xl font-extrabold text-foreground">{calculateScore()}% Score</h3>
                        <p className="text-xs text-muted-foreground">
                          Correct Answers: {activeQuiz.questions.filter((q, i) => selectedAnswers[i] === q.correctOptionIndex).length} / {activeQuiz.questions.length}
                        </p>
                      </div>

                      <div className="space-y-4 text-left">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Review</h4>
                        {activeQuiz.questions.map((q, i) => {
                          const isCorrect = selectedAnswers[i] === q.correctOptionIndex;
                          return (
                            <div key={q.id} className={cn(
                              'p-4 rounded-2xl border text-xs space-y-2',
                              isCorrect ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/30'
                            )}>
                              <div className="flex items-center gap-2 font-bold">
                                {isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                                <span>Q{i+1}: {q.question}</span>
                              </div>
                              <p className="text-muted-foreground leading-relaxed pl-6">
                                <span className="font-semibold text-foreground">Explanation:</span> {q.explanation}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 justify-center">
                        <Button variant="outline" size="sm" onClick={() => startQuiz(activeQuiz)} className="rounded-xl text-xs">
                          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Try Again
                        </Button>
                        <Button size="sm" onClick={() => { setActiveQuiz(null); navigate('/explore'); }} className="rounded-xl text-xs">
                          <BookOpen className="w-3.5 h-3.5 mr-1" /> Practice Weak Areas
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHTMOST COLUMN: Related Content & Recommended Courses (3 Cols) */}
              <div className="lg:col-span-3 space-y-4">
                
                {/* Related Practice Sets */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 text-primary" />
                      More Practice Sets
                    </span>
                  </div>

                  <div className="space-y-3">
                    {allQuizzes.filter(q => q.id !== activeQuiz.id).map(q => (
                      <div key={q.id} className="p-3 rounded-xl border border-border hover:border-primary/40 transition-all bg-card/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold">{q.domainSlug.toUpperCase()}</Badge>
                          <span className="text-[10px] text-muted-foreground capitalize font-semibold">{q.difficulty}</span>
                        </div>
                        <h4 className="text-xs font-bold text-foreground line-clamp-1">{q.title}</h4>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                          <span>{q.questionsCount} Questions &bull; {q.estimatedMinutes}m</span>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] font-bold text-primary" onClick={() => startQuiz(q)}>
                            Switch <ArrowRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Related Learning Courses */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-primary" />
                      Related Courses
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl border border-border/70 space-y-1.5 bg-card/40">
                      <h4 className="text-xs font-bold text-foreground line-clamp-1">OAuth 2.0 & OIDC Fundamentals</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">Master PKCE flows, authorization server setup, and JWT claims.</p>
                      <Button size="sm" variant="outline" className="w-full text-[11px] font-semibold h-7 rounded-lg mt-1" onClick={() => navigate('/course/oauth-2-fundamentals')}>
                        Study Course
                      </Button>
                    </div>

                    <div className="p-3 rounded-xl border border-border/70 space-y-1.5 bg-card/40">
                      <h4 className="text-xs font-bold text-foreground line-clamp-1">Go Backend Engineering</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">Learn concurrency, channels, and REST microservices in Go.</p>
                      <Button size="sm" variant="outline" className="w-full text-[11px] font-semibold h-7 rounded-lg mt-1" onClick={() => navigate('/course/go-backend-engineering')}>
                        Study Course
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </div>
        ) : (
          /* 2-Column Space-Optimized Grid */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Left-Aligned Compact Filter Panel */}
              <div className="md:col-span-1 space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Filter className="w-3 h-3 text-primary" />
                    Practice Type
                  </span>
                  {selectedCategory !== 'All' && (
                    <button onClick={() => setSelectedCategory('All')} className="text-[11px] text-primary hover:underline font-semibold">
                      Reset
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedCategory === cat
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column — Cards Grid */}
              <div className="md:col-span-3 space-y-4">
                

                {/* Quizzes Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {allQuizzes.map(quiz => (
                    <div
                      key={quiz.id}
                      className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md group"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {quiz.domainSlug.toUpperCase()}
                          </Badge>
                          <span className="text-[11px] font-semibold text-muted-foreground capitalize">
                            {quiz.difficulty}
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors">
                          {quiz.title}
                        </h3>

                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {quiz.description}
                        </p>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium pt-1">
                          <span className="flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5 text-primary" />
                            {quiz.questionsCount} questions
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {quiz.estimatedMinutes} mins
                          </span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/60 mt-4">
                        <Button
                          onClick={() => startQuiz(quiz)}
                          className="w-full justify-between font-bold rounded-xl text-xs h-9 bg-primary text-primary-foreground"
                        >
                          <span>Start Practice Test</span>
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

export default PracticeHub;
