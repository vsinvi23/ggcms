import {
  Database,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Sliders,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react"
import type { Page } from "../App"

interface NavItem {
  page: Page
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "projects", label: "Projects", icon: FolderKanban },
  { page: "knowledge", label: "Knowledge Library", icon: Database },
  { page: "generate", label: "Generate", icon: Sparkles },
  { page: "content", label: "Content", icon: FileText },
  { page: "system-settings", label: "System", icon: Sliders },
]

interface SidebarProps {
  active: Page
  onSelect: (page: Page) => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

function NavLinks({ active, onSelect }: { active: Page; onSelect: (page: Page) => void }) {
  return (
    <nav className="space-y-1 px-3">
      {NAV_ITEMS.map(({ page, label, icon: Icon }) => {
        const isActive = active === page
        return (
          <button
            key={page}
            type="button"
            onClick={() => onSelect(page)}
            aria-current={isActive ? "page" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? "bg-purple-600/15 font-semibold text-purple-300 ring-1 ring-inset ring-purple-500/30"
                : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-6 py-5">
      <div className="rounded-lg bg-purple-600 p-2 text-white">
        <Sparkles size={20} />
      </div>
      <div>
        <h1 className="text-sm font-bold leading-tight text-zinc-50">Content Factory</h1>
        <span className="font-mono text-[11px] text-zinc-500">Control Console</span>
      </div>
    </div>
  )
}

export default function Sidebar({ active, onSelect, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto pb-6">
          <NavLinks active={active} onSelect={onSelect} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close navigation"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-black/60"
          />
          <aside className="relative flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                aria-label="Close navigation"
                onClick={onCloseMobile}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-6">
              <NavLinks
                active={active}
                onSelect={(page) => {
                  onSelect(page)
                  onCloseMobile()
                }}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
