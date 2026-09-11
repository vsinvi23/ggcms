import { Menu, Plus, WifiOff } from "lucide-react"
import { useAppContext } from "../context/AppContext"
import { Select } from "./ui"
import type { Page } from "../App"

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  "project-detail": "Project",
  knowledge: "Knowledge Library",
  generate: "Generate Content",
  content: "Content",
  "system-settings": "System Settings",
}

interface TopBarProps {
  page: Page
  onOpenMobileNav: () => void
  onNavigate: (page: Page) => void
}

export default function TopBar({ page, onOpenMobileNav, onNavigate }: TopBarProps) {
  const { projects, projectsLoading, backendOffline, selectedProjectId, selectProject } = useAppContext()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/50 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
        >
          <Menu size={20} />
        </button>
        <h2 className="truncate text-sm font-semibold uppercase tracking-wide text-zinc-400">{PAGE_TITLES[page]}</h2>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {backendOffline ? (
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-400">
            <WifiOff size={12} />
            <span className="hidden sm:inline">Backend offline</span>
          </span>
        ) : (
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            API online
          </span>
        )}

        {projectsLoading ? (
          <div className="h-9 w-40 animate-pulse rounded-lg bg-zinc-800 sm:w-52" />
        ) : projects.length === 0 ? (
          <button
            type="button"
            onClick={() => onNavigate("projects")}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 hover:border-purple-500 hover:text-purple-300"
          >
            <Plus size={14} />
            Create a project
          </button>
        ) : (
          <Select
            aria-label="Selected project"
            className="w-40 sm:w-56"
            value={selectedProjectId ?? ""}
            onChange={(e) => selectProject(e.target.value || null)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </header>
  )
}
