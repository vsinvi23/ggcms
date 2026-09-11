import { useEffect, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, CircleDashed, FolderKanban, Loader2, Sparkles, XCircle } from "lucide-react"
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
  Field,
  Input,
  InlineError,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui"
import { PIPELINE_STAGES, type JobStatusResponse } from "../services/types"

const DIFFICULTIES = ["beginner", "intermediate", "advanced"]
const DEFAULT_CONTENT_TYPES = ["tutorial", "how-to", "concept-guide", "reference", "quiz", "comparison"]
const POLL_INTERVAL_MS = 2500

type StageState = "done" | "active" | "pending" | "failed"

function stageStates(job: JobStatusResponse | null): StageState[] {
  if (!job) return PIPELINE_STAGES.map(() => "pending")
  if (job.status === "SUCCEEDED") return PIPELINE_STAGES.map(() => "done")

  const activeIndex = job.current_node ? PIPELINE_STAGES.findIndex((s) => s.nodes.includes(job.current_node!)) : -1

  return PIPELINE_STAGES.map((_, idx) => {
    if (job.status === "FAILED") {
      if (idx < activeIndex) return "done"
      if (idx === activeIndex || (activeIndex === -1 && idx === 0)) return "failed"
      return "pending"
    }
    if (activeIndex === -1) return idx === 0 ? "active" : "pending" // queued, nothing reported yet
    if (idx < activeIndex) return "done"
    if (idx === activeIndex) return "active"
    return "pending"
  })
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CheckCircle2 size={18} className="text-emerald-400" />
  if (state === "active") return <Loader2 size={18} className="animate-spin text-purple-400" />
  if (state === "failed") return <XCircle size={18} className="text-red-400" />
  return <CircleDashed size={18} className="text-zinc-700" />
}

function ProgressChecklist({ job }: { job: JobStatusResponse | null }) {
  const states = stageStates(job)
  return (
    <Card>
      <CardHeader
        title="Pipeline progress"
        subtitle={job ? `Job ${job.job_id}` : "Waiting to start"}
        action={
          job && (
            <Badge tone={job.status === "SUCCEEDED" ? "success" : job.status === "FAILED" ? "danger" : "progress"}>{job.status}</Badge>
          )
        }
      />
      <ol className="divide-y divide-zinc-800">
        {PIPELINE_STAGES.map((stage, idx) => (
          <li key={stage.key} className="flex items-center gap-3 px-5 py-3">
            <StageIcon state={states[idx]} />
            <span className={`text-sm ${states[idx] === "pending" ? "text-zinc-600" : "text-zinc-200"}`}>{stage.label}</span>
          </li>
        ))}
      </ol>
      {job?.cost_estimate !== undefined && job?.cost_estimate !== null && (
        <div className="border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">
          Estimated cost: <span className="font-mono text-zinc-300">${job.cost_estimate.toFixed(4)}</span>
        </div>
      )}
      {job?.status === "FAILED" && job.error && <div className="border-t border-zinc-800 px-5 py-3 text-xs text-red-400">{job.error}</div>}
    </Card>
  )
}

