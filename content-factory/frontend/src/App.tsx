import { useEffect, useState } from "react"
import { AppProvider } from "./context/AppContext"
import { ToastProvider } from "./components/Toast"
import Sidebar from "./components/Sidebar"
import TopBar from "./components/TopBar"
import Dashboard from "./pages/Dashboard"
import Projects from "./pages/Projects"
import ProjectDetail from "./pages/ProjectDetail"
import KnowledgeLibrary from "./pages/KnowledgeLibrary"
import Generate from "./pages/Generate"
import Content from "./pages/Content"
import SystemSettings from "./pages/SystemSettings"

export type Page = "dashboard" | "projects" | "project-detail" | "knowledge" | "generate" | "content" | "system-settings"

// ── Auth guard ───────────────────────────────────────────────────────────────
// The Content Factory is served behind the gg-cms /factory proxy, which only
// admits admin sessions (HttpOnly cookie). The console asks gg-cms who the
// current user is and redirects to the login page when there is no session.

function isLocalTestBypassEnabled(): boolean {
  if (typeof window === "undefined") return false
  const { hostname, pathname, search } = window.location
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0"
  const localTestParam = new URLSearchParams(search).get("local_test") === "1"
  const localTestPath = pathname.endsWith("/local-test") || pathname.endsWith("/factory/local-test")
  return isLocalHost && (localTestParam || localTestPath)
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (isLocalTestBypassEnabled()) {
      setAuthed(true)
      setChecked(true)
      return
    }

    fetch("/api/users/me", { credentials: "same-origin" })
      .then((res) => {
        if (res.ok) {
          setAuthed(true)
        } else {
          const returnUrl = encodeURIComponent(window.location.href)
          window.location.href = `/auth?redirect=${returnUrl}`
        }
      })
      .catch(() => {
        const returnUrl = encodeURIComponent(window.location.href)
        window.location.href = `/auth?redirect=${returnUrl}`
      })
      .finally(() => setChecked(true))
  }, [])

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Verifying session…</span>
        </div>
      </div>
    )
  }

  if (!authed) return null
  return <>{children}</>
}

function PageBody({
  page,
  onNavigate,
  viewingProjectId,
  onOpenProject,
  onBackToProjects,
}: {
  page: Page
  onNavigate: (page: Page) => void
  viewingProjectId: string | null
  onOpenProject: (id: string) => void
  onBackToProjects: () => void
}) {
  switch (page) {
    case "dashboard":
      return <Dashboard onNavigate={onNavigate} />
    case "projects":
      return <Projects onOpen={onOpenProject} />
    case "project-detail":
      return viewingProjectId ? (
        <ProjectDetail projectId={viewingProjectId} onBack={onBackToProjects} onNavigate={onNavigate} />
      ) : null
    case "knowledge":
      return <KnowledgeLibrary />
    case "generate":
      return <Generate />
    case "content":
      return <Content />
    case "system-settings":
      return <SystemSettings />
    default:
      return null
  }
}

function Console() {
  const [page, setPage] = useState<Page>("dashboard")
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const openProject = (id: string) => {
    setViewingProjectId(id)
    setPage("project-detail")
  }
  const backToProjects = () => {
    setViewingProjectId(null)
    setPage("projects")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased">
      <Sidebar active={page} onSelect={setPage} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar page={page} onOpenMobileNav={() => setMobileNavOpen(true)} onNavigate={setPage} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <PageBody
              page={page}
              onNavigate={setPage}
              viewingProjectId={viewingProjectId}
              onOpenProject={openProject}
              onBackToProjects={backToProjects}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <AuthGuard>
          <Console />
        </AuthGuard>
      </AppProvider>
    </ToastProvider>
  )
}

