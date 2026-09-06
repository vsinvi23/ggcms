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
// The Content Factory is protected by the same JWT issued by gg-cms at /auth.
// If no valid token exists in localStorage we redirect to the gg-cms login page.
// After login the user returns to /factory automatically.
function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const [, payloadB64] = token.split(".")
    const payload = JSON.parse(atob(payloadB64))
    // exp is seconds since epoch
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

const TOKEN_KEYS = ["token", "auth_token", "jwt", "access_token", "gg_cms_token"]

function getStoredToken(): string | null {
  for (const key of TOKEN_KEYS) {
    const val = localStorage.getItem(key) ?? sessionStorage.getItem(key)
    if (val) return val
  }
  return null
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const token = getStoredToken()
    if (isTokenValid(token)) {
      setAuthed(true)
    } else {
      // Redirect to gg-cms login — after login, the user lands back at /factory
      const returnUrl = encodeURIComponent(window.location.href)
      window.location.href = `/auth?redirect=${returnUrl}`
    }
    setChecked(true)
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