export default function Generate() {
  const { selectedProject, selectedProjectId, projectsLoading } = useAppContext()
  const { showToast } = useToast()

  const { data: opportunities, loading: oppLoading } = useAsync(
    () => (selectedProjectId ? api.listOpportunities(selectedProjectId, "APPROVED") : Promise.resolve([])),
    [selectedProjectId],
  )
  const { data: packs, loading: packsLoading } = useAsync(
    () => (selectedProjectId ? api.listKnowledgePacks(selectedProjectId) : Promise.resolve([])),
    [selectedProjectId],
  )

  const [opportunityId, setOpportunityId] = useState("")
  const [contentType, setContentType] = useState(DEFAULT_CONTENT_TYPES[0])
  const [knowledgePackIds, setKnowledgePackIds] = useState<string[]>([])
  const [enableWebResearch, setEnableWebResearch] = useState(true)
  const [audience, setAudience] = useState("")
  const [difficulty, setDifficulty] = useState("intermediate")
  const [targetLength, setTargetLength] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobStatusResponse | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedProject) return
    setAudience((prev) => prev || selectedProject.audience[0] || "")
    if (selectedProject.content_types.length > 0) setContentType(selectedProject.content_types[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id])

  useEffect(() => {
    if (!jobId || !selectedProjectId) return
    let cancelled = false

    const poll = () => {
      api
        .getJobStatus(jobId, selectedProjectId)
        .then((status) => {
          if (cancelled) return
          setJob(status)
          setPollError(null)
          if (status.status === "SUCCEEDED" || status.status === "FAILED") {
            if (pollRef.current) window.clearInterval(pollRef.current)
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setPollError(err instanceof ApiError ? err.message : "Lost contact with the job status endpoint.")
        })
    }

    poll()
    pollRef.current = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [jobId, selectedProjectId])

  const toggleKnowledgePack = (id: string) => {
    setKnowledgePackIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedProjectId) return
    if (!opportunityId) {
      setFormError("Choose an approved opportunity to generate content for.")
      return
    }
    setSubmitting(true)
    setFormError(null)
    setJob(null)
    setJobId(null)
    try {
      const result = await api.createGenerationJob({
        project_id: selectedProjectId,
        opportunity_id: opportunityId,
        content_type: contentType,
        knowledge_pack_ids: knowledgePackIds,
        enable_web_research: enableWebResearch,
        audience: audience || undefined,
        difficulty,
        target_length: targetLength ? Number(targetLength) : undefined,
      })
      setJobId(result.job_id)
      showToast("Generation job started.", "success")
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not start the generation job.")
    } finally {
      setSubmitting(false)
    }
  }

  if (projectsLoading) return <Spinner label="Loading..." />

  if (!selectedProject || !selectedProjectId) {
    return (
      <EmptyState
        icon={<FolderKanban size={22} />}
        title="No project selected"
        description="Select or create a project before starting a generation job."
      />
    )
  }

  const contentTypeOptions = selectedProject.content_types.length > 0 ? selectedProject.content_types : DEFAULT_CONTENT_TYPES

  return (
    <div className="space-y-6">
      <PageHeader title="Generate" subtitle={`Kick off the content pipeline for ${selectedProject.name}`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New generation job" subtitle="Runs strategy → research → writing → quality → export." />
          <form onSubmit={submit} className="space-y-4 p-5">
            {formError && <InlineError message={formError} onDismiss={() => setFormError(null)} />}

            <Field label="Opportunity" htmlFor="gen-opp" hint={!oppLoading && opportunities?.length === 0 ? "No approved opportunities yet -- approve one first." : undefined}>
              <Select id="gen-opp" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} disabled={oppLoading}>
                <option value="">{oppLoading ? "Loading..." : "Select an approved opportunity"}</option>
                {opportunities?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.topic} (score {o.score})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Content type" htmlFor="gen-type">
                <Select id="gen-type" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                  {contentTypeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" htmlFor="gen-difficulty">
                <Select id="gen-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Audience" htmlFor="gen-audience" hint="Optional">
                <Input id="gen-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. backend engineers" />
              </Field>
              <Field label="Target length (words)" htmlFor="gen-length" hint="Optional">
                <Input id="gen-length" type="number" min={0} value={targetLength} onChange={(e) => setTargetLength(e.target.value)} placeholder="e.g. 1500" />
              </Field>
            </div>

            <Field label="Knowledge packs" hint={packsLoading ? "Loading..." : packs?.length === 0 ? "No knowledge packs yet -- optional" : "Select the packs to ground this piece in"}>
              <div className="flex flex-wrap gap-2">
                {packs?.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggleKnowledgePack(p.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      knowledgePackIds.includes(p.id)
                        ? "border-purple-500 bg-purple-500/15 text-purple-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {p.topic}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500"
                checked={enableWebResearch}
                onChange={(e) => setEnableWebResearch(e.target.checked)}
              />
              Enable live web research
            </label>

            <Button type="submit" icon={<Sparkles size={15} />} loading={submitting} disabled={!opportunityId}>
              Start generation
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {pollError && <InlineError message={pollError} />}
          <ProgressChecklist job={job} />
        </div>
      </div>
    </div>
  )
}
