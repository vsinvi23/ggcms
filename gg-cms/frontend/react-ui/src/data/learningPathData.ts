export interface CuratedLearningPath {
  id: number | string;
  slug: string;
  kind: string;
  title: string;
  description: string;
  estimatedHours: number;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  skillsGained: string[];
  modules: {
    id: number;
    title: string;
    description: string;
    durationMinutes: number;
    lessonCount: number;
  }[];
}

export const CURATED_LEARNING_PATHS: CuratedLearningPath[] = [
  {
    id: 1,
    slug: 'software-engineering',
    kind: 'STRUCTURED_PATH',
    title: 'Full-Stack Software Engineering Track',
    description: 'Master modern frontend development, backend microservices in Go, database modeling in PostgreSQL, and cloud deployments.',
    estimatedHours: 48,
    level: 'Intermediate',
    skillsGained: [
      'Build scalable web apps with React & TypeScript',
      'Design high-performance REST & GraphQL APIs in Go',
      'Database optimization, indexing, and ORM usage',
      'Containerization with Docker & Cloud Run deployments',
    ],
    modules: [
      { id: 101, title: 'TypeScript & React Architecture', description: 'Advanced component patterns, state management, and type safety.', durationMinutes: 240, lessonCount: 8 },
      { id: 102, title: 'Go Microservices & API Design', description: 'Concurrent backend services, gRPC, and REST API standards.', durationMinutes: 300, lessonCount: 10 },
      { id: 103, title: 'PostgreSQL & Data Modeling', description: 'Relational database schema design, indexing, and query performance.', durationMinutes: 180, lessonCount: 6 },
      { id: 104, title: 'Containerization & Cloud Deployments', description: 'Docker packaging, Cloud Run deployment, and CI/CD pipelines.', durationMinutes: 200, lessonCount: 7 },
    ],
  },
  {
    id: 2,
    slug: 'cybersecurity-identity',
    kind: 'SECURITY_TRACK',
    title: 'Cybersecurity & Identity Architecture',
    description: 'Deep dive into OAuth 2.0, OpenID Connect (OIDC), PKI & Cryptography, Web Application Pentesting, and Zero Trust access control.',
    estimatedHours: 42,
    level: 'Advanced',
    skillsGained: [
      'Implement OAuth 2.0 & OIDC token verification',
      'Configure PKI, certificates, and TLS security',
      'Conduct web application security audits & penetration tests',
      'Design Zero Trust identity & access policies',
    ],
    modules: [
      { id: 201, title: 'OAuth 2.0 & OpenID Connect Fundamentals', description: 'Authorization codes, JWT bearer tokens, and identity assertion.', durationMinutes: 240, lessonCount: 8 },
      { id: 202, title: 'PKI & Applied Cryptography', description: 'Public key infrastructure, TLS handshake, and asymmetric encryption.', durationMinutes: 210, lessonCount: 7 },
      { id: 203, title: 'Web App Pentesting & OWASP Top 10', description: 'Exploiting and remediating SQL injection, XSS, CSRF, and broken auth.', durationMinutes: 300, lessonCount: 12 },
      { id: 204, title: 'Zero Trust Security Architecture', description: 'Least-privilege access model, IAM roles, and cloud network policies.', durationMinutes: 180, lessonCount: 6 },
    ],
  },
  {
    id: 3,
    slug: 'cloud-devops',
    kind: 'STRUCTURED_PATH',
    title: 'Cloud Infrastructure & DevOps Mastery',
    description: 'Learn container orchestration with Kubernetes, Cloud Infrastructure on GCP & AWS, CI/CD automation, and Observability.',
    estimatedHours: 52,
    level: 'Intermediate',
    skillsGained: [
      'Package microservices into optimized Docker containers',
      'Deploy and manage Kubernetes clusters & Helm charts',
      'Automate infrastructure using Terraform & GCP Cloud Build',
      'Set up Prometheus & Grafana monitoring dashboards',
    ],
    modules: [
      { id: 301, title: 'Docker Containers & Best Practices', description: 'Multi-stage builds, security hardening, and image optimization.', durationMinutes: 180, lessonCount: 6 },
      { id: 302, title: 'Kubernetes Cluster Management', description: 'Pods, Deployments, Ingress controllers, and Service meshes.', durationMinutes: 320, lessonCount: 11 },
      { id: 303, title: 'Infrastructure as Code with Terraform', description: 'Provisioning VPCs, Cloud Run, and IAM on GCP & AWS.', durationMinutes: 240, lessonCount: 8 },
      { id: 304, title: 'Observability: Metrics, Logs & Traces', description: 'Prometheus, Grafana, and OpenTelemetry instrumentation.', durationMinutes: 200, lessonCount: 7 },
    ],
  },
  {
    id: 4,
    slug: 'system-design',
    kind: 'INTERVIEW_PREP',
    title: 'System Design & Technical Interview Mastery',
    description: 'Master high-scale system design, caching strategies, load balancing, database sharding, and crack senior tech interviews.',
    estimatedHours: 36,
    level: 'Advanced',
    skillsGained: [
      'Estimate scale, throughput, and storage requirements',
      'Design distributed rate limiters, URL shorteners & news feeds',
      'Implement Redis caching, message queues (Kafka), and CDC',
      'Structure technical interview responses using first principles',
    ],
    modules: [
      { id: 401, title: 'System Design First Principles', description: 'Latency vs throughput, CAP theorem, and trade-off analysis.', durationMinutes: 180, lessonCount: 6 },
      { id: 402, title: 'Scalable Data Architecture', description: 'Read/write replication, sharding, consistent hashing, and Redis.', durationMinutes: 240, lessonCount: 8 },
      { id: 403, title: 'Event-Driven Systems & Queues', description: 'Kafka topic partitioning, idempotency, and pub/sub patterns.', durationMinutes: 210, lessonCount: 7 },
      { id: 404, title: 'Real-world System Breakdown', description: 'Designing WhatsApp, Uber backend, and Rate Limiter.', durationMinutes: 270, lessonCount: 9 },
    ],
  },
  {
    id: 5,
    slug: 'ai-ml-engineering',
    kind: 'STRUCTURED_PATH',
    title: 'AI & Machine Learning Engineering Track',
    description: 'Build and deploy AI applications using Large Language Models (LLMs), Vector Databases, RAG architectures, and AI Agents.',
    estimatedHours: 40,
    level: 'Intermediate',
    skillsGained: [
      'Prompt engineering & LLM API integration',
      'Build Retrieval-Augmented Generation (RAG) pipelines',
      'Vector indexing using Pinecone, Pgvector & Qdrant',
      'Deploy autonomous AI agents with tool-calling',
    ],
    modules: [
      { id: 501, title: 'LLM Foundations & API Integration', description: 'Tokenization, context windows, and Gemini/GPT model APIs.', durationMinutes: 180, lessonCount: 6 },
      { id: 502, title: 'Vector DBs & RAG Architecture', description: 'Embeddings generation, chunking strategies, and semantic search.', durationMinutes: 240, lessonCount: 8 },
      { id: 503, title: 'Building Autonomous AI Agents', description: 'ReAct agent loops, tool declaration, and multi-agent coordination.', durationMinutes: 240, lessonCount: 8 },
    ],
  },
  {
    id: 6,
    slug: 'api-security',
    kind: 'SECURITY_TRACK',
    title: 'API Security & OWASP Top 10 Deep Dive',
    description: 'Identify, exploit, and patch API vulnerabilities based on OWASP API Security Top 10 guidelines.',
    estimatedHours: 30,
    level: 'Intermediate',
    skillsGained: [
      'Detect Broken Object Level Authorization (BOLA/IDOR)',
      'Secure JWT signing algorithms & token refresh flows',
      'Implement API rate limiting, IP throttling, and CORS',
      'Automated API security testing in CI/CD pipelines',
    ],
    modules: [
      { id: 601, title: 'BOLA & Authorization Vulnerabilities', description: 'Identifying object-level permission flaws and securing ID references.', durationMinutes: 200, lessonCount: 6 },
      { id: 602, title: 'JWT Security & Key Management', description: 'Mitigating algorithm switching, weak secrets, and token leakage.', durationMinutes: 180, lessonCount: 5 },
      { id: 603, title: 'API Defense & Gateway Security', description: 'Rate limiting, payload validation, and WAF rules.', durationMinutes: 210, lessonCount: 7 },
    ],
  },
];
