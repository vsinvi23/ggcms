import { useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, FolderKanban, Globe2, Plus, X } from "lucide-react"
import { useAppContext } from "../context/AppContext"
import { useToast } from "../components/Toast"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import { Button, Card, EmptyState, Field, Input, InlineError, PageHeader, TagInput } from "../components/ui"
import type { ProjectCreatePayload } from "../services/types"

const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced"]

function emptyForm(): ProjectCreatePayload {
  return { name: "", niche: [], audience: [], language: "en", country: "", levels: [], content_types: ["article", "tutorial"] }
}

function CreateProjectForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ProjectCreatePayload>(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleLevel = (level: string) => {
    setForm((f) => ({
      ...f,
      levels: f.levels.includes(level) ? f.levels.filter((l) => l !== level) : [...f.levels, level],
    }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError("Give the project a name.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const project = await api.createProject({
        ...form,
        country: form.country?.trim() ? form.country.trim() : undefined,
      })
      onDone(project.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the project.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">New project</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-zinc-500 hover:text-zinc-200">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && <InlineError message={error} onDismiss={() => setError(null)} />}

        <Field label="Project name" htmlFor="proj-name">
          <Input
            id="proj-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Developer Learning Hub"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Niche(s)" hint="Press Enter or comma to add">
            <TagInput values={form.niche} onChange={(niche) => setForm((f) => ({ ...f, niche }))} placeholder="e.g. python, devops" />
          </Field>
          <Field label="Audience" hint="Who is this content for?">
            <TagInput values={form.audience} onChange={(audience) => setForm((f) => ({ ...f, audience }))} placeholder="e.g. backend engineers" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Language" htmlFor="proj-lang">
            <Input
              id="proj-lang"
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              placeholder="en"
            />
          </Field>
          <Field label="Country" htmlFor="proj-country" hint="Optional">
            <Input
              id="proj-country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              placeholder="Optional"
            />
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

        <Field label="Content types" hint="e.g. tutorial, how-to, concept-guide, quiz">
          <TagInput
            values={form.content_types}
            onChange={(content_types) => setForm((f) => ({ ...f, content_types }))}
            placeholder="e.g. tutorial, how-to"
          />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" loading={submitting}>
            Create project
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default function Projects({ onOpen }: { onOpen: (id: string) => void }) {
  const { projects, projectsLoading, projectsError, backendOffline, selectedProjectId, selectProject, refreshProjects } =
    useAppContext()
  const { showToast } = useToast()
  const [creating, setCreating] = useState(false)

  const handleCreated = (id: string) => {
    refreshProjects()
    selectProject(id)
    setCreating(false)
    showToast("Project created.", "success")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Each project has its own strategy, sources, and content pipeline."
        action={
          !creating && (
            <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />

      {creating && <CreateProjectForm onDone={handleCreated} onCancel={() => setCreating(false)} />}

      {projectsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : projectsError ? (
        <Card>
          <div className="p-2">
            <p className="px-4 pt-4 text-sm text-red-300">{projectsError}</p>
            {backendOffline && <p className="px-4 text-xs text-zinc-500">Is the backend running?</p>}
            <div className="p-4">
              <Button variant="secondary" onClick={refreshProjects}>
                Try again
              </Button>
            </div>
          </div>
        </Card>
      ) : projects.length === 0 && !creating ? (
        <Card>
          <EmptyState
            icon={<FolderKanban size={22} />}
            title="No projects yet"
            description="A project holds your niche, audience, and knowledge sources. Create one to get started."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                New project
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const active = p.id === selectedProjectId
            return (
              <Card key={p.id} className={`flex flex-col gap-3 p-5 ${active ? "ring-1 ring-purple-500" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">{p.name}</h3>
                  {active && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-purple-400" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.niche.length === 0 ? (
                    <span className="text-xs text-zinc-600">No niche set</span>
                  ) : (
                    p.niche.map((n) => (
                      <span key={n} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
                        {n}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Globe2 size={13} />
                  {p.language}
                  {p.country ? ` · ${p.country}` : ""}
                </div>
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <Button icon={<ArrowRight size={14} />} className="w-full" onClick={() => onOpen(p.id)}>
                    Open project
                  </Button>
                  <Button variant="secondary" disabled={active} className="w-full" onClick={() => selectProject(p.id)}>
                    {active ? "Active project" : "Make active"}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
