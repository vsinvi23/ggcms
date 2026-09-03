import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { AlertTriangle, Inbox, Loader2, WifiOff } from "lucide-react"

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-800 bg-zinc-900 ${className}`}>{children}</div>
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  icon?: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-purple-600 text-white hover:bg-purple-500 disabled:hover:bg-purple-600",
  secondary: "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
  danger: "bg-red-600/90 text-white hover:bg-red-600 border border-red-500/30",
}

export function Button({ variant = "primary", loading, icon, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-xs font-medium text-zinc-400 ${className}`} {...rest} />
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
    </div>
  )
}

/** A free-form tag editor for string[] fields (niche, audience, content types, ...). */
export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const remove = (idx: number) => onChange(values.filter((_, i) => i !== idx))
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    onChange([...values, ...parts])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500">
      {values.map((v, idx) => (
        <span
          key={`${v}-${idx}`}
          className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => remove(idx)}
            className="text-zinc-500 hover:text-zinc-200"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={values.length === 0 ? placeholder : "Add more..."}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add(e.currentTarget.value)
            e.currentTarget.value = ""
          } else if (e.key === "Backspace" && e.currentTarget.value === "" && values.length > 0) {
            remove(values.length - 1)
          }
        }}
        onBlur={(e) => {
          if (e.currentTarget.value.trim()) {
            add(e.currentTarget.value)
            e.currentTarget.value = ""
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "progress"

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  progress: "bg-purple-500/10 text-purple-400 border-purple-500/20",
}

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${BADGE_TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

const CONTENT_STATUS_TONE: Record<string, BadgeTone> = {
  // content item status (backend/models/domain.py ContentItem.status,
  // now Literal["draft", "exported"] -- see file_store rewrite)
  draft: "neutral",
  exported: "success",
  DISCOVERED: "neutral",
  APPROVED: "info",
  PENDING: "neutral",
  FETCHED: "info",
  EXTRACTED: "success",
  FAILED: "danger",
  QUEUED: "neutral",
  RUNNING: "progress",
  SUCCEEDED: "success",
  DISCOVERED_OPP: "neutral",
  REJECTED: "danger",
}

export function StatusBadge({ status }: { status: string }) {
  const tone = CONTENT_STATUS_TONE[status] ?? "neutral"
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: "default" | "danger" | "success"
}) {
  const valueColor = tone === "danger" ? "text-red-400" : tone === "success" ? "text-emerald-400" : "text-zinc-50"
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <div className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Loading / empty / error states -- used everywhere so the app never shows a
// blank screen while data is missing, loading, or the backend is down.
// ---------------------------------------------------------------------------

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-zinc-500">
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-zinc-800/70 p-3 text-zinc-500">{icon ?? <Inbox size={22} />}</div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-200">{title}</h4>
        {description && <p className="mx-auto max-w-sm text-xs text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  isOffline,
  onRetry,
}: {
  message: string
  isOffline?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-red-500/10 p-3 text-red-400">
        {isOffline ? <WifiOff size={22} /> : <AlertTriangle size={22} />}
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-200">
          {isOffline ? "Could not reach the backend" : "Something went wrong"}
        </h4>
        <p className="mx-auto max-w-sm text-xs text-zinc-500">
          {message}
          {isOffline && " Make sure the API server is running and VITE_API_BASE_URL points to it."}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Compact inline banner variant of ErrorState for use above a form/table
 * that should otherwise stay usable (e.g. mutation errors). */
export function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs font-semibold uppercase text-red-300/80 hover:text-red-200">
          Dismiss
        </button>
      )}
    </div>
  )
}
