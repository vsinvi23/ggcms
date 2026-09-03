import { AlertOctagon, BookOpen, Compass, FileCheck2, Gauge, ListTodo, Plus, RefreshCw } from "lucide-react"
import { useAppContext } from "../context/AppContext"
import { useAsync } from "../hooks/useAsync"
import * as api from "../services/api"
import { Button, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from "../components/ui"
import type { Page } from "../App"

interface DashboardSummary {
  content_generated: number | null
  pending_jobs: number | null
  open_opportunities: number | null
  failed_jobs: number | null
  avg_quality_score: number | null
  knowledge_sources: number | null
}

async function loadSummary(projectId: string): Promise<DashboardSummary> {
  const [analytics, content, opportunities, sources] = await Promise.allSettled([
    api.getAnalytics(projectId),
    api.listContent(projectId),
    api.listOpportunities(projectId, "DISCOVERED"),
    api.listSources(projectId),
  ])

  const anySucceeded = [analytics, content, opportunities, sources].some((r) => r.status === "fulfilled")
  if (!anySucceeded && analytics.status === "rejected") {
    throw analytics.reason
  }

  const a = analytics.status === "fulfilled" ? analytics.value : undefined

  return {
    content_generated: a?.content_generated ?? (content.status === "fulfilled" ? content.value.length : null),
    pending_jobs: a?.pending_jobs ?? null,
    open_opportunities: a?.open_opportunities ?? (opportunities.status === "fulfilled" ? opportunities.value.length : null),
    failed_jobs: a?.failed_jobs ?? null,
    avg_quality_score: a?.avg_quality_score ?? null,
    knowledge_sources: a?.knowledge_sources ?? (sources.status === "fulfilled" ? sources.value.length : null),
  }
}

function display(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { selectedProjectId, selectedProject, projects, projectsLoading, projectsError, backendOffline, refreshProjects } =
    useAppContext()

  const { data, loading, error, isOffline, reload } = useAsync(
    () => (selectedProjectId ? loadSummary(selectedProjectId) : Promise.resolve(null)),
    [selectedProjectId],
  )

  if (projectsLoading) return <Spinner label="Loading your projects..." />

  if (projectsError) {
    return <ErrorState message={projectsError} isOffline={backendOffline} onRetry={refreshProjects} />
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Compass size={22} />}
        title="No projects yet"
        description="Create a project to start discovering opportunities and generating learning content."
        action={
          <Button icon={<Plus size={15} />} onClick={() => onNavigate("projects")}>
            Create your first project
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${selectedProject ? `, ${selectedProject.name}` : ""}`}
        subtitle="A snapshot of your content pipeline."
        action={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={reload}>
            Refresh
          </Button>
        }
      />

      {loading && <Spinner label="Loading dashboard..." />}

      {!loading && error && <ErrorState message={error} isOffline={isOffline} onRetry={reload} />}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Content generated" value={display(data.content_generated)} icon={<FileCheck2 size={18} />} />
          <StatCard label="Pending jobs" value={display(data.pending_jobs)} icon={<ListTodo size={18} />} />
          <StatCard label="Open opportunities" value={display(data.open_opportunities)} icon={<Compass size={18} />} />
          <StatCard
            label="Failed jobs"
            value={display(data.failed_jobs)}
            icon={<AlertOctagon size={18} />}
            tone={data.failed_jobs ? "danger" : "default"}
          />
          <StatCard
            label="Avg. quality score"
            value={display(data.avg_quality_score, data.avg_quality_score !== null ? "%" : "")}
            icon={<Gauge size={18} />}
            tone={data.avg_quality_score !== null && data.avg_quality_score >= 80 ? "success" : "default"}
          />
          <StatCard label="Knowledge sources" value={display(data.knowledge_sources)} icon={<BookOpen size={18} />} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Button variant="secondary" className="justify-start" onClick={() => onNavigate("projects")}>
          Review opportunities
        </Button>
        <Button variant="secondary" className="justify-start" onClick={() => onNavigate("generate")}>
          Start a generation job
        </Button>
        <Button variant="secondary" className="justify-start" onClick={() => onNavigate("knowledge")}>
          Add a knowledge source
        </Button>
      </div>
    </div>
  )
}
