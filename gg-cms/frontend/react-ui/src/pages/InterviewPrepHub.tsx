import React, { useState, useMemo } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Briefcase, Eye, EyeOff, AlertCircle, BookOpen, Filter, CheckCircle2, X, ChevronDown, Clock, Layers, PlayCircle, ArrowRight, Shield, Award } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { cn } from '@/lib/utils';
import { buildCourseUrl } from '@/lib/slug';

interface InterviewQuestionItem {
  id: string;
  questionNumber: number;
  question: string;
  thinkPrompt: string;
  answerExplanation: string;
  commonMistakes: string[];
  relatedConcepts: string[];
}

interface InterviewCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: 'Entry' | 'Intermediate' | 'Senior' | 'Staff';
  role: 'Backend' | 'Cloud' | 'DevOps' | 'Security' | 'SRE' | 'Software Engineer';
  round: 'Coding' | 'Technical' | 'System Design' | 'Scenario' | 'Behavioral';
  estimatedHours: number;
  questions: InterviewQuestionItem[];
}

const mockInterviewCourses: InterviewCourse[] = [
  {
    id: 'ic-1',
    slug: 'system-design',
    title: 'System Design & Technical Interview Mastery',
    description: 'Comprehensive interview track covering high-scale system design, load balancing, caching, database sharding, and real-time distributed systems.',
    difficulty: 'Senior',
    role: 'Software Engineer',
    round: 'System Design',
    estimatedHours: 12,
    questions: [
      {
        id: 'iq-101',
        questionNumber: 1,
        question: 'How would you design a distributed rate limiter to handle 100k requests/sec across multiple data centers?',
        thinkPrompt: 'Consider Token Bucket vs Leaky Bucket algorithms, Redis atomicity (Lua scripts), and sliding window log counters.',
        answerExplanation: `1. Algorithm Selection: Use Sliding Window Counter with Redis for memory efficiency and precision.
2. Atomicity: Execute rate-limit evaluation inside a Redis Lua Script to ensure atomic check-and-increment operations without race conditions.
3. Multi-DC Sync: Deploy local Redis clusters per region with local rate-limiting counters, periodically syncing aggregate usage asynchronously to avoid inter-region latency.`,
        commonMistakes: [
          'Using fixed window counters which allow 2x burst traffic at window boundaries',
          'Making remote synchronous API calls across regions during the rate-limit evaluation path',
        ],
        relatedConcepts: ['Rate Limiting', 'Redis Lua', 'Sliding Window', 'Distributed Systems'],
      },
      {
        id: 'iq-102',
        questionNumber: 2,
        question: 'How do you design a high-throughput real-time notification system with delivery guarantees?',
        thinkPrompt: 'Think about WebSocket connection gateways, message queues (Kafka), idempotent delivery, and push notifications.',
        answerExplanation: `1. Gateway Layer: Stateful WebSocket gateway servers maintain persistent client connections.
2. Queue Layer: Use Kafka topics partitioned by userId to guarantee ordered message delivery.
3. Idempotency & Persistence: Store notification status in PostgreSQL with unique message UUIDs to handle retries cleanly.`,
        commonMistakes: [
          'Storing active WebSocket connection state in single monolithic app memory without a pub/sub backbone',
          'Failing to implement client-side deduplication using unique message IDs',
        ],
        relatedConcepts: ['Kafka', 'WebSockets', 'Idempotency', 'Pub/Sub'],
      },
    ],
  },
  {
    id: 'ic-2',
    slug: 'api-security',
    title: 'OAuth 2.0 & Identity Security Interview Track',
    description: 'Master enterprise identity architecture, PKCE grant flows, OIDC token assertion, BOLA/IDOR vulnerability patching, and security audits.',
    difficulty: 'Intermediate',
    role: 'Security',
    round: 'Technical',
    estimatedHours: 8,
    questions: [
      {
        id: 'iq-201',
        questionNumber: 1,
        question: 'How does the OAuth 2.0 Authorization Code flow with PKCE work, and why is implicit flow deprecated?',
        thinkPrompt: 'Consider public vs confidential clients, code_verifier, code_challenge, and URI fragment interception vectors.',
        answerExplanation: `1. Cryptographic Challenge: Client generates a random code_verifier and derives code_challenge via SHA-256 (S256).
2. Authorization Request: Client sends code_challenge with the login redirect.
3. Token Exchange: Authorization server issues a short-lived code. Client exchanges code PLUS unhashed code_verifier for tokens.
4. Security Proof: Server hashes code_verifier and verifies match before granting access, preventing code interception attacks on public clients.`,
        commonMistakes: [
          'Confusing code_verifier with client_secret',
          'Assuming PKCE is only needed for native mobile apps (it is mandatory for SPAs as well)',
        ],
        relatedConcepts: ['OAuth 2.0', 'OIDC', 'PKCE', 'JWT Security'],
      },
      {
        id: 'iq-202',
        questionNumber: 2,
        question: 'How do you detect and remediate Broken Object Level Authorization (BOLA/IDOR) in REST APIs?',
        thinkPrompt: 'Think about object-level access control checks, tenant isolation, and automated authorization testing.',
        answerExplanation: `1. Root Cause: BOLA occurs when an API endpoint uses user-supplied IDs (e.g., GET /api/orders/123) without verifying if the requesting user owns that object.
2. Remediation: Enforce mandatory subject check at data access layer: WHERE order_id = :id AND user_id = :authenticatedUser.
3. Automated Tests: Write integration tests asserting that User A receives 403 Forbidden when requesting User B resources.`,
        commonMistakes: [
          'Relying solely on frontend UI hiding buttons instead of enforcing authorization checks in backend handlers',
        ],
        relatedConcepts: ['BOLA', 'OWASP API Top 10', 'RBAC', 'Tenant Isolation'],
      },
    ],
  },
  {
    id: 'ic-3',
    slug: 'go-backend-engineering',
    title: 'Go Backend & Concurrency Interview Course',
    description: 'Deep dive into Go goroutines, M:N scheduler (GMP model), channel deadlock prevention, memory profiling, and high-concurrency API design.',
    difficulty: 'Intermediate',
    role: 'Backend',
    round: 'Coding',
    estimatedHours: 10,
    questions: [
      {
        id: 'iq-301',
        questionNumber: 1,
        question: 'How do Go goroutines differ from operating system threads under the M:N scheduler?',
        thinkPrompt: 'Think about stack size allocations, context switching cost in kernel mode vs user space, and the Go runtime GMP model.',
        answerExplanation: `1. Stack Size: Goroutines start with ~2KB dynamic stack allocation that grows/shrinks as needed; OS threads allocate fixed 1-2MB stacks.
2. Context Switching: Goroutines are scheduled in user-space by the Go runtime (GMP model), avoiding expensive kernel interrupts.
3. Multiplexing: The M:N scheduler maps M goroutines onto N OS threads across P logical processors.`,
        commonMistakes: [
          'Assuming 1 goroutine maps 1:1 to an OS kernel thread',
          'Ignoring unbuffered channel blocks which cause goroutine memory leaks',
        ],
        relatedConcepts: ['Go Concurrency', 'GMP Scheduler', 'Goroutines', 'Channels'],
      },
    ],
  },
  {
    id: 'ic-4',
    slug: 'kubernetes-networking-deep-dive',
    title: 'Kubernetes & Cloud Infrastructure Interview Course',
    description: 'Practice real-world SRE scenarios, PodDisruptionBudgets, CNI network policy debugging, ingress controllers, and zero-downtime rolling upgrades.',
    difficulty: 'Senior',
    role: 'Cloud',
    round: 'Scenario',
    estimatedHours: 9,
    questions: [
      {
        id: 'iq-401',
        questionNumber: 1,
        question: 'How would you design high-availability PodDisruptionBudgets (PDB) during node drains & cluster upgrades?',
        thinkPrompt: 'Consider PodDisruptionBudgets (PDB), node cordoning, anti-affinity rules, and health readiness probes.',
        answerExplanation: `1. Disruption Limits: Define PodDisruptionBudgets specifying minAvailable replicas during voluntary disruptions.
2. High Availability: Configure pod anti-affinity across availability zones to prevent single-zone outages.
3. Readiness Probes: Set readiness probes with initial delays to ensure incoming traffic only routes to healthy instances before proceeding with node drain.`,
        commonMistakes: [
          'Not setting PDBs leading to simultaneous node drains during cluster upgrades',
        ],
        relatedConcepts: ['Kubernetes', 'PDB', 'High Availability', 'DevOps'],
      },
    ],
  },
];

