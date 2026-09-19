import React, { useState, useMemo } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Briefcase, Eye, EyeOff, AlertCircle, BookOpen, Filter, CheckCircle2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface InterviewQuestionItem {
  id: string;
  slug: string;
  question: string;
  difficulty: 'Entry' | 'Intermediate' | 'Senior' | 'Staff';
  role: 'Backend' | 'Cloud' | 'DevOps' | 'Security' | 'SRE' | 'Software Engineer';
  round: 'Coding' | 'Technical' | 'System Design' | 'Scenario' | 'Behavioral';
  category: string;
  thinkPrompt: string;
  answerExplanation: string;
  commonMistakes: string[];
  relatedConcepts: string[];
  relatedCourseSlug?: string;
  relatedArticleSlug?: string;
}

const mockQuestions: InterviewQuestionItem[] = [
  {
    id: 'iq-1',
    slug: 'oauth-code-flow-pkce-interview',
    question: 'How does the OAuth 2.0 Authorization Code flow with PKCE work, and why is it superior to implicit flow?',
    difficulty: 'Intermediate',
    role: 'Security',
    round: 'Technical',
    category: 'Security & Identity',
    thinkPrompt: 'Consider public vs confidential clients, code_verifier, code_challenge, and URI fragment interception vectors.',
    answerExplanation: `1. The client generates a cryptographic random string called 'code_verifier' and hashes it via SHA-256 to produce 'code_challenge'.
2. The user initiates login; the client sends the authorization request with code_challenge and code_challenge_method=S256.
3. The authorization server returns a short-lived authorization code to the redirect_uri.
4. The client exchanges the authorization code PLUS the unhashed code_verifier at the token endpoint.
5. The server hashes code_verifier and confirms it matches code_challenge before issuing tokens.`,
    commonMistakes: [
      'Confusing code_verifier with client_secret',
      'Thinking PKCE is only needed for mobile apps (it is mandatory for SPAs too)',
      'Storing client_secret in frontend JavaScript React code',
    ],
    relatedConcepts: ['OAuth 2.0', 'OIDC', 'PKCE', 'JWT'],
    relatedCourseSlug: '/course/oauth-2-fundamentals',
    relatedArticleSlug: '/article/oauth-2-explained',
  },
  {
    id: 'iq-2',
    slug: 'goroutines-vs-os-threads',
    question: 'How do Go goroutines differ from operating system threads under the M:N scheduler?',
    difficulty: 'Intermediate',
    role: 'Backend',
    round: 'Technical',
    category: 'Go Backend',
    thinkPrompt: 'Think about stack size allocations, context switching cost in kernel mode vs user space, and the Go runtime GMP model.',
    answerExplanation: `Goroutines are lightweight user-space threads managed by the Go runtime scheduler (GMP model), requiring only ~2KB initial stack allocation that dynamically grows/shrinks. OS threads are kernel-managed, requiring fixed 1-2MB stack allocations and context switches that require kernel interrupts.`,
    commonMistakes: [
      'Assuming 1 goroutine maps 1:1 to an OS thread',
      'Ignoring channel deadlocks and goroutine leaks in production',
    ],
    relatedConcepts: ['Go', 'Concurrency', 'GMP Scheduler', 'Channels'],
    relatedCourseSlug: '/course/go-backend-engineering',
  },
  {
    id: 'iq-3',
    slug: 'kubernetes-pod-eviction-system-design',
    question: 'How would you design high-availability pod disruption budgets during cluster upgrades?',
    difficulty: 'Senior',
    role: 'Cloud',
    round: 'System Design',
    category: 'Kubernetes Infrastructure',
    thinkPrompt: 'Consider PodDisruptionBudgets (PDB), node drain cordoning, anti-affinity rules, and health readiness probes.',
    answerExplanation: `Define PodDisruptionBudgets specifying minAvailable replicas during voluntary disruptions. Use pod anti-affinity across availability zones and set readiness probes to ensure traffic only routes to healthy instances.`,
    commonMistakes: [
      'Not configuring PDBs leading to simultaneous node drains during cluster upgrades',
    ],
    relatedConcepts: ['Kubernetes', 'PDB', 'High Availability', 'DevOps'],
  },
];

