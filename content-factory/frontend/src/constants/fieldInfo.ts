import type { FieldInfoData } from "../components/FieldInfoModal"

export const FIELD_INFO: Record<string, FieldInfoData> = {
  // Project Creation & Config
  projectName: {
    title: "Project Name",
    purpose: "Identifies this workspace/domain within the Content Factory ecosystem.",
    aiUsage: "Used by multi-agent supervisors to contextualize research prompts, asset tags, and output file path structures.",
    example: "Developer Learning Hub",
  },
  niche: {
    title: "Project Niche(s)",
    purpose: "Core domain topics or subject areas covered by this project.",
    aiUsage: "Guides the Opportunity Discovery Agent and Web Crawler to scope relevant trend searches, content gaps, and vector database embeddings.",
    example: "python, devops, system-design",
  },
  audience: {
    title: "Target Audience",
    purpose: "Defines the target demographic, experience level, and reader persona.",
    aiUsage: "Sets the reading level, technical depth, tone of voice, and prerequisite explanations used by the Content Writer & Editor agents.",
    example: "backend engineers, system architects",
  },
  language: {
    title: "Primary Language",
    purpose: "Language code for generated articles, titles, metadata, and localized content.",
    aiUsage: "Instructs LLM prompts and localizers to generate natural-sounding text, grammar patterns, and native phrasing in the target language.",
    example: "en (English), es (Spanish), de (German)",
  },
  country: {
    title: "Target Country / Region",
    purpose: "Optional geographic localization targeting specific regional audiences or search markets.",
    aiUsage: "Tailors web search queries, regional terminology (e.g. US vs UK spelling), currency formats, and localized trend discovery.",
    example: "US, UK, IN",
  },
  levels: {
    title: "Skill Levels Covered",
    purpose: "Target difficulty levels (beginner, intermediate, advanced) for produced content.",
    aiUsage: "Controls code complexity, mathematical explanations, background context, and step-by-step depth in generated tutorials.",
    example: "beginner, intermediate",
  },
  contentTypes: {
    title: "Content Types",
    purpose: "Formats and structural templates for generated pieces (e.g. tutorial, how-to, concept-guide, comparison).",
    aiUsage: "Selects specific Markdown outline structures, code block frequency, diagrams, and section headers in the Writer Agent pipeline.",
    example: "tutorial, how-to, conceptual-guide",
  },
  brandVoice: {
    title: "Brand Voice & Style Guide",
    purpose: "Editorial tone, stylistic guidelines, and writing constraints.",
    aiUsage: "Injected as system prompt instructions into the Writer & Critique Agents to ensure articles match your brand's unique personality and formatting rules.",
    example: "Authoritative yet conversational, use short paragraphs, include practical code examples, avoid buzzwords.",
  },
  minScore: {
    title: "Min. Opportunity Score",
    purpose: "Threshold score (0-100) for automatic opportunity approval.",
    aiUsage: "Autonomous pipeline agents automatically approve discovered topic opportunities that meet or exceed this score.",
    example: "75",
  },
  dailyLimit: {
    title: "Daily Generation Limit",
    purpose: "Maximum number of autonomous content pieces generated per day.",
    aiUsage: "Enforces rate limiting and credit safeguards on scheduled auto-generation jobs.",
    example: "5",
  },

  // Content Strategy
  contentGoals: {
    title: "Content Goals",
    purpose: "Strategic objectives for this project's content production.",
    aiUsage: "Used by the Strategy Agent to align topic discovery and call-to-action (CTA) generation with business KPIs.",
    example: "produce fact-checked high-authority articles, target zero hallucination & strict source citation",
  },
  prohibitedTopics: {
    title: "Prohibited Topics",
    purpose: "Off-limits subjects, competitors, or sensitive keywords.",
    aiUsage: "Strictly filters candidate opportunities and acts as a hard guardrail in the Quality Assurance and Moderation agents.",
    example: "unverified technical claims, deprecated APIs, unvetted code snippets",
  },
  preferredSources: {
    title: "Preferred Sources",
    purpose: "High-authority domains, publishers, or documentation sites.",
    aiUsage: "Prioritizes search results and knowledge retrieval vectors from these specific domains during the Research phase.",
    example: "docs.python.org, kubernetes.io, RFC specifications, verified RAG packs",
  },
  publishingFrequency: {
    title: "Publishing Frequency",
    purpose: "Desired content release cadence.",
    aiUsage: "Helps schedule autonomous discovery sweeps and auto-generation batches.",
    example: "3x per week (focused on quality & validation)",
  },

  // Knowledge Sources & Portals
  sourceType: {
    title: "Source Type",
    purpose: "Category of input source (URL, Crawl, Sitemap, RSS, GitHub).",
    aiUsage: "Determines which scraper or parser module is invoked to ingest raw content.",
    example: "Web page (URL), GitHub repo",
  },
  sourceUrl: {
    title: "Source URL",
    purpose: "Direct link to a documentation page, article, RSS feed, or GitHub repository.",
    aiUsage: "Ingested into the RAG (Retrieval-Augmented Generation) vector database to ground future articles with facts and code references.",
    example: "https://docs.python.org/3/library/asyncio.html",
  },
  bulkUrls: {
    title: "Bulk URLs Ingestion",
    purpose: "Batch list of web links (one per line) to ingest into the project's knowledge base.",
    aiUsage: "Queues an asynchronous background job to crawl, parse, clean, and vectorize all listed links simultaneously.",
    example: "https://site.com/doc1\nhttps://site.com/doc2",
  },
  sourceFile: {
    title: "Uploaded File Source",
    purpose: "Local document (PDF, Word, Markdown, TXT) uploaded directly into the project knowledge base.",
    aiUsage: "Parsed into raw text, chunked, and embedded into vector search so writer agents can reference internal docs.",
    example: "system_architecture_spec.pdf",
  },
  sourceFolder: {
    title: "Ingest Local Folder",
    purpose: "Path to a local directory on your machine containing documentation.",
    aiUsage: "Recursively scans for readable document formats and builds a comprehensive RAG knowledge pack for the project.",
    example: "C:\\Projects\\docs\\architecture",
  },
  portalName: {
    title: "Portal Name",
    purpose: "Label for a monitored blog, newsfeed, or documentation portal.",
    aiUsage: "Identifies recurring content feeds in summary notifications and automated discovery reports.",
    example: "AWS Architecture Blog",
  },
  portalUrl: {
    title: "Portal URL",
    purpose: "URL of a blog listing page or RSS feed.",
    aiUsage: "Periodically scanned by background workers to detect brand-new articles and extract candidate opportunities.",
    example: "https://aws.amazon.com/blogs/aws/feed/",
  },
  portalInterval: {
    title: "Portal Scan Interval",
    purpose: "Frequency (in minutes) for recurring discovery scans.",
    aiUsage: "Controls how often the automated scanner checks the portal for fresh material.",
    example: "360 (6 hours)",
  },
  bulkTopics: {
    title: "Bulk Topic Ideas",
    purpose: "Batch list of topic titles or prompt ideas (one per line).",
    aiUsage: "Evaluated by the Opportunity Discovery Agent for search demand, competition, and content gap before creating pipeline items.",
    example: "Kubernetes cost optimization\nPrompt injection defenses for LLM agents",
  },
  packTopic: {
    title: "Knowledge Pack Topic",
    purpose: "Subject title for a curated collection of ingested sources.",
    aiUsage: "Acts as a semantic key for the Research Agent when scoping vector searches for specific generation runs.",
    example: "Python asyncio internals",
  },
  packSources: {
    title: "Knowledge Pack Source IDs",
    purpose: "List of specific ingested source IDs to include in this curated pack.",
    aiUsage: "Restricts vector retrieval strictly to the specified sources when generating content associated with this pack.",
    example: "src_12345, src_67890",
  },

  // Generation Job Pipeline
  opportunity: {
    title: "Approved Opportunity",
    purpose: "The target topic and content gap chosen for generation.",
    aiUsage: "Serves as the seed concept for the Research, Planning, Writing, and Critique multi-agent workflow.",
    example: "Building resilient microservices with Go & gRPC",
  },
  difficulty: {
    title: "Content Difficulty Level",
    purpose: "Target reader technical depth for this specific generation run.",
    aiUsage: "Adjusts code sample complexity, mathematical derivations, and technical explanation depth in the Writer agent.",
    example: "intermediate",
  },
  targetLength: {
    title: "Target Word Count",
    purpose: "Desired approximate length (in words) for the completed article.",
    aiUsage: "Guides the Planner Agent in creating an appropriate number of sections and sub-topics in the article outline.",
    example: "1500",
  },
  knowledgePacks: {
    title: "Grounding Knowledge Packs",
    purpose: "Curated document bundles to enforce factual grounding for this run.",
    aiUsage: "Forces the Research Agent to retrieve facts, quotes, and code snippets exclusively from these knowledge packs.",
    example: "Python asyncio internals",
  },
  enableWebResearch: {
    title: "Live Web Research",
    purpose: "Toggles live internet browsing and search queries during content research.",
    aiUsage: "When enabled, the Research Agent queries live web search APIs (e.g. Tavily) to verify recent library versions and news.",
    example: "Enabled (Checked)",
  },

  // System Settings & Infrastructure
  geminiApiKey: {
    title: "Google Gemini API Key",
    purpose: "Secret authentication key for Google Gemini model inference.",
    aiUsage: "Powers all LLM agent reasoning, research summarization, code generation, and editorial critique across the entire factory.",
    example: "AIzaSy...",
  },
  tavilyApiKey: {
    title: "Tavily Search API Key",
    purpose: "API key for real-time web search discovery.",
    aiUsage: "Enables autonomous web research agents to discover breaking tech news, search trends, and verify technical documentation online.",
    example: "tvly-...",
  },
  plannerModel: {
    title: "Planner Agent LLM Model",
    purpose: "Model identifier used for high-level article outlining and opportunity scoring.",
    aiUsage: "Generates structured JSON outlines, section headers, and target keyphrases.",
    example: "gemini-2.5-flash",
  },
  researcherModel: {
    title: "Researcher Agent LLM Model",
    purpose: "Model identifier used for factual extraction and document synthesis.",
    aiUsage: "Extracts key facts, code snippets, and citations from ingested sources and live web search results.",
    example: "gemini-2.5-flash",
  },
  writerModel: {
    title: "Writer Agent LLM Model",
    purpose: "Model identifier used for drafting full article prose and code examples.",
    aiUsage: "Drafts comprehensive Markdown articles adhering to brand voice and technical guidelines.",
    example: "gemini-2.5-pro",
  },
  reviewerModel: {
    title: "Reviewer Agent LLM Model",
    purpose: "Model identifier used for fact-checking and editorial critique.",
    aiUsage: "Critiques drafted content for factual correctness, hallucinations, readability, and structural flow.",
    example: "gemini-2.5-pro",
  },
  monthlyBudget: {
    title: "Max Monthly AI Budget ($)",
    purpose: "Hard ceiling on monthly LLM inference spending.",
    aiUsage: "Safeguards against runaway costs by pausing autonomous generation jobs if monthly spend threshold is reached.",
    example: "50",
  },
  costPerUnit: {
    title: "Max Cost Per Article ($)",
    purpose: "Budget cap for producing a single article.",
    aiUsage: "Limits token consumption and iteration loops per generation job.",
    example: "2.00",
  },
  maxRevisions: {
    title: "Max Revision Loops",
    purpose: "Maximum critique-rewrite iteration cycles between Reviewer and Writer agents.",
    aiUsage: "Prevents infinite rewrite loops while ensuring content meets quality bars before export.",
    example: "3",
  },
  gdriveFolder: {
    title: "Google Drive Folder URL / ID",
    purpose: "Link to a shared Google Drive folder containing source documents.",
    aiUsage: "Ingested by background workers to sync Google Docs, PDFs, and text files directly into the project vector store.",
    example: "https://drive.google.com/drive/folders/1a2b3c...",
  },
  gdriveProjectId: {
    title: "Target Ingestion Project ID",
    purpose: "Selected Content Factory project that receives imported Google Drive files.",
    aiUsage: "Associates synced documents with a specific project's RAG knowledge graph.",
    example: "proj_12345",
  },
}
