import { useState } from "react"
import { CheckCircle2, ExternalLink, FileText, FolderKanban, ImageIcon, Plus, RefreshCw, Trash2, XCircle } from "lucide-react"
import { useAppContext } from "../context/AppContext"
import { useToast } from "../components/Toast"
import { useAsync } from "../hooks/useAsync"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, InlineError, PageHeader, Select, Spinner, StatusBadge } from "../components/ui"
import Markdown from "../components/Markdown"
import type { ContentItemDetail, ContentStatus } from "../services/types"

const STATUS_FILTERS: (ContentStatus | "ALL")[] = ["ALL", "draft", "exported"]

function scoreTone(score?: number | null) {
  if (score === undefined || score === null) return "neutral" as const
  if (score >= 90) return "success" as const
  if (score >= 75) return "warning" as const
  return "danger" as const
}

function QualityReportPanel({ contentId }: { contentId: string }) {
  const { data, loading, error } = useAsync(() => api.getContentDetail(contentId), [contentId])
  const report = data?.quality_report

  if (loading) return <div className="h-24 animate-pulse rounded-lg bg-zinc-900" />
  if (error || !report) {
    return <p className="text-xs text-zinc-600">No quality report available yet.</p>
  }

  const metrics: { label: string; value?: number | null }[] = [
    { label: "Factuality", value: report.factuality_score },
    { label: "Citations", value: report.citation_score },
    { label: "Learning quality", value: report.learning_quality_score },
    { label: "Originality", value: report.originality_score },
    { label: "Readability", value: report.readability_score },
    { label: "SEO", value: report.seo_score },
    { label: "GEO", value: report.geo_score },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {report.passed ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
        <span className={`text-sm font-medium ${report.passed ? "text-emerald-400" : "text-red-400"}`}>
          {report.passed ? "Passed quality gate" : "Needs revision"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{m.label}</div>
            <Badge tone={scoreTone(m.value)} className="mt-1">
              {m.value ?? "—"}
            </Badge>
          </div>
        ))}
      </div>
      {report.issues && report.issues.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {report.issues.map((issue, idx) => (
            <li key={idx}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface SectionWithImage {
  title: string
  image_prompt?: string | null
}

/** Pulls a flat list of {title, image_prompt} out of body_json, whether it's
 * the flat-article shape (`sections: [{title, image_prompt}]`) or the course
 * shape (`sections: [{title, lessons: [{title, image_prompt}]}]`). Images
 * themselves are still a placeholder stub on the backend
 * (backend/services/image_service.py) -- this just surfaces where one is
 * planned so the operator isn't left guessing. */
function extractImageSpots(bodyJson: ContentItemDetail["body_json"]): SectionWithImage[] {
  const sections = (bodyJson?.sections as unknown[]) || []
  const spots: SectionWithImage[] = []
  for (const raw of sections) {
    const section = raw as { title?: string; image_prompt?: string | null; lessons?: unknown[] }
    const lessons = section.lessons as { title?: string; image_prompt?: string | null }[] | undefined
    if (lessons) {
      for (const lesson of lessons) {
        if (lesson.image_prompt) spots.push({ title: lesson.title || section.title || "", image_prompt: lesson.image_prompt })
      }
    } else if (section.image_prompt) {
      spots.push({ title: section.title || "", image_prompt: section.image_prompt })
    }
  }
  return spots
}

function ImagePlanPanel({ bodyJson }: { bodyJson: ContentItemDetail["body_json"] }) {
  const spots = extractImageSpots(bodyJson)
  if (spots.length === 0) return null
  return (
    <Card>
      <CardHeader title="Planned images" subtitle="Placeholder art -- real generation isn't wired up yet." />
      <ul className="divide-y divide-zinc-800">
        {spots.map((spot, idx) => (
          <li key={idx} className="flex items-center gap-3 px-5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-zinc-500">
              <ImageIcon size={14} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-200">{spot.title}</div>
              <div className="truncate text-xs text-zinc-500">Image coming soon · {spot.image_prompt}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ResourcesPanel({
  contentId,
  resources,
  onChanged,
}: {
  contentId: string
  resources: ContentItemDetail["resources"]
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState("")
  const [adding, setAdding] = useState(false)
  const [removingIndex, setRemovingIndex] = useState<number | null>(null)

  const addLink = async () => {
    if (!url.trim()) return
    setAdding(true)
    try {
      await api.addContentResource(contentId, { url: url.trim(), label: label.trim() || undefined })
      setUrl("")
      setLabel("")
      showToast("Resource link added.", "success")
      onChanged()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not add this resource link.", "error")
    } finally {
      setAdding(false)
    }
  }

  const removeLink = async (index: number) => {
    setRemovingIndex(index)
    try {
      await api.removeContentResource(contentId, index)
      onChanged()
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not remove this resource link.", "error")
    } finally {
      setRemovingIndex(null)
    }
  }

  return (
    <div className="space-y-3">
      {resources && resources.length > 0 ? (
        <ul className="space-y-1.5">
          {resources.map((r, idx) => (
            <li key={`${r.url}-${idx}`} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-purple-400 hover:underline"
                  >
                    {r.label || r.url}
                  </a>
                  <Badge tone={r.source === "carried_from_opportunity" ? "neutral" : "success"} className="text-[10px]">
                    {r.source === "carried_from_opportunity" ? "From opportunity" : "Added"}
                  </Badge>
                </div>
                {r.note && <div className="mt-0.5 text-xs text-zinc-500">{r.note}</div>}
              </div>
              <button
                onClick={() => removeLink(idx)}
                disabled={removingIndex === idx}
                aria-label="Remove resource"
                className="shrink-0 rounded p-1 text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-600">No resource links yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          className="min-w-[10rem] flex-1"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button variant="secondary" icon={<Plus size={14} />} loading={adding} onClick={addLink} disabled={!url.trim()}>
          Add link
        </Button>
      </div>
    </div>
  )
}

function ContentDetail({ contentId }: { contentId: string }) {
  const { showToast } = useToast()
  const { data, loading, error, isOffline, reload } = useAsync(() => api.getContentDetail(contentId), [contentId])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const doExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await api.exportContent(contentId)
      showToast("Sent to ggcms for import.", "success")
      reload()
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Could not export this content item.")
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <Spinner label="Loading content..." />
  if (error || !data) return <ErrorState message={error ?? "Not found."} isOffline={isOffline} onRetry={reload} />

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-50">{data.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <StatusBadge status={data.status} />
            <span>{data.content_type}</span>
            {data.audience && <span>· {data.audience}</span>}
            {data.difficulty && <span>· {data.difficulty}</span>}
            <span>· v{data.current_version}</span>
          </div>
        </div>
        <Button
          icon={<ExternalLink size={15} />}
          loading={exporting}
          disabled={data.status === "exported"}
          onClick={doExport}
        >
          {data.status === "exported" ? "Exported" : "Export to ggcms"}
        </Button>
      </div>

      {exportError && <InlineError message={exportError} onDismiss={() => setExportError(null)} />}

      {data.summary && <p className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">{data.summary}</p>}

      <Card>
        <CardHeader title="Quality report" />
        <div className="p-5">
          <QualityReportPanel contentId={contentId} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Content body" />
        <div className="p-5">
          {data.body_markdown ? (
            <Markdown source={data.body_markdown} />
          ) : (
            <p className="text-sm text-zinc-600">No content body yet -- this item hasn't finished generating.</p>
          )}
        </div>
      </Card>

      <ImagePlanPanel bodyJson={data.body_json} />

      <Card>
        <CardHeader title="Resources" />
        <div className="p-5">
          <ResourcesPanel contentId={contentId} resources={data.resources} onChanged={reload} />
        </div>
      </Card>
    </div>
  )
}

export default function Content() {
  const { selectedProject, selectedProjectId, projectsLoading } = useAppContext()
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, loading, error, isOffline, reload } = useAsync(
    () => (selectedProjectId ? api.listContent(selectedProjectId, status === "ALL" ? undefined : status) : Promise.resolve([])),
    [selectedProjectId, status],
  )

  if (projectsLoading) return <Spinner label="Loading..." />

  if (!selectedProject || !selectedProjectId) {
    return (
      <EmptyState
        icon={<FolderKanban size={22} />}
        title="No project selected"
        description="Select or create a project to see its generated content."
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content"
        subtitle={`Generated portfolio for ${selectedProject.name}`}
        action={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value as ContentStatus | "ALL")} aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All statuses" : s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Items" />
          {loading ? (
            <Spinner label="Loading content..." />
          ) : error ? (
            <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
          ) : !data || data.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No content yet" description="Generated items will appear here once a job completes." />
          ) : (
            <ul className="max-h-[32rem] divide-y divide-zinc-800 overflow-y-auto">
              {data.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelectedId(item.id)}
                    className={`flex w-full flex-col gap-1.5 px-5 py-3.5 text-left transition-colors hover:bg-zinc-800/40 ${
                      selectedId === item.id ? "bg-zinc-800/60" : ""
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-zinc-100">{item.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <StatusBadge status={item.status} />
                      <span>{item.content_type}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="lg:col-span-3">
          {selectedId ? (
            <ContentDetail contentId={selectedId} />
          ) : (
            <Card>
              <EmptyState icon={<FileText size={22} />} title="Select an item" description="Choose a content item from the list to view its body and quality report." />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