export function InterviewPrepHub() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedRound, setSelectedRound] = useState<string>('All');
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  const roles = ['All', 'Backend', 'Cloud', 'DevOps', 'Security', 'SRE', 'Software Engineer'];
  const rounds = ['All', 'Coding', 'Technical', 'System Design', 'Scenario', 'Behavioral'];

  const toggleReveal = (id: string) => {
    setRevealedAnswers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredQuestions = useMemo(() => {
    return mockQuestions.filter(q => {
      const matchesSearch = searchQuery === '' || 
        q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.relatedConcepts.some(c => c.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = selectedRole === 'All' || q.role === selectedRole;
      const matchesRound = selectedRound === 'All' || q.round === selectedRound;

      return matchesSearch && matchesRole && matchesRound;
    });
  }, [searchQuery, selectedRole, selectedRound]);

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        
        {/* Clean Sub-Header Bar — Title Left, Centered Search Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Interview Prep
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Active recall question cards</p>
              </div>
            </div>

            {/* Centered Search Bar */}
            <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search interview questions..."
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

            {/* Right Spacer */}
            <div className="hidden sm:block sm:w-1/4"></div>
          </div>
        </div>

        {/* 2-Column Space-Optimized Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left-Aligned Compact Filter Panel */}
            <div className="md:col-span-1 space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Filter className="w-3 h-3 text-primary" />
                  Role & Round
                </span>
                {(selectedRole !== 'All' || selectedRound !== 'All' || searchQuery !== '') && (
                  <button onClick={() => { setSelectedRole('All'); setSelectedRound('All'); setSearchQuery(''); }} className="text-[11px] text-primary hover:underline font-semibold">
                    Reset
                  </button>
                )}
              </div>

              {/* Roles list */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Target Role</label>
                <div className="flex flex-wrap gap-1">
                  {roles.map(r => (
                    <button
                      key={r}
                      onClick={() => setSelectedRole(r)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedRole === r
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Round list */}
              <div className="space-y-1 pt-1.5 border-t border-border/50">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Round</label>
                <div className="flex flex-wrap gap-1">
                  {rounds.map(rnd => (
                    <button
                      key={rnd}
                      onClick={() => setSelectedRound(rnd)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedRound === rnd
                          ? 'bg-primary/10 text-primary font-bold border border-primary/30'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {rnd}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — Active Recall Question Cards */}
            <div className="md:col-span-3 space-y-4">
              <div className="space-y-4">
                {filteredQuestions.map(q => {
                  const isRevealed = !!revealedAnswers[q.id];
                  return (
                    <div
                      key={q.id}
                      className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] font-bold">{q.role} Role</Badge>
                          <Badge variant="outline" className="text-[10px] font-medium">{q.round}</Badge>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          Difficulty: {q.difficulty}
                        </span>
                      </div>

                      <h3 className="text-lg font-extrabold text-foreground leading-snug">
                        {q.question}
                      </h3>

                      <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
                        <span className="font-bold text-amber-600 dark:text-amber-400 block uppercase tracking-wider">Think about it:</span>
                        <p className="text-foreground/90">{q.thinkPrompt}</p>
                      </div>

                      <Button
                        onClick={() => toggleReveal(q.id)}
                        variant={isRevealed ? 'outline' : 'default'}
                        className="w-full justify-center gap-2 font-bold text-xs h-9 rounded-xl"
                      >
                        {isRevealed ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Hide Solution
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Reveal Answer & Explanation
                          </>
                        )}
                      </Button>

                      {isRevealed && (
                        <div className="pt-3 border-t border-border space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Explanation</span>
                            <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground leading-relaxed whitespace-pre-line font-mono">
                              {q.answerExplanation}
                            </div>
                          </div>

                          {q.commonMistakes.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Common Mistakes
                              </span>
                              <ul className="space-y-0.5 pl-4 list-disc text-xs text-muted-foreground">
                                {q.commonMistakes.map((m, idx) => (
                                  <li key={idx} className="leading-relaxed">{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">Concepts:</span>
                              {q.relatedConcepts.map(c => (
                                <span key={c} className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                                  {c}
                                </span>
                              ))}
                            </div>

                            {q.relatedCourseSlug && (
                              <Button size="sm" variant="ghost" className="text-xs font-bold text-primary h-7 px-2" onClick={() => navigate(q.relatedCourseSlug!)}>
                                <BookOpen className="w-3.5 h-3.5 mr-1" /> Study Course
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default InterviewPrepHub;
