// Shared types mirroring the backend data model / API contract described in
// docs/architecture/IMPLEMENTATION_SPECIFICATION.md (sections 2 and 6).
// The backend is being built in parallel, so every field beyond the primary
// key/name is treated as optional/nullable wherever the spec doesn't
// guarantee it -- pages must render sensibly when values are missing.

export type SourceType =
  | "pdf"
  | "docx"
  | "markdown"
  | "txt"
  | "url"
  | "website"
  | "sitemap"
  | "rss"
  | "github"

export type SourceStatus = "PENDING" | "FETCHED" | "EXTRACTED" | "FAILED"

export type DiscoveryMethod = "manual" | "web_search" | "portal_scrape"

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED"

export type OpportunityStatus = "DISCOVERED" | "APPROVED" | "REJECTED"

export type ContentStatus = "draft" | "exported"

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED"

export interface Project {
  id: string
  name: string
  niche: string[]
  audience: string[]
  language: string
  country?: string | null
  levels: string[]
  content_types: string[]
  brand_voice?: string | null
  autonomy_enabled: boolean
  min_opportunity_score: number
  daily_limit: number
  require_human_approval: boolean
  created_at?: string
  updated_at?: string
}

export interface ProjectCreatePayload {
  name: string
  niche: string[]
  audience: string[]
  language: string
  country?: string
  levels: string[]
  content_types: string[]
}

export interface ProjectStrategy {
  project_id: string
  content_goals: string[]
  prohibited_topics: string[]
  preferred_sources: string[]
  publishing_frequency?: string | null
  updated_at?: string
}

export interface ProjectStrategyPayload {
  content_goals: string[]
  prohibited_topics: string[]
  preferred_sources: string[]
  publishing_frequency?: string
}

export interface ProjectSettingsPayload {
  name: string
  niche: string[]
  audience: string[]
  language: string
  country?: string
  levels: string[]
  content_types: string[]
  brand_voice?: string
  autonomy_enabled: boolean
  min_opportunity_score: number
  daily_limit: number
  require_human_approval: boolean
}

export interface Source {
  id: string
  project_id: string
  source_type: SourceType
  title?: string | null
  author?: string | null
  publisher?: string | null
  url?: string | null
  published_at?: string | null
  ingested_at?: string
  license_note?: string | null
  status: SourceStatus
  error?: string | null
  discovery_method: DiscoveryMethod
  review_status: ReviewStatus
  discovered_snippet?: string | null
  search_query?: string | null
  reviewed_at?: string | null
}

export interface SourceCreatePayload {
  project_id: string
  source_type: SourceType
  url: string
}

export interface SourceFolderCreatePayload {
  project_id: string
  folder_path: string
}

export type PortalType = "listing" | "rss"

export interface Portal {
  id: string
  project_id: string
  name: string
  url: string
  portal_type: PortalType
  link_selector?: string | null
  scan_interval_minutes: number
  is_active: boolean
  last_scanned_at?: string | null
  last_scan_status?: "success" | "failed" | null
  last_scan_new_count?: number | null
  created_at?: string
}

export interface PortalCreatePayload {
  project_id: string
  name: string
  url: string
  portal_type: PortalType
  link_selector?: string
  scan_interval_minutes: number
}

export interface PortalUpdatePayload {
  name?: string
  url?: string
  portal_type?: PortalType
  link_selector?: string
  scan_interval_minutes?: number
  is_active?: boolean
}

export interface KnowledgePack {
  id: string
  project_id: string
  topic: string
  description?: string | null
  source_ids: string[]
  created_at?: string
  refreshed_at?: string | null
}

export interface KnowledgePackCreatePayload {
  project_id: string
  topic: string
  source_ids: string[]
  description?: string
}

export interface Opportunity {
  id: string
  project_id: string
  topic: string
  score: number
  demand?: string | null
  trend?: string | null
  competition?: string | null
  content_gap?: string | null
  audience?: string | null
  recommended_content_type?: string | null
  reason?: string | null
  brief?: string | null
  references?: string[] | null
  reference_source?: string | null
  status: OpportunityStatus
  created_at?: string
}

export interface GenerationJobPayload {
  project_id: string
  opportunity_id: string
  content_type: string
  knowledge_pack_ids: string[]
  enable_web_research: boolean
  target_length?: number
  audience?: string
  difficulty?: string
  // Operator-reviewed CourseOutline from a prior
  // POST /api/content/course-outline call. Only meaningful when
  // content_type === "course" -- see backend/schemas/course.py.
  course_outline?: CourseOutline
}

