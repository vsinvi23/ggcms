import apiClient from '../client';
import {
  AiContentType, AiDifficulty, AiDraft, AiDraftKind, AiDraftStatus, AiModerationItem, AiModerationStatus,
  AiQualityReport, AiQuizDraft, AiSeoDraft, AiSettingsUpdate, AiSettingsView, AiStatus, AiSummaryDraft,
  AiTagSuggestions, AiUsageReport, AiLevel, StudyPlan, TutorAnswer, TutorAskRequest, TutorConversation, TutorMessage,
} from '../types';

const BASE = '/ai';

type Raw = Record<string, unknown>;

// The backend serialises some entities without json tags (PascalCase); accept either casing.
const pick = (o: Raw, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const unwrap = <T>(data: unknown): T => ((data as { data?: T })?.data ?? data) as T;

const parseJson = (v: unknown): Raw => {
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? (parsed as Raw) : {};
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' ? (v as Raw) : {};
};

export const toDraft = (r: Raw): AiDraft => ({
  id: String(pick(r, 'id', 'ID') ?? ''),
  kind: pick(r, 'kind', 'Kind') as AiDraftKind,
  payload: parseJson(pick(r, 'payload', 'Payload')),
  status: (pick(r, 'status', 'Status') ?? 'draft') as AiDraftStatus,
  createdAt: String(pick(r, 'createdAt', 'CreatedAt') ?? ''),
});

const toConversation = (r: Raw): TutorConversation => ({
  id: String(pick(r, 'id', 'ID') ?? ''),
  title: pick(r, 'title', 'Title') as string | undefined,
  contentType: pick(r, 'scopeType', 'ScopeType') as AiContentType | undefined,
  contentId: pick(r, 'scopeId', 'ScopeID') as number | undefined,
  createdAt: pick(r, 'createdAt', 'CreatedAt') as string | undefined,
  updatedAt: pick(r, 'updatedAt', 'UpdatedAt') as string | undefined,
});

const toModeration = (r: Raw): AiModerationItem => {
  const reasons = pick(r, 'reasons', 'Reasons');
  let list: string[] = [];
  if (Array.isArray(reasons)) list = reasons as string[];
  else if (typeof reasons === 'string') {
    try {
      const p: unknown = JSON.parse(reasons);
      if (Array.isArray(p)) list = p as string[];
    } catch {
      list = [];
    }
  }
  return {
    id: Number(pick(r, 'id', 'ID')),
    commentId: String(pick(r, 'commentId', 'CommentID') ?? ''),
    contentType: String(pick(r, 'contentType', 'ContentType') ?? ''),
    contentId: String(pick(r, 'contentId', 'ContentID') ?? ''),
    authorId: Number(pick(r, 'authorId', 'AuthorID') ?? 0),
    excerpt: String(pick(r, 'excerpt', 'Excerpt') ?? ''),
    reasons: list,
    source: pick(r, 'source', 'Source') as AiModerationItem['source'],
    status: pick(r, 'status', 'Status') as AiModerationStatus,
    createdAt: String(pick(r, 'createdAt', 'CreatedAt') ?? ''),
  };
};

export const aiService = {
  async getStatus(): Promise<AiStatus> {
    const res = await apiClient.get(`${BASE}/status`);
    return unwrap<AiStatus>(res.data);
  },

  // ── Editorial ──────────────────────────────────────────────────────────────
  async suggestTags(contentType: AiContentType, contentId: number): Promise<AiTagSuggestions> {
    const res = await apiClient.post(`${BASE}/tags/suggest`, { contentType, contentId });
    const d = unwrap<Partial<AiTagSuggestions>>(res.data);
    return { topics: d.topics ?? [], categories: d.categories ?? [], tags: d.tags ?? [], source: d.source ?? 'heuristic', note: d.note };
  },
  async generateSummary(contentType: AiContentType, contentId: number): Promise<AiSummaryDraft> {
    const res = await apiClient.post(`${BASE}/summary`, { contentType, contentId });
    return unwrap<AiSummaryDraft>(res.data);
  },
  async generateSeo(contentType: AiContentType, contentId: number): Promise<AiSeoDraft> {
    const res = await apiClient.post(`${BASE}/seo`, { contentType, contentId });
    return unwrap<AiSeoDraft>(res.data);
  },
  async qualityCheck(contentType: AiContentType, contentId: number): Promise<AiQualityReport> {
    const res = await apiClient.post(`${BASE}/quality-check`, { contentType, contentId });
    const d = unwrap<AiQualityReport>(res.data);
    return { ...d, issues: d.issues ?? [] };
  },
  async generateQuiz(contentType: AiContentType, contentId: number, count: number, difficulty: AiDifficulty): Promise<AiQuizDraft> {
    const res = await apiClient.post(`${BASE}/quiz/generate`, { contentType, contentId, count, difficulty });
    return unwrap<AiQuizDraft>(res.data);
  },
  async listDrafts(contentType: AiContentType, contentId: number, kind?: AiDraftKind): Promise<AiDraft[]> {
    const res = await apiClient.get(`${BASE}/drafts`, { params: { contentType, contentId, ...(kind ? { kind } : {}) } });
    return (unwrap<Raw[]>(res.data) ?? []).map(toDraft);
  },
  async resolveDraft(id: string, accept: boolean): Promise<AiDraft> {
    const res = await apiClient.post(`${BASE}/drafts/${encodeURIComponent(id)}/${accept ? 'accept' : 'reject'}`);
    return toDraft(unwrap<Raw>(res.data));
  },

  // ── Learner ────────────────────────────────────────────────────────────────
  async ask(req: TutorAskRequest): Promise<TutorAnswer> {
    const body = {
      question: req.question,
      ...(req.conversationId ? { conversationId: req.conversationId } : {}),
      ...(req.contentType === 'course' ? { courseId: req.contentId } : { contentId: req.contentId, contentType: req.contentType }),
    };
    const res = await apiClient.post(`${BASE}/tutor/ask`, body);
    const d = unwrap<TutorAnswer>(res.data);
    return { ...d, citations: d.citations ?? [] };
  },
  async listConversations(): Promise<TutorConversation[]> {
    const res = await apiClient.get(`${BASE}/tutor/conversations`);
    return (unwrap<Raw[]>(res.data) ?? []).map(toConversation);
  },
  async getConversation(id: string): Promise<{ conversation: TutorConversation; messages: TutorMessage[] }> {
    const res = await apiClient.get(`${BASE}/tutor/conversations/${encodeURIComponent(id)}`);
    const d = unwrap<{ conversation: Raw; messages: TutorMessage[] }>(res.data);
    return { conversation: toConversation(d.conversation ?? {}), messages: d.messages ?? [] };
  },
  async deleteConversation(id: string): Promise<void> {
    await apiClient.delete(`${BASE}/tutor/conversations/${encodeURIComponent(id)}`);
  },
  async sendFeedback(messageId: number, rating: 1 | -1, comment?: string): Promise<void> {
    await apiClient.post(`${BASE}/tutor/messages/${messageId}/feedback`, { rating, ...(comment ? { comment } : {}) });
  },
  async studyPlan(goals: string, level: AiLevel): Promise<StudyPlan> {
    const res = await apiClient.post(`${BASE}/study-plan`, { goals, level });
    const d = unwrap<StudyPlan>(res.data);
    return { ...d, items: d.items ?? [] };
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  async getSettings(): Promise<AiSettingsView> {
    const res = await apiClient.get(`${BASE}/settings`);
    return unwrap<AiSettingsView>(res.data);
  },
  async updateSettings(settings: AiSettingsUpdate): Promise<AiSettingsView> {
    const res = await apiClient.put(`${BASE}/settings`, { settings });
    return unwrap<AiSettingsView>(res.data);
  },
  async getUsage(from?: string, to?: string): Promise<AiUsageReport> {
    const res = await apiClient.get(`${BASE}/usage`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } });
    const d = unwrap<AiUsageReport>(res.data);
    return { ...d, byTask: d.byTask ?? [], byUser: d.byUser ?? [], byDay: d.byDay ?? [] };
  },
  async getModeration(status: AiModerationStatus, page = 0, size = 20): Promise<{ items: AiModerationItem[]; total: number }> {
    const res = await apiClient.get(`${BASE}/moderation`, { params: { status, page, size } });
    const body = res.data as { data?: Raw[]; meta?: { pagination?: { total?: number } } };
    return { items: (body.data ?? []).map(toModeration), total: body.meta?.pagination?.total ?? 0 };
  },
  async resolveModeration(id: number, approve: boolean): Promise<void> {
    await apiClient.post(`${BASE}/moderation/${id}/${approve ? 'approve' : 'reject'}`);
  },
  async reindex(): Promise<number> {
    const res = await apiClient.post(`${BASE}/admin/reindex`);
    return unwrap<{ updated: number }>(res.data).updated ?? 0;
  },
};
