import React, { useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Target, CheckCircle2, AlertTriangle, Trophy, BarChart3, Clock, ArrowRight, HelpCircle, BookOpen, Filter, X, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Quiz } from '@/types/knowledge-graph';
import { useNavigate } from 'react-router-dom';

const mockQuizzes: Quiz[] = [
  {
    id: 'q-1',
    slug: 'oauth-fundamentals-quiz',
    title: 'OAuth 2.0 & OIDC Practice Test',
    description: 'Test your understanding of authorization code flows, PKCE, state parameters, and JWT verification.',
    topicSlug: 'oauth-2',
    domainSlug: 'security',
    difficulty: 'intermediate',
    questionsCount: 5,
    estimatedMinutes: 10,
    questions: [
      {
        id: 'q1-1',
        question: 'Why is PKCE (Proof Key for Code Exchange) recommended for SPA and Mobile OAuth clients?',
        options: [
          'It replaces HTTPS encryption between client and server',
          'Client secrets cannot be securely kept confidential in public clients',
          'It allows clients to bypass the user authorization prompt',
          'It forces access tokens to expire after 60 seconds',
        ],
        correctOptionIndex: 1,
        explanation: 'SPAs and mobile apps are public clients and cannot store a client secret confidentially. PKCE creates a dynamic code_verifier / code_challenge pair to prevent authorization code injection attacks.',
        topicSlug: 'pkce',
      },
      {
        id: 'q1-2',
        question: 'Which OAuth 2.0 grant type SHOULD NOT be used in modern applications due to security deprecation?',
        options: [
          'Authorization Code Grant with PKCE',
          'Client Credentials Grant',
          'Implicit Grant',
          'Device Authorization Grant',
        ],
        correctOptionIndex: 2,
        explanation: 'Implicit Grant returns access tokens directly in URI fragments, exposing them to access token leakage and history logs. It has been deprecated by OAuth 2.0 Security Best Current Practice.',
        topicSlug: 'oauth-2',
      },
      {
        id: 'q1-3',
        question: 'What is the primary role of an ID Token in OpenID Connect (OIDC)?',
        options: [
          'To grant permission to access a downstream microservice API',
          'To assert user identity details (claims) to the client application',
          'To encrypt payload data transmitted over WebSockets',
          'To refresh database connections asynchronously',
        ],
        correctOptionIndex: 1,
        explanation: 'ID Tokens (JSON Web Tokens) are formatted specifically for the client app to consume identity assertions about the authenticated end-user.',
        topicSlug: 'oidc',
      },
    ],
  },
  {
    id: 'q-2',
    slug: 'go-concurrency-test',
    title: 'Go Concurrency & Channels Practice',
    description: 'Test goroutine safety, channel buffering, select blocks, and sync package primitives.',
    topicSlug: 'go-concurrency',
    domainSlug: 'backend',
    difficulty: 'intermediate',
    questionsCount: 4,
    estimatedMinutes: 8,
    questions: [],
  },
  {
    id: 'q-3',
    slug: 'kubernetes-networking-test',
    title: 'Kubernetes Networking & Services Quiz',
    description: 'Test CNI plugins, ClusterIP vs NodePort vs LoadBalancer, and Ingress routing rules.',
    topicSlug: 'kubernetes',
    domainSlug: 'cloud',
    difficulty: 'advanced',
    questionsCount: 6,
    estimatedMinutes: 15,
    questions: [],
  },
];

export function PracticeHub() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const categories = ['All', 'Quizzes', 'Tests', 'Coding', 'Hands-on Labs', 'Challenges'];

  const startQuiz = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setCurrentQuestionIdx(0);
    setSelectedAnswers({});
    setIsSubmitted(false);
  };

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
          /* In-Page Interactive Quiz View */
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
            <Button variant="ghost" size="sm" onClick={() => setActiveQuiz(null)} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground mb-2">
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to All Practice Tests
            </Button>

            <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
              <div className="border-b border-border pb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{activeQuiz.domainSlug.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground font-semibold uppercase">{activeQuiz.difficulty}</span>
                </div>
                <h2 className="text-2xl font-extrabold text-foreground">{activeQuiz.title}</h2>
                <p className="text-xs text-muted-foreground">{activeQuiz.description}</p>
              </div>

              {activeQuiz.questions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Full practice set coming soon. Select &ldquo;OAuth 2.0 & OIDC Practice Test&rdquo; for live interactive questions.
                </div>
              ) : !isSubmitted ? (
                <div className="space-y-6 pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>Question {currentQuestionIdx + 1} of {activeQuiz.questions.length}</span>
                    <span>{Math.round(((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100)}% Complete</span>
                  </div>
                  <Progress value={((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100} className="h-1.5" />

                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-foreground leading-snug">
                      {activeQuiz.questions[currentQuestionIdx].question}
                    </h4>

                    <div className="space-y-2.5 pt-2">
                      {activeQuiz.questions[currentQuestionIdx].options.map((opt, optIdx) => {
                        const isSelected = selectedAnswers[currentQuestionIdx] === optIdx;
                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleSelectOption(currentQuestionIdx, optIdx)}
                            className={`w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-primary/10 border-primary text-primary font-bold shadow-xs'
                                : 'bg-card border-border text-foreground hover:bg-muted/60'
                            }`}
                          >
                            <span>{opt}</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                            }`}>
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
                    >
                      Previous
                    </Button>

                    {currentQuestionIdx < activeQuiz.questions.length - 1 ? (
                      <Button
                        size="sm"
                        disabled={selectedAnswers[currentQuestionIdx] === undefined}
                        onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                      >
                        Next Question
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={Object.keys(selectedAnswers).length < activeQuiz.questions.length}
                        onClick={() => setIsSubmitted(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      >
                        Submit Test
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pt-2 text-center">
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
                        <div key={q.id} className={`p-4 rounded-2xl border text-xs space-y-2 ${
                          isCorrect ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-rose-500/5 border-rose-500/30'
                        }`}>
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
                    <Button variant="outline" size="sm" onClick={() => startQuiz(activeQuiz)}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Try Again
                    </Button>
                    <Button size="sm" onClick={() => { setActiveQuiz(null); navigate('/explore'); }}>
                      <BookOpen className="w-3.5 h-3.5 mr-1" /> Practice Weak Areas
                    </Button>
                  </div>
                </div>
              )}
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
                
                {/* Compact Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-card border border-border rounded-2xl p-4">
                  <div className="text-center sm:border-r border-border/60">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block">Accuracy</span>
                    <span className="text-lg font-extrabold text-primary">78%</span>
                  </div>
                  <div className="text-center sm:border-r border-border/60">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block">Solved</span>
                    <span className="text-lg font-extrabold text-foreground">384</span>
                  </div>
                  <div className="text-center sm:border-r border-border/60">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block">Strong</span>
                    <span className="text-xs font-bold text-foreground truncate block">Go · HTTP</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase block">Review</span>
                    <span className="text-xs font-bold text-foreground truncate block">Kubernetes</span>
                  </div>
                </div>

                {/* Quizzes Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {mockQuizzes.map(quiz => (
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
