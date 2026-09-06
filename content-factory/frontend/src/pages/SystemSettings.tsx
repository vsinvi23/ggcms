import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, FolderOpen, Key, Lock, RefreshCw, Save } from "lucide-react"
import { useToast } from "../components/Toast"
import { useAsync } from "../hooks/useAsync"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import { Button, Card, CardHeader, ErrorState, Field, InlineError, Input, PageHeader, Spinner } from "../components/ui"
import type { SystemSettingField, SystemSettings, SystemSettingsPayload } from "../services/types"

const SECRET_FIELDS: (keyof SystemSettingsPayload)[] = ["gemini_api_key", "tavily_api_key"]

function toForm(settings: SystemSettings): SystemSettingsPayload {
  return {
    gemini_api_key: "",
    gemini_model_planner: String(settings.gemini_model_planner?.value ?? ""),
    gemini_model_researcher: String(settings.gemini_model_researcher?.value ?? ""),
    gemini_model_writer: String(settings.gemini_model_writer?.value ?? ""),
    gemini_model_reviewer: String(settings.gemini_model_reviewer?.value ?? ""),
    max_monthly_ai_budget: Number(settings.max_monthly_ai_budget?.value ?? 0),
    max_cost_per_content_unit: Number(settings.max_cost_per_content_unit?.value ?? 0),
    max_revisions: Number(settings.max_revisions?.value ?? 0),
    source_max_pages: Number(settings.source_max_pages?.value ?? 0),
    source_max_depth: Number(settings.source_max_depth?.value ?? 0),
    mock_mode: Boolean(settings.mock_mode?.value ?? false),
    tavily_api_key: "",
    web_search_max_results: Number(settings.web_search_max_results?.value ?? 0),
  }
}

function SecretField({
  label,
  id,
  value,
  settingField,
  onChange,
}: {
  label: string
  id: string
  value: string
  settingField?: SystemSettingField
  onChange: (v: string) => void
}) {
  const isSet = settingField?.is_set ?? false
  const source = settingField?.source ?? "default"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-zinc-200">
          {label}
        </label>
        {isSet ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={12} />
            Key Configured ({source === "override" ? "UI Override" : "Env Secret"})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            <Key size={12} />
            Not Configured
          </span>
        )}
      </div>

      <Field
        htmlFor={id}
        hint={
          isSet
            ? "API Key is securely stored. Leave blank to keep existing key, or enter a new key to update."
            : "Enter API Key to configure."
        }
      >
        <div className="relative">
          <Input
            id={id}
            type="password"
            autoComplete="off"
            placeholder={isSet ? "•••••••••••••••••••• (unchanged)" : "Enter API Key..."}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </Field>
    </div>
  )
}

function ReadonlyInfraField({ label, settingField }: { label: string; settingField?: SystemSettingField }) {
  const val = String(settingField?.value ?? "")
  return (
    <Field label={label} hint="Managed via Cloud Run environment variables / Secret Manager">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
        <Lock size={14} className="shrink-0 text-zinc-500" />
        <span className="truncate font-mono text-xs">{val || "(default)"}</span>
      </div>
    </Field>
  )
}

