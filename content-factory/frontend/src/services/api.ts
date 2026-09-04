// Small typed fetch-based API client for the AI Content Factory backend.
//
// Deliberately dependency-free (no axios/react-query) so the console builds
// with the packages already in package.json. Every call can fail -- the
// backend is being built by a parallel workstream and may not be running, or
// a given route may not exist yet -- so every function throws a normalized
// ApiError that callers turn into a friendly inline/toast message instead of
// letting the page crash.

import type {
  AnalyticsSummary,
  ContentItem,
  ContentItemDetail,
  ContentStatus,
  CourseOutline,
  GenerationJobCreated,
  GenerationJobPayload,
  JobStatusResponse,
  KnowledgePack,
  KnowledgePackCreatePayload,
  Opportunity,
  OpportunityStatus,
  Project,
  ProjectCreatePayload,
  ProjectSettingsPayload,
  ProjectStrategy,
  ProjectStrategyPayload,
  ReviewStatus,
  Source,
  SourceCreatePayload,
  SourceType,
  SystemSettingsPayload,
  SystemSettingsResponse,
  SystemSettingsUpdateResponse,
} from "./types"

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "")

export class ApiError extends Error {
  status: number
  /** true when the request never reached the server (offline / CORS / DNS) */
  isNetworkError: boolean

  constructor(message: string, status: number, isNetworkError = false) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.isNetworkError = isNetworkError
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") || ""
  try {
    if (contentType.includes("application/json")) {
      const body: unknown = await res.json()
      if (body && typeof body === "object" && "detail" in body) {
        const detail = (body as { detail: unknown }).detail
        if (typeof detail === "string") return detail
        if (Array.isArray(detail)) return detail.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join("; ")
        return JSON.stringify(detail)
      }
      return JSON.stringify(body)
    }
    const text = await res.text()
    return text || res.statusText
  } catch {
    return res.statusText || `Request failed with status ${res.status}`
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  formData?: FormData
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, formData } = options
  const url = buildUrl(path, query)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: formData ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
      true,
    )
  }

  if (!res.ok) {
    const message = await parseErrorBody(res)
    throw new ApiError(message || `Request failed with status ${res.status}`, res.status)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError("The server returned a response that wasn't valid JSON.", res.status)
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects")
}

export function getProject(projectId: string): Promise<Project> {
  return request<Project>(`/api/projects/${encodeURIComponent(projectId)}`)
}

export function createProject(payload: ProjectCreatePayload): Promise<Project> {
  return request<Project>("/api/projects", { method: "POST", body: payload })
}

/** Not explicitly documented in the API contract yet; kept best-effort so the
 * Settings page can save autonomy/limits once the backend adds it. */
export function updateProjectSettings(projectId: string, payload: ProjectSettingsPayload): Promise<Project> {
  return request<Project>(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: payload })
}

export function updateProjectStrategy(projectId: string, payload: ProjectStrategyPayload): Promise<ProjectStrategy> {
  return request<ProjectStrategy>(`/api/projects/${encodeURIComponent(projectId)}/strategy`, {
    method: "PUT",
    body: payload,
  })
}

