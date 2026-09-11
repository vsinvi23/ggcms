import { useRef, useState, type FormEvent } from "react"
import { BookOpen, Check, FolderKanban, Layers, Link2, Plus, RefreshCw, Search, Upload, X } from "lucide-react"
import { useAppContext } from "../context/AppContext"
import { useToast } from "../components/Toast"
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
} from "../components/ui"
import type { Source, SourceCreatePayload, SourceType } from "../services/types"

const URL_SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "url", label: "Web page (URL)" },
  { value: "website", label: "Website (crawl)" },
  { value: "sitemap", label: "Sitemap" },
  { value: "rss", label: "RSS feed" },
  { value: "github", label: "GitHub repo" },
]

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

export default function KnowledgeLibrary() {
  const { selectedProject, selectedProjectId, projectsLoading } = useAppContext()
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((n) => n + 1)

  if (projectsLoading) return <Spinner label="Loading..." />

  if (!selectedProject || !selectedProjectId) {
    return (
      <EmptyState
        icon={<FolderKanban size={22} />}
        title="No project selected"
        description="Select or create a project first, then come back to build its knowledge library."
      />
    )
  }

  return <KnowledgeLibraryBody projectId={selectedProjectId} projectName={selectedProject.name} refreshKey={refreshKey} bump={bump} />
}

function KnowledgeLibraryBody({
  projectId,
  projectName,
  refreshKey,
  bump,
}: {
  projectId: string
  projectName: string
  refreshKey: number
  bump: () => void
}) {
  const sourcesState = useAsync(() => api.listSources(projectId), [projectId, refreshKey])

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Library" subtitle={`Sources and knowledge packs for ${projectName}`} />
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