// ── Google Drive Integration Card ────────────────────────────────────────────
function GoogleDriveCard() {
  const { showToast } = useToast()
  const [folderUrl, setFolderUrl] = useState("")
  const [driveStatus, setDriveStatus] = useState<{ enabled: boolean; configured: boolean; message: string } | null>(null)
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string }[]>([])
  const [listing, setListing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ ingested: number; skipped: number; errors: number } | null>(null)
  const [projectId, setProjectId] = useState("")

  useEffect(() => {
    fetch("/api/gdrive/status")
      .then((r) => r.json())
      .then((d) => setDriveStatus(d))
      .catch(() => setDriveStatus({ enabled: false, configured: false, message: "Could not reach Drive status endpoint." }))
  }, [])

  const listFiles = async () => {
    if (!folderUrl.trim()) return
    setListing(true)
    setListError(null)
    setFiles([])
    setSyncResult(null)
    try {
      const resp = await fetch(`/api/gdrive/files?folder_url_or_id=${encodeURIComponent(folderUrl.trim())}`)
      if (!resp.ok) throw new Error((await resp.json()).detail ?? "Failed to list files")
      const data = await resp.json()
      setFiles(data.files ?? [])
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setListing(false)
    }
  }

  const syncFromDrive = async () => {
    if (!folderUrl.trim()) return
    if (!projectId.trim()) {
      showToast("Enter the Project ID to ingest files into.", "error")
      return
    }
    setSyncing(true)
    setSyncResult(null)
    try {
      const resp = await fetch("/api/gdrive/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_url_or_id: folderUrl.trim(), project_id: projectId.trim() }),
      })
      if (!resp.ok) throw new Error((await resp.json()).detail ?? "Ingestion failed")
      const data = await resp.json()
      setSyncResult({ ingested: data.ingested, skipped: data.skipped, errors: data.errors })
      showToast(`Drive sync complete: ${data.ingested} ingested, ${data.skipped} skipped, ${data.errors} errors.`, "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Drive sync failed.", "error")
    } finally {
      setSyncing(false)
    }
  }

  const isReady = driveStatus?.enabled && driveStatus?.configured

  return (
    <Card>
      <CardHeader title="Google Drive Integration" subtitle="Ingest source documents from a shared Drive folder." />
      <div className="space-y-5 p-5">
        {driveStatus && (
          <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              isReady
                ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-600/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            {isReady ? <Cloud size={16} className="mt-0.5 shrink-0" /> : <CloudOff size={16} className="mt-0.5 shrink-0" />}
            <span>{driveStatus.message}</span>
          </div>
        )}

        <Field label="Drive Folder URL or ID" htmlFor="gdrive-folder" hint="Paste full Google Drive folder URL or folder ID">
          <Input
            id="gdrive-folder"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/1BxiMVs0XRA5..."
            disabled={!isReady}
          />
        </Field>

        <Field label="Target Project ID" htmlFor="gdrive-project" hint="Content Factory project ID to ingest files into">
          <Input
            id="gdrive-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            disabled={!isReady}
          />
        </Field>

        {listError && <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">{listError}</div>}

        {files.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
              <FolderOpen size={13} />
              {files.length} file{files.length !== 1 ? "s" : ""} found
            </div>
            <ul className="divide-y divide-zinc-800 max-h-48 overflow-y-auto">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-zinc-300 truncate mr-4">{f.name}</span>
                  <span className="text-zinc-600 shrink-0">{f.mimeType.split("/").pop()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {syncResult && (
          <div className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs">
            <span className="text-emerald-400">✓ {syncResult.ingested} ingested</span>
            <span className="text-zinc-500">{syncResult.skipped} skipped</span>
            {syncResult.errors > 0 && <span className="text-red-400">{syncResult.errors} errors</span>}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            icon={<RefreshCw size={14} className={listing ? "animate-spin" : ""} />}
            loading={listing}
            onClick={listFiles}
            disabled={!isReady || !folderUrl.trim()}
          >
            List Files
          </Button>
          <Button
            icon={<Cloud size={14} />}
            loading={syncing}
            onClick={syncFromDrive}
            disabled={!isReady || !folderUrl.trim() || !projectId.trim()}
          >
            Sync from Drive
          </Button>
        </div>

        {!isReady && (
          <p className="text-xs text-zinc-600">
            To enable Drive ingestion, add the Google Drive Service Account JSON key to GCP Secret Manager as{" "}
            <code className="text-zinc-400">factory-gdrive-sa-key</code> and redeploy.
          </p>
        )}
      </div>
    </Card>
  )
}

export default function SystemSettingsPage() {
  const { showToast } = useToast()
  const { data, loading, error, isOffline, reload } = useAsync(() => api.getSystemSettings(), [])
  const [form, setForm] = useState<SystemSettingsPayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [restartRequired, setRestartRequired] = useState(false)

  useEffect(() => {
    if (data) setForm(toForm(data.settings))
  }, [data])

  if (loading) return <Spinner label="Loading system settings..." />
  if (error) return <ErrorState message={error} isOffline={isOffline} onRetry={reload} />
  if (!form || !data) return null

  const set = <K extends keyof SystemSettingsPayload>(key: K, value: SystemSettingsPayload[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { ...form }
      for (const field of SECRET_FIELDS) {
        if (!payload[field]) delete payload[field]
      }
      const result = await api.updateSystemSettings(payload)
      setForm(toForm(result.settings))
      setRestartRequired(result.restart_required)
      showToast(
        result.restart_required ? "Saved. Restart the backend to apply model/API-key changes." : "Settings saved.",
        "success",
      )
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save system settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" subtitle="Global configuration for LLM providers, web search, sync, and limits." />

      {restartRequired && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-600/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Model or API-key changes were saved but require a backend restart to take effect on existing agents.</span>
        </div>
      )}

      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError(null)} />}

      <Card>
        <CardHeader title="LLM & Models" subtitle="Gemini API access and per-agent model selection." />
        <div className="space-y-5 p-5">
          <SecretField
            label="Gemini API key"
            id="ss-gemini-key"
            value={form.gemini_api_key ?? ""}
            settingField={data.settings.gemini_api_key}
            onChange={(v) => set("gemini_api_key", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadonlyInfraField label="Gemini Base URL" settingField={data.settings.gemini_base_url} />
            <ReadonlyInfraField label="Embedding Model" settingField={data.settings.embedding_model} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Planner model" htmlFor="ss-model-planner">
              <Input id="ss-model-planner" value={form.gemini_model_planner ?? ""} onChange={(e) => set("gemini_model_planner", e.target.value)} />
            </Field>
            <Field label="Researcher model" htmlFor="ss-model-researcher">
              <Input id="ss-model-researcher" value={form.gemini_model_researcher ?? ""} onChange={(e) => set("gemini_model_researcher", e.target.value)} />
            </Field>
            <Field label="Writer model" htmlFor="ss-model-writer">
              <Input id="ss-model-writer" value={form.gemini_model_writer ?? ""} onChange={(e) => set("gemini_model_writer", e.target.value)} />
            </Field>
            <Field label="Reviewer model" htmlFor="ss-model-reviewer">
              <Input id="ss-model-reviewer" value={form.gemini_model_reviewer ?? ""} onChange={(e) => set("gemini_model_reviewer", e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Web Search" subtitle="Provider used for live source discovery during generation." />
        <div className="space-y-5 p-5">
          <SecretField
            label="Tavily API key"
            id="ss-tavily-key"
            value={form.tavily_api_key ?? ""}
            settingField={data.settings.tavily_api_key}
            onChange={(v) => set("tavily_api_key", v)}
          />
          <Field label="Max results per search" htmlFor="ss-search-max" hint="How many results to fetch and ingest per query">
            <Input
              id="ss-search-max"
              type="number"
              min={1}
              value={form.web_search_max_results ?? 0}
              onChange={(e) => set("web_search_max_results", Number(e.target.value))}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Infrastructure & Deployment Settings" subtitle="Read-only environment status." />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <ReadonlyInfraField label="GGCMS Base URL" settingField={data.settings.ggcms_base_url} />
          <ReadonlyInfraField label="GCS Bucket" settingField={data.settings.gcs_bucket} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Limits & Budget" subtitle="Cost guardrails and revision/ingestion limits." />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="Max monthly AI budget ($)" htmlFor="ss-budget">
            <Input
              id="ss-budget"
              type="number"
              min={0}
              step="0.01"
              value={form.max_monthly_ai_budget ?? 0}
              onChange={(e) => set("max_monthly_ai_budget", Number(e.target.value))}
            />
          </Field>
          <Field label="Max cost per content unit ($)" htmlFor="ss-unit-cost">
            <Input
              id="ss-unit-cost"
              type="number"
              min={0}
              step="0.01"
              value={form.max_cost_per_content_unit ?? 0}
              onChange={(e) => set("max_cost_per_content_unit", Number(e.target.value))}
            />
          </Field>
          <Field label="Max revisions" htmlFor="ss-revisions">
            <Input
              id="ss-revisions"
              type="number"
              min={0}
              value={form.max_revisions ?? 0}
              onChange={(e) => set("max_revisions", Number(e.target.value))}
            />
          </Field>
          <Field label="Source max pages" htmlFor="ss-max-pages">
            <Input
              id="ss-max-pages"
              type="number"
              min={1}
              value={form.source_max_pages ?? 0}
              onChange={(e) => set("source_max_pages", Number(e.target.value))}
            />
          </Field>
          <Field label="Source max crawl depth" htmlFor="ss-max-depth">
            <Input
              id="ss-max-depth"
              type="number"
              min={0}
              value={form.source_max_depth ?? 0}
              onChange={(e) => set("source_max_depth", Number(e.target.value))}
            />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500"
                checked={Boolean(form.mock_mode)}
                onChange={(e) => set("mock_mode", e.target.checked)}
              />
              Mock mode (no real LLM/search calls)
            </label>
          </div>
        </div>
      </Card>

      {/* Google Drive Integration */}
      <GoogleDriveCard />

      <div>
        <Button icon={<Save size={15} />} loading={saving} onClick={save}>
          Save system settings
        </Button>
      </div>
    </div>
  )
}
