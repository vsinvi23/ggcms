import { useEffect, useState } from "react"
import { AlertTriangle, Save } from "lucide-react"
import { useToast } from "../components/Toast"
import { useAsync } from "../hooks/useAsync"
import * as api from "../services/api"
import { ApiError } from "../services/api"
import { Button, Card, CardHeader, ErrorState, Field, InlineError, Input, PageHeader, Spinner } from "../components/ui"
import type { SystemSettings, SystemSettingsPayload } from "../services/types"

const SECRET_FIELDS: (keyof SystemSettingsPayload)[] = ["gemini_api_key", "tavily_api_key", "factory_sync_secret"]

function toForm(settings: SystemSettings): SystemSettingsPayload {
  return {
    gemini_api_key: "",
    gemini_model_planner: String(settings.gemini_model_planner.value),
    gemini_model_researcher: String(settings.gemini_model_researcher.value),
    gemini_model_writer: String(settings.gemini_model_writer.value),
    gemini_model_reviewer: String(settings.gemini_model_reviewer.value),
    gemini_base_url: String(settings.gemini_base_url.value),
    embedding_model: String(settings.embedding_model.value),
    gcs_bucket: String(settings.gcs_bucket.value),
    max_monthly_ai_budget: Number(settings.max_monthly_ai_budget.value),
    max_cost_per_content_unit: Number(settings.max_cost_per_content_unit.value),
    max_revisions: Number(settings.max_revisions.value),
    source_max_pages: Number(settings.source_max_pages.value),
    source_max_depth: Number(settings.source_max_depth.value),
    mock_mode: Boolean(settings.mock_mode.value),
    ggcms_base_url: String(settings.ggcms_base_url.value),
    factory_sync_secret: "",
    tavily_api_key: "",
    web_search_max_results: Number(settings.web_search_max_results.value),
  }
}

function SecretField({
  label,
  hint,
  id,
  value,
  masked,
  onChange,
}: {
  label: string
  hint?: string
  id: string
  value: string
  masked: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint ?? (masked ? `Currently set (${masked}). Leave blank to keep it.` : "Not set.")}>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        placeholder={masked ? "•••• (unchanged)" : "Not set"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
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
            masked={String(data.settings.gemini_api_key.value)}
            onChange={(v) => set("gemini_api_key", v)}
          />
          <Field label="Gemini base URL" htmlFor="ss-gemini-url" hint="Optional override, e.g. a proxy endpoint. Leave blank for the default Google endpoint.">
            <Input
              id="ss-gemini-url"
              value={form.gemini_base_url ?? ""}
              onChange={(e) => set("gemini_base_url", e.target.value)}
              placeholder="https://generativelanguage.googleapis.com"
            />
          </Field>
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
          <Field label="Embedding model" htmlFor="ss-embed-model">
            <Input id="ss-embed-model" value={form.embedding_model ?? ""} onChange={(e) => set("embedding_model", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Web Search" subtitle="Provider used for live source discovery during generation." />
        <div className="space-y-5 p-5">
          <SecretField
            label="Tavily API key"
            id="ss-tavily-key"
            value={form.tavily_api_key ?? ""}
            masked={String(data.settings.tavily_api_key.value)}
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
        <CardHeader title="GGCMS Sync" subtitle="Where exported content packages are sent." />
        <div className="space-y-5 p-5">
          <Field label="GGCMS base URL" htmlFor="ss-ggcms-url">
            <Input id="ss-ggcms-url" value={form.ggcms_base_url ?? ""} onChange={(e) => set("ggcms_base_url", e.target.value)} placeholder="http://localhost:8080" />
          </Field>
          <SecretField
            label="Sync secret"
            id="ss-sync-secret"
            value={form.factory_sync_secret ?? ""}
            masked={String(data.settings.factory_sync_secret.value)}
            onChange={(v) => set("factory_sync_secret", v)}
          />
          <Field label="GCS bucket" htmlFor="ss-gcs-bucket">
            <Input id="ss-gcs-bucket" value={form.gcs_bucket ?? ""} onChange={(e) => set("gcs_bucket", e.target.value)} />
          </Field>
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

      <div>
        <Button icon={<Save size={15} />} loading={saving} onClick={save}>
          Save system settings
        </Button>
      </div>
    </div>
  )
}
