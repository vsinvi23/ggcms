import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import type { Project } from "../services/types"

const LAST_PROJECT_KEY = "acf.lastProjectId"

interface AppContextValue {
  projects: Project[]
  projectsLoading: boolean
  /** null once projects have loaded without error, even if the list is empty */
  projectsError: string | null
  backendOffline: boolean
  selectedProjectId: string | null
  selectedProject: Project | null
  selectProject: (id: string | null) => void
  refreshProjects: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function readStoredProjectId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

function storeProjectId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(LAST_PROJECT_KEY, id)
    else window.localStorage.removeItem(LAST_PROJECT_KEY)
  } catch {
    // ignore -- private browsing / storage disabled
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [backendOffline, setBackendOffline] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => readStoredProjectId())
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    setProjectsError(null)
    api
      .listProjects()
      .then((list) => {
        if (cancelled) return
        setProjects(list)
        setBackendOffline(false)
        setProjectsLoading(false)
        setSelectedProjectId((current) => {
          if (current && list.some((p) => p.id === current)) return current
          return list[0]?.id ?? null
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Could not load projects."
        setProjectsError(message)
        setBackendOffline(err instanceof ApiError && err.isNetworkError)
        setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const selectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id)
    storeProjectId(id)
  }, [])

  const refreshProjects = useCallback(() => setReloadToken((n) => n + 1), [])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      projects,
      projectsLoading,
      projectsError,
      backendOffline,
      selectedProjectId,
      selectedProject,
      selectProject,
      refreshProjects,
    }),
    [projects, projectsLoading, projectsError, backendOffline, selectedProjectId, selectedProject, selectProject, refreshProjects],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppContext must be used within an AppProvider")
  return ctx
}
