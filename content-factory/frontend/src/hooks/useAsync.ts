import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "../services/api"

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  /** Human-friendly message, already unwrapped from ApiError, or null. */
  error: string | null
  /** True when the error looks like the backend is unreachable, so callers
   * can show a distinct "is the backend running?" hint. */
  isOffline: boolean
  reload: () => void
}

function describeError(err: unknown): { message: string; isOffline: boolean } {
  if (err instanceof ApiError) {
    return { message: err.message, isOffline: err.isNetworkError }
  }
  if (err instanceof Error) return { message: err.message, isOffline: false }
  return { message: "Something went wrong.", isOffline: false }
}

/**
 * Fetches data with a plain useEffect (no react-query in this project yet).
 * Guards against setting state after the effect was superseded, and exposes
 * a manual `reload` for retry buttons / polling triggers.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const { message, isOffline: offline } = describeError(err)
        setError(message)
        setIsOffline(offline)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, isOffline, reload }
}