export function getProjectStrategy(projectId: string): Promise<ProjectStrategy> {
  return request<ProjectStrategy>(`/api/projects/${encodeURIComponent(projectId)}/strategy`)
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export function listSources(projectId: string, reviewStatus?: ReviewStatus): Promise<Source[]> {
  return request<Source[]>("/api/sources", { query: { project_id: projectId, review_status: reviewStatus } })
}

export function createSource(payload: SourceCreatePayload): Promise<Source> {
  return request<Source>("/api/sources", { method: "POST", body: payload })
}

export function createSourcesBulk(projectId: string, urls: string[], sourceType: SourceType = "url"): Promise<GenerationJobCreated> {
  return request<GenerationJobCreated>("/api/sources/bulk", {
    method: "POST",
    body: { project_id: projectId, urls, source_type: sourceType },
  })
}

export function approveSource(id: string): Promise<{ id: string; review_status: ReviewStatus }> {
  return request(`/api/sources/${encodeURIComponent(id)}/approve`, { method: "POST" })
}

export function rejectSource(id: string): Promise<{ id: string; review_status: ReviewStatus }> {
  return request(`/api/sources/${encodeURIComponent(id)}/reject`, { method: "POST" })
}

export function uploadSource(projectId: string, file: File): Promise<{ source_id: string; status: string }> {
  const formData = new FormData()
  formData.append("project_id", projectId)
  formData.append("file", file)
  return request<{ source_id: string; status: string }>("/api/sources/upload", { method: "POST", formData })
}

// ---------------------------------------------------------------------------
// Knowledge packs
// ---------------------------------------------------------------------------

export function listKnowledgePacks(projectId: string): Promise<KnowledgePack[]> {
  return request<KnowledgePack[]>("/api/knowledge-packs", { query: { project_id: projectId } })
}

export function createKnowledgePack(payload: KnowledgePackCreatePayload): Promise<KnowledgePack> {
  return request<KnowledgePack>("/api/knowledge-packs", { method: "POST", body: payload })
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export function listOpportunities(projectId: string, status?: OpportunityStatus): Promise<Opportunity[]> {
  return request<Opportunity[]>("/api/opportunities", { query: { project_id: projectId, status } })
}

export function approveOpportunity(id: string): Promise<{ id: string; status: OpportunityStatus }> {
  return request(`/api/opportunities/${encodeURIComponent(id)}/approve`, { method: "POST" })
}

export function rejectOpportunity(id: string): Promise<{ id: string; status: OpportunityStatus }> {
  return request(`/api/opportunities/${encodeURIComponent(id)}/reject`, { method: "POST" })
}

export function discoverOpportunities(projectId: string, topics?: string[]): Promise<Opportunity[]> {
  return request<Opportunity[]>("/api/opportunities/discover", {
    method: "POST",
    body: { project_id: projectId, topics },
  })
}

export function discoverOpportunitiesBulk(projectId: string, topics: string[]): Promise<GenerationJobCreated> {
  return request<GenerationJobCreated>("/api/opportunities/discover/bulk", {
    method: "POST",
    body: { project_id: projectId, topics },
  })
}

// ---------------------------------------------------------------------------
// Generation jobs
// ---------------------------------------------------------------------------

export function createGenerationJob(payload: GenerationJobPayload): Promise<GenerationJobCreated> {
  return request<GenerationJobCreated>("/api/generate", { method: "POST", body: payload })
}

export function getJobStatus(jobId: string, projectId: string): Promise<JobStatusResponse> {
  // Stage 3 (file-storage rewrite) moved jobs.yaml under data/<project_id>/,
  // so this route now requires project_id as a query param -- see
  // backend/api/routers/jobs.py::get_job.
  return request<JobStatusResponse>(`/api/jobs/${encodeURIComponent(jobId)}`, { query: { project_id: projectId } })
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** Preview/plan step for course content -- no ContentItem is created here.
 * Pass the returned outline back as `course_outline` on createGenerationJob. */
export function planCourseOutline(projectId: string, topic: string, details?: string): Promise<CourseOutline> {
  return request<CourseOutline>("/api/content/course-outline", {
    method: "POST",
    body: { project_id: projectId, topic, details: details || "" },
  })
}

export function listContent(projectId: string, status?: ContentStatus): Promise<ContentItem[]> {
  return request<ContentItem[]>("/api/content", { query: { project_id: projectId, status } })
}

export function getContentDetail(id: string): Promise<ContentItemDetail> {
  return request<ContentItemDetail>(`/api/content/${encodeURIComponent(id)}`)
}

export function refreshContent(id: string): Promise<ContentItem> {
  return request<ContentItem>(`/api/content/${encodeURIComponent(id)}/refresh`, { method: "POST" })
}

export function exportContent(id: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/content/${encodeURIComponent(id)}/export`, { method: "POST" })
}

export function addContentResource(
  id: string,
  payload: { url: string; label?: string; note?: string },
): Promise<ContentItemDetail> {
  return request<ContentItemDetail>(`/api/content/${encodeURIComponent(id)}/resources`, {
    method: "POST",
    body: payload,
  })
}

export function removeContentResource(id: string, index: number): Promise<ContentItemDetail> {
  return request<ContentItemDetail>(`/api/content/${encodeURIComponent(id)}/resources/${index}`, {
    method: "DELETE",
  })
}

// ---------------------------------------------------------------------------
// System settings (global, not per-project)
// ---------------------------------------------------------------------------

export function getSystemSettings(): Promise<SystemSettingsResponse> {
  return request<SystemSettingsResponse>("/api/system-settings")
}

export function updateSystemSettings(payload: SystemSettingsPayload): Promise<SystemSettingsUpdateResponse> {
  return request<SystemSettingsUpdateResponse>("/api/system-settings", { method: "PUT", body: payload })
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export function getAnalytics(projectId: string): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>("/api/analytics", { query: { project_id: projectId } })
}