// Mirrors backend/schemas/course.py -- the planning-time structure for
// first-class course content (each lesson carries a `summary` brief instead
// of a written `markdown_body`).
export interface CourseOutlineLesson {
  title: string
  summary: string
  sort_order: number
}

export interface CourseOutlineSection {
  title: string
  sort_order: number
  lessons: CourseOutlineLesson[]
}

export interface CourseOutline {
  sections: CourseOutlineSection[]
}

export interface GenerationJobCreated {
  job_id: string
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  current_node?: string | null
  error?: string | null
  cost_estimate?: number | null
}

export interface QualityReport {
  id?: string
  content_version_id?: string
  factuality_score?: number | null
  citation_score?: number | null
  learning_quality_score?: number | null
  originality_score?: number | null
  readability_score?: number | null
  seo_score?: number | null
  geo_score?: number | null
  passed?: boolean
  issues?: string[]
  created_at?: string
}

export interface ContentItem {
  id: string
  project_id: string
  content_type: string
  title: string
  slug: string
  summary?: string | null
  audience?: string | null
  difficulty?: string | null
  status: ContentStatus
  current_version: number
  generated_at?: string | null
  created_at?: string
}

export type ResourceLinkSource = "user_added" | "carried_from_opportunity"

export interface ResourceLink {
  url: string
  label?: string | null
  note?: string | null
  source: string
}

export interface ContentItemDetail extends ContentItem {
  body_markdown?: string | null
  body_json?: Record<string, unknown> | null
  course_outline?: CourseOutline | null
  quality_report?: QualityReport | null
  resources?: ResourceLink[] | null
}

export interface SystemSettingField {
  value: string | number | boolean
  source: "override" | "default"
}

export interface SystemSettings {
  gemini_api_key: SystemSettingField
  gemini_model_planner: SystemSettingField
  gemini_model_researcher: SystemSettingField
  gemini_model_writer: SystemSettingField
  gemini_model_reviewer: SystemSettingField
  gemini_base_url: SystemSettingField
  embedding_model: SystemSettingField
  gcs_bucket: SystemSettingField
  max_monthly_ai_budget: SystemSettingField
  max_cost_per_content_unit: SystemSettingField
  max_revisions: SystemSettingField
  source_max_pages: SystemSettingField
  source_max_depth: SystemSettingField
  mock_mode: SystemSettingField
  ggcms_base_url: SystemSettingField
  factory_sync_secret: SystemSettingField
  tavily_api_key: SystemSettingField
  web_search_max_results: SystemSettingField
}

export interface SystemSettingsResponse {
  settings: SystemSettings
}

export interface SystemSettingsUpdateResponse {
  settings: SystemSettings
  restart_required: boolean
}

export interface SystemSettingsPayload {
  gemini_api_key?: string
  gemini_model_planner?: string
  gemini_model_researcher?: string
  gemini_model_writer?: string
  gemini_model_reviewer?: string
  gemini_base_url?: string
  embedding_model?: string
  gcs_bucket?: string
  max_monthly_ai_budget?: number
  max_cost_per_content_unit?: number
  max_revisions?: number
  source_max_pages?: number
  source_max_depth?: number
  mock_mode?: boolean
  ggcms_base_url?: string
  factory_sync_secret?: string
  tavily_api_key?: string
  web_search_max_results?: number
}

export interface AnalyticsSummary {
  content_generated?: number
  pending_jobs?: number
  open_opportunities?: number
  failed_jobs?: number
  avg_quality_score?: number | null
  knowledge_sources?: number
}

// The eight pipeline stages surfaced to the operator during generation,
// mapped from backend/workflows/content_pipeline.py node names (spec section 5).
export const PIPELINE_STAGES: { key: string; label: string; nodes: string[] }[] = [
  { key: "strategy", label: "Strategy", nodes: ["load_strategy"] },
  { key: "opportunity", label: "Opportunity", nodes: ["discover_opportunities", "rank_opportunities", "select_topic"] },
  { key: "research", label: "Research", nodes: ["research_web", "build_evidence_pack"] },
  { key: "knowledge", label: "Knowledge retrieval", nodes: ["retrieve_knowledge"] },
  { key: "learning_design", label: "Learning design", nodes: ["design_learning_structure", "create_content_plan"] },
  { key: "writing", label: "Writing", nodes: ["generate_draft", "revise"] },
  { key: "quality", label: "Quality", nodes: ["fact_check", "citation_check", "learning_quality_check", "seo_geo_check"] },
  { key: "export", label: "Export", nodes: ["finalize", "export"] },
]
