import { useState } from "react"
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
  // Top-level navigation is plain React state -- no router is installed in
  // this project, and the console is small enough that a single active-page
  // value is all the navigation state that's needed. viewingProjectId rides
  // alongside page (rather than being folded into the Page union) since Page
  // has no mechanism to carry parameters.
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
        <Console />
      </AppProvider>
    </ToastProvider>
  )
}
