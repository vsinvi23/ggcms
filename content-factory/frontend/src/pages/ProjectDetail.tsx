import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  BookOpen,
  Check,
  Compass,
  Layers,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { useToast } from "../components/Toast"
import { useAppContext } from "../context/AppContext"
import { useAsync } from "../hooks/useAsync"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InlineError,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  TagInput,
  Textarea,
} from "../components/ui"
import type { Page } from "../App"
import type {
  Opportunity,
  OpportunityStatus,
  Project,
  ProjectSettingsPayload,
  ProjectStrategyPayload,
  Source,
  SourceCreatePayload,
  SourceType,
} from "../services/types"

const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced"]
const URL_SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "url", label: "Web page (URL)" },
  { value: "website", label: "Website (crawl)" },
  { value: "sitemap", label: "Sitemap" },
  { value: "rss", label: "RSS feed" },
  { value: "github", label: "GitHub repo" },
]

type Tab = "overview" | "config" | "strategy" | "sources" | "opportunities"

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "config", label: "Config" },
  { value: "strategy", label: "Strategy" },
  { value: "sources", label: "Sources" },
  { value: "opportunities", label: "Opportunities" },
]

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ project }: { project: Project }) {
  return (
    <Card>
      <CardHeader title="Overview" subtitle="Snapshot of this project's setup." />
      <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Niche</h4>
          <div className="flex flex-wrap gap-1.5">
            {project.niche.length === 0 ? (
              <span className="text-sm text-zinc-600">No niche set</span>
            ) : (
              project.niche.map((n) => (
                <span key={n} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {n}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Audience</h4>
          <div className="flex flex-wrap gap-1.5">
            {project.audience.length === 0 ? (
              <span className="text-sm text-zinc-600">Not set</span>
            ) : (
              project.audience.map((a) => (
                <span key={a} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {a}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Language / Country</h4>
          <p className="text-sm text-zinc-300">
            {project.language}
            {project.country ? ` · ${project.country}` : ""}
          </p>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Levels</h4>
          <div className="flex flex-wrap gap-1.5">
            {project.levels.length === 0 ? (
              <span className="text-sm text-zinc-600">Not set</span>
            ) : (
              project.levels.map((l) => (
                <span key={l} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs capitalize text-zinc-300">
                  {l}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Content types</h4>
          <div className="flex flex-wrap gap-1.5">
            {project.content_types.length === 0 ? (
              <span className="text-sm text-zinc-600">Not set</span>
            ) : (
              project.content_types.map((c) => (
                <span key={c} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {c}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Autonomy</h4>
          <p className="text-sm text-zinc-300">
            {project.autonomy_enabled ? "Enabled" : "Disabled"} · min score {project.min_opportunity_score} · daily limit {project.daily_limit}
            {project.require_human_approval ? " · human approval required" : ""}
          </p>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function toSettingsForm(project: Project): ProjectSettingsPayload {
  return {
    name: project.name,
    niche: project.niche,
    audience: project.audience,
    language: project.language,
    country: project.country ?? "",
    levels: project.levels,
    content_types: project.content_types,
    brand_voice: project.brand_voice ?? "",
    autonomy_enabled: project.autonomy_enabled,
    min_opportunity_score: project.min_opportunity_score,
    daily_limit: project.daily_limit,
    require_human_approval: project.require_human_approval,
  }
}

function ConfigTab({ projectId, project, onSaved }: { projectId: string; project: Project; onSaved: () => void }) {
  const { showToast } = useToast()
  const [form, setForm] = useState<ProjectSettingsPayload | null>(() => toSettingsForm(project))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(toSettingsForm(project))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  if (!form) return null

  const toggleLevel = (level: string) => {
    setForm((f) => (f ? { ...f, levels: f.levels.includes(level) ? f.levels.filter((l) => l !== level) : [...f.levels, level] } : f))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.updateProjectSettings(projectId, { ...form, country: form.country?.trim() || undefined })
      onSaved()
      showToast("Project settings saved.", "success")
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setError("The backend doesn't support saving these settings yet (no update endpoint). Your changes are shown here but weren't persisted.")
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save project settings.")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Project configuration" subtitle="Name, niche, audience, and autonomy settings for this project." />
      <div className="space-y-5 p-5">
        {error && <InlineError message={error} onDismiss={() => setError(null)} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor="cfg-name">
            <Input id="cfg-name" value={form.name} onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })} />
          </Field>
          <Field label="Language" htmlFor="cfg-lang">
            <Input id="cfg-lang" value={form.language} onChange={(e) => setForm((f) => f && { ...f, language: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Niche(s)">
            <TagInput values={form.niche} onChange={(niche) => setForm((f) => f && { ...f, niche })} placeholder="e.g. python, devops" />
          </Field>
          <Field label="Audience">
            <TagInput values={form.audience} onChange={(audience) => setForm((f) => f && { ...f, audience })} placeholder="e.g. backend engineers" />
          </Field>
        </div>

        <Field label="Levels covered">
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => toggleLevel(level)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  form.levels.includes(level)
                    ? "border-purple-500 bg-purple-500/15 text-purple-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Content types">
          <TagInput values={form.content_types} onChange={(content_types) => setForm((f) => f && { ...f, content_types })} placeholder="e.g. tutorial, how-to" />
        </Field>

        <Field label="Brand voice" htmlFor="cfg-voice" hint="Optional guidance passed to the writer agent">
          <Textarea id="cfg-voice" rows={2} value={form.brand_voice} onChange={(e) => setForm((f) => f && { ...f, brand_voice: e.target.value })} />
        </Field>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Shield size={15} />
            Autonomy
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Min. opportunity score" htmlFor="cfg-score" hint="0-100, gates auto-approval">
              <Input
                id="cfg-score"
                type="number"
                min={0}
                max={100}
                value={form.min_opportunity_score}
                onChange={(e) => setForm((f) => f && { ...f, min_opportunity_score: Number(e.target.value) })}
              />
            </Field>
            <Field label="Daily generation limit" htmlFor="cfg-limit">
              <Input
                id="cfg-limit"
                type="number"
                min={0}
                value={form.daily_limit}
                onChange={(e) => setForm((f) => f && { ...f, daily_limit: Number(e.target.value) })}
              />
            </Field>
            <div className="flex flex-col justify-end gap-3 pb-1">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500"
                  checked={form.autonomy_enabled}
                  onChange={(e) => setForm((f) => f && { ...f, autonomy_enabled: e.target.checked })}
                />
                Autonomy enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500"
                  checked={form.require_human_approval}
                  onChange={(e) => setForm((f) => f && { ...f, require_human_approval: e.target.checked })}
                />
                Require human approval
              </label>
            </div>
          </div>
        </div>

        <div className="pt-1">
          <Button icon={<Save size={15} />} loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

function StrategyTab({ projectId }: { projectId: string }) {
  const { showToast } = useToast()
  const { data, loading, error: loadError } = useAsync(() => api.getProjectStrategy(projectId), [projectId])
  const [form, setForm] = useState<ProjectStrategyPayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setForm({
        content_goals: data.content_goals,
        prohibited_topics: data.prohibited_topics,
        preferred_sources: data.preferred_sources,
        publishing_frequency: data.publishing_frequency ?? "",
      })
    } else if (!loading && loadError) {
      setForm({ content_goals: [], prohibited_topics: [], preferred_sources: [], publishing_frequency: "" })
    }
  }, [data, loading, loadError])

  if (loading) {
    return (
      <Card>
        <CardHeader title="Content strategy" subtitle="Goals, guardrails, and preferred sources." />
        <div className="h-32 animate-pulse bg-zinc-900" />
      </Card>
    )
  }

  if (!form) return null

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateProjectStrategy(projectId, { ...form, publishing_frequency: form.publishing_frequency || undefined })
      showToast("Strategy saved.", "success")
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save the content strategy.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Content strategy" subtitle="Goals, guardrails, and preferred sources for this project." />
      <div className="space-y-5 p-5">
        {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}
        <Field label="Content goals">
          <TagInput
            values={form.content_goals}
            onChange={(content_goals) => setForm((f) => f && { ...f, content_goals })}
            placeholder="e.g. grow organic search traffic"
          />
        </Field>
        <Field label="Prohibited topics">
          <TagInput
            values={form.prohibited_topics}
            onChange={(prohibited_topics) => setForm((f) => f && { ...f, prohibited_topics })}
            placeholder="Topics to avoid"
          />
        </Field>
        <Field label="Preferred sources">
          <TagInput
            values={form.preferred_sources}
            onChange={(preferred_sources) => setForm((f) => f && { ...f, preferred_sources })}
            placeholder="Domains or publishers to prioritize"
          />
        </Field>
        <Field label="Publishing frequency" htmlFor="cfg-freq" hint="Optional, e.g. 3x per week">
          <Input
            id="cfg-freq"
            value={form.publishing_frequency}
            onChange={(e) => setForm((f) => f && { ...f, publishing_frequency: e.target.value })}
          />
        </Field>
        <Button icon={<Save size={15} />} loading={saving} onClick={save}>
          Save strategy
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function AddUrlSourceCard({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const { showToast } = useToast()
  const [sourceType, setSourceType] = useState<SourceType>("url")
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setError("Enter a URL.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload: SourceCreatePayload = { project_id: projectId, source_type: sourceType, url: url.trim() }
      await api.createSource(payload)
      setUrl("")
      showToast("Source queued for ingestion.", "success")
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the source.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Add a source by URL" subtitle="Website, RSS feed, sitemap, or GitHub repository." />
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && <InlineError message={error} onDismiss={() => setError(null)} />}
        <Field label="Source type" htmlFor="src-type">
          <Select id="src-type" value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
            {URL_SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="URL" htmlFor="src-url">
          <Input id="src-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/docs" />
        </Field>
        <Button type="submit" icon={<Link2 size={15} />} loading={submitting}>
          Add source
        </Button>
      </form>
    </Card>
  )
}

function UploadSourceCard({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Choose a file to upload.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.uploadSource(projectId, file)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      showToast("File uploaded and queued for ingestion.", "success")
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload the file.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Upload a file" subtitle="PDF, Word, Markdown, or plain text." />
      <form onSubmit={submit} className="space-y-4 p-5">
        {error && <InlineError message={error} onDismiss={() => setError(null)} />}
        <Field label="File" htmlFor="src-file">
          <input
            id="src-file"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.md,.markdown,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-100 hover:file:bg-zinc-700"
          />
        </Field>
        <Button type="submit" icon={<Upload size={15} />} loading={submitting}>
          Upload
        </Button>
      </form>
    </Card>
  )
}

function SourcesTable({
  data,
  loading,
  error,
  isOffline,
  reload,
}: {
  data: Source[] | null
  loading: boolean
  error: string | null
  isOffline: boolean
  reload: () => void
}) {
  return (
    <Card>
      <CardHeader
        title="Sources"
        subtitle="Ingestion status for every source added to this project."
        action={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={reload}>
            Refresh
          </Button>
        }
      />
      {loading ? (
        <Spinner label="Loading sources..." />
      ) : error ? (
        <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Layers size={22} />} title="No sources yet" description="Add a URL or upload a file above to start building the knowledge base." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3 font-medium">Title / URL</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Ingested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-800/30">
                  <td className="max-w-xs truncate px-5 py-3 text-zinc-200" title={s.url ?? s.title ?? s.id}>
                    {s.title || s.url || s.id}
                    {s.status === "FAILED" && s.error && <div className="mt-0.5 truncate text-xs text-red-400">{s.error}</div>}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {s.source_type}
                    {s.discovery_method === "web_search" && (
                      <Badge tone="info" className="ml-2">Web search</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500">{s.ingested_at ? new Date(s.ingested_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function PendingReviewSection({ projectId, refreshKey, onReviewed }: { projectId: string; refreshKey: number; onReviewed: () => void }) {
  const { data, loading, error, isOffline, reload } = useAsync(
    () => api.listSources(projectId, "PENDING"),
    [projectId, refreshKey],
  )
  const { showToast } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)

  const decide = async (source: Source, decision: "approve" | "reject") => {
    setBusyId(source.id)
    try {
      if (decision === "approve") {
        await api.approveSource(source.id)
        showToast("Source approved.", "success")
      } else {
        await api.rejectSource(source.id)
        showToast("Source rejected.", "success")
      }
      reload()
      onReviewed()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update the source.", "error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Pending review"
        subtitle="Web-search-discovered sources awaiting approval before they can ground future generations."
      />
      {loading ? (
        <Spinner label="Loading pending sources..." />
      ) : error ? (
        <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="No sources awaiting review." description="Discovered sources from live web research will show up here." />
      ) : (
        <div className="divide-y divide-zinc-800">
          {data.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-medium text-zinc-100" title={s.url ?? s.id}>
                  {s.title || s.url || s.id}
                </h4>
                {s.discovered_snippet && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{s.discovered_snippet}</p>}
                {s.search_query && <p className="mt-1 text-xs text-zinc-600">Query: "{s.search_query}"</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  icon={<Check size={14} />}
                  loading={busyId === s.id}
                  onClick={() => decide(s, "approve")}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  icon={<X size={14} />}
                  loading={busyId === s.id}
                  onClick={() => decide(s, "reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function KnowledgePacksSection({ projectId, sources, refreshKey, onReload }: { projectId: string; sources: string[]; refreshKey: number; onReload: () => void }) {
  const { data, loading, error, isOffline, reload } = useAsync(() => api.listKnowledgePacks(projectId), [projectId, refreshKey])
  const { showToast } = useToast()
  const [creating, setCreating] = useState(false)
  const [topic, setTopic] = useState("")
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) {
      setFormError("Give the pack a topic.")
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await api.createKnowledgePack({ project_id: projectId, topic: topic.trim(), source_ids: sourceIds })
      setTopic("")
      setSourceIds([])
      setCreating(false)
      showToast("Knowledge pack created.", "success")
      onReload()
      reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the knowledge pack.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Knowledge packs"
        subtitle="Curated bundles of sources used during research and writing."
        action={
          !creating && (
            <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              New pack
            </Button>
          )
        }
      />
      {creating && (
        <form onSubmit={submit} className="space-y-4 border-b border-zinc-800 p-5">
          {formError && <InlineError message={formError} onDismiss={() => setFormError(null)} />}
          <Field label="Topic" htmlFor="pack-topic">
            <Input id="pack-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Python asyncio internals" />
          </Field>
          <Field label="Source IDs" hint={sources.length > 0 ? `Available: ${sources.slice(0, 5).join(", ")}${sources.length > 5 ? "…" : ""}` : "No ingested sources yet"}>
            <TagInput values={sourceIds} onChange={setSourceIds} placeholder="Paste source IDs" />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={submitting}>
              Create pack
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {loading ? (
        <Spinner label="Loading knowledge packs..." />
      ) : error ? (
        <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="No knowledge packs yet" description="Group ingested sources into a pack to feed a generation job." />
      ) : (
        <div className="divide-y divide-zinc-800">
          {data.map((pack) => (
            <div key={pack.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-medium text-zinc-100">{pack.topic}</h4>
                {pack.description && <p className="text-xs text-zinc-500">{pack.description}</p>}
              </div>
              <span className="text-xs text-zinc-500">{pack.source_ids.length} source{pack.source_ids.length === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SourcesTab({ projectId }: { projectId: string }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((n) => n + 1)
  const sourcesState = useAsync(() => api.listSources(projectId), [projectId, refreshKey])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AddUrlSourceCard projectId={projectId} onAdded={bump} />
        <UploadSourceCard projectId={projectId} onAdded={bump} />
      </div>
      <SourcesTable {...sourcesState} />
      <PendingReviewSection projectId={projectId} refreshKey={refreshKey} onReviewed={bump} />
      <KnowledgePacksSection
        projectId={projectId}
        sources={sourcesState.data?.map((s) => s.id) ?? []}
        refreshKey={refreshKey}
        onReload={() => {
          bump()
          sourcesState.reload()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

const FILTERS: { value: OpportunityStatus | "ALL"; label: string }[] = [
  { value: "DISCOVERED", label: "Discovered" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
]

function trendTone(trend?: string | null) {
  if (!trend) return "neutral" as const
  const t = trend.toLowerCase()
  if (t.includes("ris") || t.includes("up")) return "success" as const
  if (t.includes("fall") || t.includes("down") || t.includes("declin")) return "danger" as const
  return "neutral" as const
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? "success" : score >= 50 ? "warning" : "danger"
  return <Badge tone={tone}>{score}</Badge>
}

function OpportunityRow({ opportunity, onChanged }: { opportunity: Opportunity; onChanged: () => void }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)

  const approve = async () => {
    setBusy("approve")
    try {
      await api.approveOpportunity(opportunity.id)
      showToast(`Approved "${opportunity.topic}".`, "success")
      onChanged()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not approve this opportunity.", "error")
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy("reject")
    try {
      await api.rejectOpportunity(opportunity.id)
      showToast(`Rejected "${opportunity.topic}".`, "info")
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        showToast("Rejecting opportunities isn't available on the backend yet.", "error")
      } else {
        showToast(err instanceof ApiError ? err.message : "Could not reject this opportunity.", "error")
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <tr className="hover:bg-zinc-800/30">
      <td className="max-w-[20rem] px-5 py-4">
        <div className="text-sm font-medium text-zinc-100">{opportunity.topic}</div>
        {opportunity.content_gap && <div className="mt-0.5 truncate text-xs text-purple-400">Gap: {opportunity.content_gap}</div>}
        {opportunity.brief && <div className="mt-1 text-xs text-zinc-500">{opportunity.brief}</div>}
        {opportunity.references && opportunity.references.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {opportunity.reference_source && opportunity.reference_source !== "web_search" && (
              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500">AI-suggested — unverified</div>
            )}
            {opportunity.references.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs text-purple-400 hover:underline"
              >
                {url}
              </a>
            ))}
          </div>
        )}
      </td>
      <td className="px-5 py-4">
        <ScoreBadge score={opportunity.score} />
      </td>
      <td className="px-5 py-4 text-sm text-zinc-400">{opportunity.demand ?? "—"}</td>
      <td className="px-5 py-4">
        {opportunity.trend ? <Badge tone={trendTone(opportunity.trend)}>{opportunity.trend}</Badge> : <span className="text-sm text-zinc-600">—</span>}
      </td>
      <td className="px-5 py-4 text-sm text-zinc-400">{opportunity.competition ?? "—"}</td>
      <td className="px-5 py-4">
        <StatusBadge status={opportunity.status} />
      </td>
      <td className="px-5 py-4">
        {opportunity.status === "DISCOVERED" ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="!px-2.5 !py-1.5" loading={busy === "approve"} disabled={busy !== null} onClick={approve} aria-label="Approve">
              <Check size={14} />
            </Button>
            <Button variant="ghost" className="!px-2.5 !py-1.5" loading={busy === "reject"} disabled={busy !== null} onClick={reject} aria-label="Reject">
              <X size={14} />
            </Button>
          </div>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </td>
    </tr>
  )
}

function OpportunitiesTab({ projectId, onNavigate }: { projectId: string; onNavigate: (page: Page) => void }) {
  const [filter, setFilter] = useState<OpportunityStatus | "ALL">("DISCOVERED")
  const [discovering, setDiscovering] = useState(false)
  const [statement, setStatement] = useState("")
  const { showToast } = useToast()

  const { data, loading, error, isOffline, reload } = useAsync(
    () => api.listOpportunities(projectId, filter === "ALL" ? undefined : filter),
    [projectId, filter],
  )

  const discover = async () => {
    setDiscovering(true)
    try {
      const trimmed = statement.trim()
      const found = await api.discoverOpportunities(projectId, trimmed ? [trimmed] : undefined)
      showToast(`Discovered ${found.length} opportunit${found.length === 1 ? "y" : "ies"}.`, "success")
      reload()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not run opportunity discovery.", "error")
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Describe a topic or statement, e.g. 'AI security' (optional — falls back to project niche)"
          className="min-w-[20rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.value ? "border-purple-500 bg-purple-500/15 text-purple-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onNavigate("generate")}>
            Go to Generate
          </Button>
          <Button icon={<Sparkles size={14} />} loading={discovering} onClick={discover}>
            Discover opportunities
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Pipeline" subtitle="Sourced from trend, search, and content-gap signals." />
        {loading ? (
          <Spinner label="Loading opportunities..." />
        ) : error ? (
          <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Compass size={22} />}
            title="No opportunities here yet"
            description="Run discovery to generate topic candidates from this project's niche, or wait for the opportunity agent to find some via live research."
            action={
              <Button icon={<Sparkles size={14} />} loading={discovering} onClick={discover}>
                Discover opportunities
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3 font-medium">Topic</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="px-5 py-3 font-medium">Demand</th>
                  <th className="px-5 py-3 font-medium">Trend</th>
                  <th className="px-5 py-3 font-medium">Competition</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.map((o) => (
                  <OpportunityRow key={o.id} opportunity={o} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetail({
  projectId,
  onBack,
  onNavigate,
}: {
  projectId: string
  onBack: () => void
  onNavigate: (page: Page) => void
}) {
  const [tab, setTab] = useState<Tab>("overview")
  const { projects, projectsLoading, projectsError, backendOffline, refreshProjects } = useAppContext()
  const project = projects.find((p) => p.id === projectId) ?? null

  if (projectsLoading) return <Spinner label="Loading project..." />
  if (projectsError) return <ErrorState message={projectsError} isOffline={backendOffline} onRetry={refreshProjects} />
  if (!project) return <ErrorState message="This project could not be found." onRetry={refreshProjects} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        subtitle="Project details, configuration, sources, and opportunities."
        action={
          <Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={onBack}>
            Back to projects
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "bg-purple-600/15 text-purple-300" : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={project} />}
      {tab === "config" && <ConfigTab projectId={projectId} project={project} onSaved={refreshProjects} />}
      {tab === "strategy" && <StrategyTab projectId={projectId} />}
      {tab === "sources" && <SourcesTab projectId={projectId} />}
      {tab === "opportunities" && <OpportunitiesTab projectId={projectId} onNavigate={onNavigate} />}
    </div>
  )
}
