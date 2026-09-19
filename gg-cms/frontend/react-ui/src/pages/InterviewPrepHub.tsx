import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, Briefcase, Eye, EyeOff, AlertCircle, BookOpen, Filter, CheckCircle2, X, ChevronDown, Clock, Layers, PlayCircle, ArrowRight, Shield, Award, ArrowLeft, Target, RefreshCw, HelpCircle, PenTool } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { cn } from '@/lib/utils';

export interface InterviewQuestionItem {
  id: string;
  questionNumber: number;
  question: string;
  thinkPrompt: string;
  answerExplanation: string;
  commonMistakes: string[];
  relatedConcepts: string[];
}

export interface InterviewCourse {
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

export const mockInterviewCourses: InterviewCourse[] = [
  {
    id: 'ic-1',
    slug: 'system-design',
    title: 'System Design & Technical Interview Track',
    description: 'Comprehensive interview track covering high-scale system design, load balancing, caching, database sharding, distributed transactions, and real-time systems.',
    difficulty: 'Senior',
    role: 'Software Engineer',
    round: 'System Design',
    estimatedHours: 14,
    questions: [
      {
        id: 'iq-101',
        questionNumber: 1,
        question: 'How would you design a distributed rate limiter to handle 100k requests/sec across multiple data centers?',
        thinkPrompt: 'Consider Token Bucket vs Leaky Bucket algorithms, Redis atomicity (Lua scripts), and sliding window log counters.',
        answerExplanation: `1. Algorithm Selection: Use Sliding Window Counter with Redis for memory efficiency and high sub-millisecond precision.
2. Atomicity: Execute rate-limit evaluation inside a Redis Lua Script to ensure atomic check-and-increment operations without race conditions.
3. Multi-DC Sync: Deploy local Redis clusters per region with local rate-limiting counters, periodically syncing aggregate usage asynchronously to avoid inter-region latency penalty.`,
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
2. Queue Layer: Use Kafka topics partitioned by userId to guarantee ordered message delivery across consumer groups.
3. Idempotency & Persistence: Store notification status in PostgreSQL with unique message UUIDs to handle retries cleanly without duplicating alerts.`,
        commonMistakes: [
          'Storing active WebSocket connection state in single monolithic app memory without a pub/sub backbone',
          'Failing to implement client-side deduplication using unique message IDs',
        ],
        relatedConcepts: ['Kafka', 'WebSockets', 'Idempotency', 'Pub/Sub'],
      },
      {
        id: 'iq-103',
        questionNumber: 3,
        question: 'How do you handle database sharding and rebalancing without downtime in a high-growth SaaS application?',
        thinkPrompt: 'Evaluate Consistent Hashing, virtual nodes, dual-writing during migration, and backfill scripts.',
        answerExplanation: `1. Sharding Key: Choose a high-cardinality key (e.g. tenant_id or user_id) to avoid hotspotting across database nodes.
2. Consistent Hashing: Map shard ranges using a virtual node ring to minimize key movements when adding new database instances.
3. Zero-Downtime Migration: Dual-write to old and new shards, asynchronously backfill historical data, verify checksums, and switch read traffic safely.`,
        commonMistakes: [
          'Selecting low-cardinality keys like country or gender resulting in uneven shard sizes',
          'Performing hard cutovers without shadow writes or automated fallback mechanisms',
        ],
        relatedConcepts: ['Sharding', 'Consistent Hashing', 'Database Scaling', 'Zero Downtime'],
      },
      {
        id: 'iq-104',
        questionNumber: 4,
        question: 'How do you manage distributed transactions across microservices without relying on 2-Phase Commit (2PC)?',
        thinkPrompt: 'Evaluate the Saga Pattern (Choreography vs Orchestration), Compensating Transactions, and the Transactional Outbox Pattern.',
        answerExplanation: `1. Saga Pattern: Break the distributed transaction into a sequence of local transactions. Each step executes a local DB write and publishes an event.
2. Orchestration vs Choreography: Prefer Orchestration for complex workflows where a dedicated Coordinator service drives execution and handles compensations.
3. Transactional Outbox: Write domain updates and outgoing event payloads into an outbox table within the same DB transaction, then tail outbox via CDC (Debezium/Kafka) for 100% atomicity.`,
        commonMistakes: [
          'Using synchronous 2PC (Two-Phase Commit) which locks resources and drastically reduces throughput under network partitions',
          'Publishing Kafka events before committing local DB transactions, risking ghost events if DB rolls back',
        ],
        relatedConcepts: ['Saga Pattern', 'Transactional Outbox', 'Eventual Consistency', 'Microservices'],
      },
      {
        id: 'iq-105',
        questionNumber: 5,
        question: 'How do you prevent Cache Stampede (Thundering Herd) and manage multi-tier caching (Edge CDN + L2 Redis)?',
        thinkPrompt: 'Consider Singleflight mutex request deduplication, probabilistic early expiration (XFetch algorithm), and cache write-through strategies.',
        answerExplanation: `1. Singleflight Deduplication: Use Go singleflight or in-memory mutex locks to ensure only ONE worker fetches expensive data from PostgreSQL when cache expires.
2. Probabilistic Expiration: Implement XFetch or background refresh tasks before TTL expires to keep hot keys warm automatically.
3. Tiering: Cache static assets at Cloudflare CDN edge, aggregated JSON payloads in L2 Redis cluster, and index lookups in process memory.`,
        commonMistakes: [
          'Allowing 10,000 concurrent requests to hit the DB directly when a cache key expires simultaneously',
          'Setting static TTLs without jitter, causing massive simultaneous key evaporations',
        ],
        relatedConcepts: ['Cache Stampede', 'Singleflight', 'Redis L2', 'Multi-Tier Caching'],
      },
      {
        id: 'iq-106',
        questionNumber: 6,
        question: 'How do you implement distributed locking securely across cluster instances, and how do you protect against GC pauses?',
        thinkPrompt: 'Evaluate Redis Redlock, Zookeeper/etcd lease locks, Fencing Tokens, and clock drift vulnerabilities.',
        answerExplanation: `1. Algorithm & Lease: Use etcd or Redis with TTL leases. Set lock duration larger than maximum expected execution window.
2. Fencing Tokens: Generate a monotonically increasing fencing token with each lock acquisition. Storage backends validate token version before applying writes.
3. GC Pause Resilience: Even if a process suffers a stop-the-world GC pause causing lock expiry, the storage engine rejects stale writes with outdated fencing tokens.`,
        commonMistakes: [
          'Assuming a basic Redis SETNX key lock is sufficient without fencing tokens or lease renewals',
          'Ignoring clock drift across servers when relying on time-based lock expirations',
        ],
        relatedConcepts: ['Distributed Locking', 'Redlock', 'Fencing Tokens', 'etcd / Zookeeper'],
      }
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
    title: 'Go Backend & Concurrency Interview Track',
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
      {
        id: 'iq-302',
        questionNumber: 2,
        question: 'How do you prevent race conditions and memory leaks when managing worker pools in Go?',
        thinkPrompt: 'Evaluate buffered worker channels, context cancellation (context.WithCancel), and sync.WaitGroup teardowns.',
        answerExplanation: `1. Worker Pool Setup: Spawn fixed worker goroutines reading from a shared jobs channel.
2. Graceful Teardown: Close the jobs channel after pushing work items, allowing workers to drain items and exit cleanly.
3. Context Cancellation: Use context.Context propagation to signal emergency timeouts and cancel inflight HTTP/DB operations.`,
        commonMistakes: [
          'Writing to closed channels causing runtime panics',
          'Spawning unbounded goroutines per incoming request without backpressure limits',
        ],
        relatedConcepts: ['Worker Pools', 'Channels', 'Context Cancellation', 'Concurrency'],
      },
    ],
  },
  {
    id: 'ic-4',
    slug: 'kubernetes-networking-deep-dive',
    title: 'Kubernetes & Cloud Infrastructure Interview Track',
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

function generateQuestionsForTrack(slug: string): InterviewQuestionItem[] {
  const cleanTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return [
    {
      id: `${slug}-q1`,
      questionNumber: 1,
      question: `How would you architect a high-availability, production-grade system for ${cleanTitle}?`,
      thinkPrompt: 'Consider microservice decoupling, stateless API layers, caching strategies, and database indexing.',
      answerExplanation: `1. System Boundaries: Define distinct microservices with REST/gRPC API boundaries.
2. Resiliency: Implement circuit breakers, rate limiters, and retry logic with exponential backoff.
3. Storage & Caching: Use PostgreSQL for relational data and Redis for hot data caching.`,
      commonMistakes: ['Coupling domain logic across service boundaries', 'Omitting rate limiting on public API gateways'],
      relatedConcepts: [cleanTitle, 'Architecture', 'Microservices', 'Resiliency'],
    },
    {
      id: `${slug}-q2`,
      questionNumber: 2,
      question: `What telemetry and observability metrics are essential for diagnosing issues in ${cleanTitle}?`,
      thinkPrompt: 'Evaluate OpenTelemetry tracing, Prometheus metrics, structured JSON logging, and alerting thresholds.',
      answerExplanation: `1. Golden Signals: Track Latency, Traffic, Error Rates, and Saturation.
2. Tracing: Inject distributed trace IDs across HTTP request headers.
3. Alerting: Configure PagerDuty alerts on p99 latency spikes and error rate breaches (>1%).`,
      commonMistakes: ['Logging sensitive credentials in plain text', 'Alerting on transient non-actionable spikes'],
      relatedConcepts: ['Observability', 'OpenTelemetry', 'Prometheus', 'Metrics'],
    },
    {
      id: `${slug}-q3`,
      questionNumber: 3,
      question: `How do you handle database concurrency, distributed locking, and cache invalidation in ${cleanTitle}?`,
      thinkPrompt: 'Consider pessimistic vs optimistic locking, Redis cache eviction policies, and CDC sync.',
      answerExplanation: `1. Optimistic Locking: Use version numbers on database records to prevent lost updates under low contention.
2. Cache Invalidation: Implement write-through caching or tail DB logs via Change Data Capture (CDC) to keep Redis synchronized.
3. Distributed Locks: Use Redis/etcd locks with fencing tokens when coordinating shared resources across cluster nodes.`,
      commonMistakes: ['Using long-running database transactions for external network calls', 'Omitting TTLs on cache entries'],
      relatedConcepts: ['Concurrency', 'Cache Invalidation', 'CDC', 'Optimistic Locking'],
    },
    {
      id: `${slug}-q4`,
      questionNumber: 4,
      question: `How would you scale ${cleanTitle} for 10x traffic growth while preserving low-latency SLA guarantees?`,
      thinkPrompt: 'Evaluate horizontal autoscaling (HPA), read replica pooling, CDN edge caching, and asynchronous job processing.',
      answerExplanation: `1. Autoscaling: Configure Kubernetes Horizontal Pod Autoscaler (HPA) targeting 70% CPU/Memory utilization.
2. Read Scaling: Offload read queries to PostgreSQL read replicas using a connection pooler like PgBouncer.
3. Async Queues: Move heavy computations and background tasks to asynchronous workers via Kafka/RabbitMQ.`,
      commonMistakes: ['Over-provisioning fixed hardware instead of leveraging dynamic autoscaling', 'Sending heavy background tasks synchronously during request execution'],
      relatedConcepts: ['Scalability', 'Autoscaling', 'Read Replicas', 'Async Queues'],
    },
  ];
}

function extractQuestionsFromCmsItem(item: any): InterviewQuestionItem[] {
  const contentStr = item.body || item.content || item.description || '';
  
  // Check if content has Markdown or HTML structured questions
  if (contentStr.includes('Q1:') || contentStr.includes('Question 1') || contentStr.includes('### Question') || contentStr.includes('1. Question')) {
    const parsedQuestions: InterviewQuestionItem[] = [];
    const questionBlocks = contentStr.split(/(?:###\s*Question|Question\s*\d+:?|Q\d+:?)/i).filter((b: string) => b.trim().length > 10);
    
    questionBlocks.forEach((block: string, idx: number) => {
      const lines = block.trim().split('\n').map((l: string) => l.trim()).filter(Boolean);
      const questionText = lines[0]?.replace(/^[:\d.\-\s]+/, '') || `Scenario ${idx + 1}`;
      
      let answerExplanation = '';
      let thinkPrompt = 'Consider architectural tradeoffs, data structures, and edge cases.';
      const commonMistakes: string[] = [];
      const relatedConcepts: string[] = [item.categoryName || 'Engineering', 'Architecture'];
      
      let mode = 'explanation';
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes('think prompt:') || line.toLowerCase().includes('hint:')) {
          thinkPrompt = line.replace(/^(think prompt:|hint:)/i, '').trim();
        } else if (line.toLowerCase().includes('mistake:') || line.toLowerCase().includes('common mistakes:')) {
          mode = 'mistakes';
        } else if (mode === 'mistakes') {
          commonMistakes.push(line.replace(/^[-*•\d.]+\s*/, ''));
        } else {
          answerExplanation += line + '\n';
        }
      }
      
      parsedQuestions.push({
        id: `db-${item.id}-q${idx + 1}`,
        questionNumber: idx + 1,
        question: questionText,
        thinkPrompt: thinkPrompt || 'Analyze scalability, fault tolerance, and concurrency.',
        answerExplanation: answerExplanation.trim() || `Key concepts for ${questionText}:\n1. Evaluate system boundaries and data flow.\n2. Ensure zero single points of failure.\n3. Apply caching and database indexing.`,
        commonMistakes: commonMistakes.length > 0 ? commonMistakes : ['Neglecting bottleneck analysis under peak load'],
        relatedConcepts,
      });
    });
    
    if (parsedQuestions.length > 0) {
      return parsedQuestions;
    }
  }
  
  return generateQuestionsForTrack(item.slug || item.title || 'engineering');
}

export function InterviewPrepHub() {
  const navigate = useNavigate();
  const { trackSlug } = useParams<{ trackSlug?: string }>();

  // Live backend database API hooks - fetching both ARTICLES and COURSES from PostgreSQL
  const { data: publicArticles } = usePublicCmsList({ size: 50, type: 'ARTICLE' });
  const { data: publicCourses } = usePublicCmsList({ size: 50, type: 'COURSE' });
  const { data: backendCategories } = useCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('All');
  const [selectedRound, setSelectedRound] = useState<string>('All');
  
  const [activeTrack, setActiveTrack] = useState<InterviewCourse | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [userNotes, setUserNotes] = useState<Record<string, string>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({
    'ic-1': true,
  });

  const combinedCmsItems = useMemo(() => {
    const articles = publicArticles?.items || [];
    const courses = publicCourses?.items || [];
    return [...courses, ...articles];
  }, [publicArticles, publicCourses]);

  const dbInterviewCourses = useMemo((): InterviewCourse[] => {
    if (combinedCmsItems.length === 0) return [];
    return combinedCmsItems.map((item, idx) => ({
      id: String(item.id),
      slug: item.slug || String(item.id),
      title: item.title.includes('Track') || item.title.includes('Interview') ? item.title : `${item.title} Interview Track`,
      description: item.description || `Technical interview prep track for ${item.title}.`,
      difficulty: (item.level as any) || 'Senior',
      role: (item.categoryName as any) || 'Software Engineer',
      round: idx % 2 === 0 ? 'System Design' : 'Technical',
      estimatedHours: item.durationMinutes ? Math.ceil(item.durationMinutes / 60) : 8,
      questions: extractQuestionsFromCmsItem(item),
    }));
  }, [combinedCmsItems]);

  const allInterviewCourses = useMemo(() => {
    if (dbInterviewCourses.length > 0) {
      const dbSlugs = new Set(dbInterviewCourses.map(c => c.slug));
      const uniqueMock = mockInterviewCourses.filter(m => !dbSlugs.has(m.slug));
      return [...dbInterviewCourses, ...uniqueMock];
    }
    return mockInterviewCourses;
  }, [dbInterviewCourses]);

  const roles = useMemo(() => {
    const fetched = (backendCategories ?? []).map(c => c.name).filter(Boolean);
    if (fetched.length > 0) {
      return ['All', ...Array.from(new Set(fetched))];
    }
    return ['All', 'Backend', 'Cloud', 'DevOps', 'Security', 'SRE', 'Software Engineer'];
  }, [backendCategories]);

  const rounds = ['All', 'Coding', 'Technical', 'System Design', 'Scenario', 'Behavioral'];

  const startTrack = (track: InterviewCourse) => {
    setActiveTrack(track);
    setCurrentQuestionIdx(0);
    setRevealedAnswers({});
  };

  useEffect(() => {
    if (trackSlug) {
      const found = allInterviewCourses.find(c => c.id === trackSlug || c.slug === trackSlug);
      if (found) {
        startTrack(found);
      } else {
        const cleanTitle = trackSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const fallbackTrack: InterviewCourse = {
          id: trackSlug,
          slug: trackSlug,
          title: cleanTitle.includes('Track') || cleanTitle.includes('Prep') ? cleanTitle : `${cleanTitle} Interview Track`,
          description: `Interactive technical interview preparation track focused on ${cleanTitle}.`,
          difficulty: 'Senior',
          role: 'Software Engineer',
          round: 'System Design',
          estimatedHours: 8,
          questions: generateQuestionsForTrack(trackSlug),
        };
        startTrack(fallbackTrack);
      }
    }
  }, [trackSlug, allInterviewCourses]);

  const toggleCourseExpand = (id: string) => {
    setExpandedCourses(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleRevealAnswer = (qId: string) => {
    setRevealedAnswers(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const handleNotesChange = (qId: string, text: string) => {
    setUserNotes(prev => ({ ...prev, [qId]: text }));
  };

  const filteredCourses = useMemo(() => {
    return allInterviewCourses.filter(c => {
      const matchesSearch = searchQuery === '' ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.questions.some(q => q.question.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = selectedRole === 'All' || c.role === selectedRole;
      const matchesRound = selectedRound === 'All' || c.round === selectedRound;

      return matchesSearch && matchesRole && matchesRound;
    });
  }, [searchQuery, selectedRole, selectedRound, allInterviewCourses]);

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
                  Interview Prep Tracks
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Question-specific scenario prep & solutions</p>
              </div>
            </div>

            {/* Search Bar */}
            {!activeTrack && (
              <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
                <div className="relative w-full">
                  <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search interview prep questions & tracks..."
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

            {/* Right Action */}
            <div className="sm:w-1/4 flex justify-end">
              {activeTrack && (
                <Button variant="outline" size="sm" onClick={() => { setActiveTrack(null); navigate('/interview-prep'); }} className="rounded-xl gap-2 text-xs">
                  <X className="w-3.5 h-3.5" /> Close Track
                </Button>
              )}
            </div>
          </div>
        </div>

        {activeTrack ? (
          /* 3-Column Interactive In-Page Interview Runner */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Button variant="ghost" size="sm" onClick={() => { setActiveTrack(null); navigate('/interview-prep'); }} className="rounded-xl gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back to All Interview Tracks
              </Button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-bold bg-primary/10 text-primary border-primary/20">{activeTrack.role} Role</Badge>
                <Badge variant="outline" className="text-xs font-semibold">{activeTrack.round}</Badge>
                <Badge variant="outline" className="text-xs font-semibold capitalize">{activeTrack.difficulty}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: Question Module Selector (3 Cols) */}
              <div className="lg:col-span-3 space-y-3 bg-card border border-border rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-primary" />
                    Interview Questions
                  </span>
                  <span className="text-xs font-bold text-primary">
                    {activeTrack.questions.length} Questions
                  </span>
                </div>

                <div className="space-y-2">
                  {activeTrack.questions.map((q, qIdx) => {
                    const isCurrent = currentQuestionIdx === qIdx;
                    const isRevealed = !!revealedAnswers[q.id];

                    return (
                      <button
                        key={q.id || qIdx}
                        onClick={() => setCurrentQuestionIdx(qIdx)}
                        className={cn(
                          'w-full text-left p-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between gap-2',
                          isCurrent
                            ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                            : isRevealed
                            ? 'border-emerald-500/40 bg-emerald-500/5 text-foreground'
                            : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold',
                            isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}>
                            Q{q.questionNumber || qIdx + 1}
                          </span>
                          <span className="truncate">Question {qIdx + 1}</span>
                        </div>

                        {isRevealed && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-border">
                  <Progress value={((currentQuestionIdx + 1) / (activeTrack.questions.length || 1)) * 100} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center font-medium">
                    Question {currentQuestionIdx + 1} of {activeTrack.questions.length}
                  </p>
                </div>
              </div>

              {/* CENTER COLUMN: Main Question & Interactive Solution Runner (6 Cols) */}
              <div className="lg:col-span-6 space-y-6">
                <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
                  <div className="border-b border-border pb-4 space-y-1">
                    <h2 className="text-xl font-extrabold text-foreground">{activeTrack.title}</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">{activeTrack.description}</p>
                  </div>

                  {activeTrack.questions.length > 0 && (
                    <div className="space-y-6">
                      {/* Active Question Title */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[11px] font-bold">
                            Question {activeTrack.questions[currentQuestionIdx].questionNumber || currentQuestionIdx + 1}
                          </Badge>
                        </div>

                        <h3 className="text-lg font-extrabold text-foreground leading-snug">
                          {activeTrack.questions[currentQuestionIdx].question}
                        </h3>
                      </div>

                      {/* Architectural Prompt */}
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                        <span className="font-bold text-amber-600 dark:text-amber-400 block uppercase tracking-wider text-[11px] flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Architectural Considerations:
                        </span>
                        <p className="text-foreground/90 leading-relaxed">
                          {activeTrack.questions[currentQuestionIdx].thinkPrompt}
                        </p>
                      </div>

                      {/* Candidate Scratchpad */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <PenTool className="w-3.5 h-3.5 text-primary" />
                          Self-Practice Draft Notes
                        </label>
                        <textarea
                          placeholder="Draft your architectural approach, key components, and trade-offs before revealing the solution..."
                          value={userNotes[activeTrack.questions[currentQuestionIdx].id] || ''}
                          onChange={(e) => handleNotesChange(activeTrack.questions[currentQuestionIdx].id, e.target.value)}
                          className="w-full h-28 p-3 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                        />
                      </div>

                      {/* Reveal Solution & Trade-offs */}
                      <div className="pt-2">
                        <Button
                          onClick={() => toggleRevealAnswer(activeTrack.questions[currentQuestionIdx].id)}
                          variant={revealedAnswers[activeTrack.questions[currentQuestionIdx].id] ? "outline" : "default"}
                          size="sm"
                          className="w-full rounded-xl text-xs font-bold gap-2 h-10"
                        >
                          {revealedAnswers[activeTrack.questions[currentQuestionIdx].id] ? (
                            <>
                              <EyeOff className="w-4 h-4" /> Hide Solution & Trade-offs
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4" /> Reveal Solution & Trade-offs
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Revealed Solution Box */}
                      {revealedAnswers[activeTrack.questions[currentQuestionIdx].id] && (
                        <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 animate-in fade-in duration-150">
                          <div className="space-y-1.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Recommended Architecture & Strategy
                            </span>
                            <div className="p-3.5 rounded-xl bg-card border border-border text-xs text-foreground leading-relaxed whitespace-pre-line font-sans">
                              {activeTrack.questions[currentQuestionIdx].answerExplanation}
                            </div>
                          </div>

                          {activeTrack.questions[currentQuestionIdx].commonMistakes.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Common Interview Traps
                              </span>
                              <ul className="space-y-1 pl-4 list-disc text-xs text-muted-foreground">
                                {activeTrack.questions[currentQuestionIdx].commonMistakes.map((m, idx) => (
                                  <li key={idx}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {activeTrack.questions[currentQuestionIdx].relatedConcepts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {activeTrack.questions[currentQuestionIdx].relatedConcepts.map((concept, idx) => (
                                <Badge key={idx} variant="outline" className="text-[10px] font-medium">
                                  {concept}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Previous / Next Navigation */}
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentQuestionIdx === 0}
                          onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
                          className="rounded-xl text-xs"
                        >
                          Previous Question
                        </Button>

                        <Button
                          size="sm"
                          disabled={currentQuestionIdx === activeTrack.questions.length - 1}
                          onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                          className="rounded-xl text-xs font-bold"
                        >
                          Next Question <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHTMOST COLUMN: Related Interview Tracks & Practice Sets (3 Cols) */}
              <div className="lg:col-span-3 space-y-4">
                
                {/* Related Interview Tracks */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-primary" />
                      More Interview Tracks
                    </span>
                  </div>

                  <div className="space-y-3">
                    {allInterviewCourses.filter(t => t.id !== activeTrack.id).map(track => (
                      <div key={track.id} className="p-3 rounded-xl border border-border hover:border-primary/40 transition-all bg-card/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] font-bold">{track.role}</Badge>
                          <span className="text-[10px] text-muted-foreground font-semibold">{track.round}</span>
                        </div>
                        <h4 className="text-xs font-bold text-foreground line-clamp-1">{track.title}</h4>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                          <span>{track.questions.length} Scenarios</span>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] font-bold text-primary" onClick={() => startTrack(track)}>
                            Switch <ArrowRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct Link to Practice Tests */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-primary" />
                      Practice Assessments
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Test your knowledge with timed quizzes and instant multiple-choice assessments.
                  </p>

                  <Button size="sm" variant="outline" className="w-full text-xs font-semibold h-8 rounded-xl" onClick={() => navigate('/practice')}>
                    Go to Practice Hub <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

              </div>

            </div>
          </div>
        ) : (
          /* Main Grid Content (All Tracks Listing) */
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
                    Available Interview Tracks ({filteredCourses.length})
                  </span>
                  <Badge variant="outline" className="text-xs">
                    In-Page Interactive Interview Prep
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
                          {/* Track Card Header */}
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
                                  {course.questions.length} Scenario Questions
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-primary" />
                                  ~{course.estimatedHours} Hours Duration
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startTrack(course);
                                }}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl gap-1.5"
                              >
                                <PlayCircle className="w-4 h-4" /> Start Interview Track
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
                                  Question Breakdown & Scenarios
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {course.questions.length} Scenarios
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
                                          onClick={() => startTrack(course)}
                                          className="h-8 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl"
                                        >
                                          Practice In-Page <ArrowRight className="w-3.5 h-3.5 ml-1" />
                                        </Button>
                                      </div>

                                      {isRevealed && (
                                        <div className="pt-3 border-t border-border space-y-3 animate-in fade-in duration-150">
                                          <div className="space-y-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Solution Walk-through</span>
                                            <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground leading-relaxed whitespace-pre-line font-sans">
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

                              {/* Start Practice Track CTA */}
                              <div className="pt-2 flex items-center justify-between border-t border-border/60">
                                <span className="text-xs text-muted-foreground">
                                  Full interactive scenario breakdown with candidate draft notes & solutions.
                                </span>
                                <Button
                                  size="sm"
                                  onClick={() => startTrack(course)}
                                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold gap-1.5"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" /> Launch In-Page Prep Track
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
                    <h3 className="text-base font-bold text-foreground">No interview prep tracks found</h3>
                    <p className="text-sm text-muted-foreground">Try clearing filters or search query.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

export default InterviewPrepHub;