export function InterviewPrepHub() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedRound, setSelectedRound] = useState<string>('All');
  
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({
    'ic-1': true, // Default open first interview course
  });
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  // Live backend courses hook for fallback
  const { data: publicCmsData } = usePublicCmsList({ type: 'COURSE', size: 50 });

  const roles = ['All', 'Backend', 'Cloud', 'DevOps', 'Security', 'SRE', 'Software Engineer'];
  const rounds = ['All', 'Coding', 'Technical', 'System Design', 'Scenario', 'Behavioral'];

  const toggleCourseExpand = (id: string) => {
    setExpandedCourses(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRevealAnswer = (qId: string) => {
    setRevealedAnswers(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const filteredCourses = useMemo(() => {
    return mockInterviewCourses.filter(c => {
      const matchesSearch = searchQuery === '' ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.questions.some(q => q.question.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = selectedRole === 'All' || c.role === selectedRole;
      const matchesRound = selectedRound === 'All' || c.round === selectedRound;

      return matchesSearch && matchesRole && matchesRound;
    });
  }, [searchQuery, selectedRole, selectedRound]);

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        
        {/* Sub-Header Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Interview Prep Courses
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Question-specific interview tracks & courses</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search interview courses & questions..."
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

            <div className="hidden sm:block sm:w-1/6"></div>
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left Filter Panel */}
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

              {/* Roles */}
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

              {/* Rounds */}
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

            {/* Right Column — Interview Prep Courses Cards */}
            <div className="md:col-span-3 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Available Interview Courses ({filteredCourses.length})
                </span>
                <Badge variant="outline" className="text-xs">
                  Course-Based Interview Preparation
                </Badge>
              </div>

              {filteredCourses.length > 0 ? (
                <div className="space-y-5">
                  {filteredCourses.map(course => {
                    const isExpanded = !!expandedCourses[course.id];
                    return (
                      <Card
                        key={course.id}
                        className={cn(
                          'rounded-2xl border border-border overflow-hidden transition-all bg-card',
                          isExpanded ? 'shadow-md border-primary/40' : 'hover:border-primary/30'
                        )}
                      >
                        {/* Course Card Header */}
                        <div
                          onClick={() => toggleCourseExpand(course.id)}
                          className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                        >
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                                {course.role} Role Track
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-semibold">
                                {course.round}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground font-medium">
                                &bull; {course.difficulty} Level
                              </span>
                            </div>

                            <h3 className="text-lg font-extrabold text-foreground line-clamp-1">
                              {course.title}
                            </h3>

                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {course.description}
                            </p>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium pt-1">
                              <span className="flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5 text-primary" />
                                {course.questions.length} Interview Question Modules
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-primary" />
                                ~{course.estimatedHours} Hours Course Duration
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/course/${course.slug}`);
                              }}
                              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl gap-1.5"
                            >
                              <PlayCircle className="w-4 h-4" /> Start Interview Course
                            </Button>
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                              <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                            </div>
                          </div>
                        </div>

                        {/* Expanded Question Modules */}
                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20 p-5 space-y-4">
                            <div className="flex items-center justify-between border-b border-border/60 pb-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-primary" />
                                Question-Specific Course Modules
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {course.questions.length} Scenario Breakdown
                              </span>
                            </div>

                            <div className="space-y-4">
                              {course.questions.map((q) => {
                                const isRevealed = !!revealedAnswers[q.id];
                                return (
                                  <div
                                    key={q.id}
                                    className="p-4 rounded-2xl border border-border/80 bg-card space-y-3 shadow-2xs"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                                          Q{q.questionNumber}
                                        </div>
                                        <h4 className="text-sm font-extrabold text-foreground leading-snug">
                                          {q.question}
                                        </h4>
                                      </div>
                                    </div>

                                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs space-y-1">
                                      <span className="font-bold text-amber-600 dark:text-amber-400 block uppercase tracking-wider text-[10px]">Architectural Prompt:</span>
                                      <p className="text-foreground/90">{q.thinkPrompt}</p>
                                    </div>

                                    <div className="flex items-center justify-between pt-1">
                                      <Button
                                        onClick={() => toggleRevealAnswer(q.id)}
                                        variant="outline"
                                        size="sm"
                                        className="h-8 rounded-xl text-xs gap-1.5 font-semibold"
                                      >
                                        {isRevealed ? (
                                          <>
                                            <EyeOff className="w-3.5 h-3.5" /> Hide Solution
                                          </>
                                        ) : (
                                          <>
                                            <Eye className="w-3.5 h-3.5" /> Reveal Solution & Trade-offs
                                          </>
                                        )}
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => navigate(`/course/${course.slug}`)}
                                        className="h-8 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl"
                                      >
                                        Practice in Course <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                      </Button>
                                    </div>

                                    {isRevealed && (
                                      <div className="pt-3 border-t border-border space-y-3 animate-in fade-in duration-150">
                                        <div className="space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Solution Walk-through</span>
                                          <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground leading-relaxed whitespace-pre-line font-mono">
                                            {q.answerExplanation}
                                          </div>
                                        </div>

                                        {q.commonMistakes.length > 0 && (
                                          <div className="space-y-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                                              <AlertCircle className="w-3 h-3" /> Common Interview Traps
                                            </span>
                                            <ul className="space-y-0.5 pl-4 list-disc text-xs text-muted-foreground">
                                              {q.commonMistakes.map((m, idx) => (
                                                <li key={idx}>{m}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Full Course CTA */}
                            <div className="pt-2 flex items-center justify-between border-t border-border/60">
                              <span className="text-xs text-muted-foreground">
                                Enrolling grants access to hands-on code labs and detailed interview guides.
                              </span>
                              <Button
                                size="sm"
                                onClick={() => navigate(`/course/${course.slug}`)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold gap-1.5"
                              >
                                <BookOpen className="w-3.5 h-3.5" /> Launch {course.title}
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 border border-dashed rounded-2xl p-8 space-y-3">
                  <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <h3 className="text-base font-bold text-foreground">No interview courses found</h3>
                  <p className="text-sm text-muted-foreground">Try clearing filters or search query.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default InterviewPrepHub;

