import { useState } from "react"
import { Info, Sparkles, X } from "lucide-react"

export interface FieldInfoData {
  title: string
  purpose: string
  aiUsage: string
  example?: string
}

export function InfoButton({ info }: { info: FieldInfoData }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded transition-colors"
        title={`What is ${info.title} & how AI uses it?`}
        aria-label={`Info about ${info.title}`}
      >
        <Info size={12} className="stroke-[2.5]" />
        <span>What's this?</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-xl border border-purple-500/40 bg-zinc-900 p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-purple-500/15 p-1.5 text-purple-400">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-semibold text-zinc-100 text-sm">{info.title} — Field Guide</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <span className="font-semibold text-purple-300 uppercase tracking-wider text-[10px] block">
                  📌 Purpose & Content
                </span>
                <p className="text-zinc-300 leading-relaxed bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                  {info.purpose}
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1 block">
                  <Sparkles size={11} /> How AI Pipeline Uses This
                </span>
                <p className="text-zinc-300 leading-relaxed bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/40">
                  {info.aiUsage}
                </p>
              </div>

              {info.example && (
                <div className="space-y-1">
                  <span className="font-semibold text-amber-400 uppercase tracking-wider text-[10px] block">
                    💡 Example Input
                  </span>
                  <p className="font-mono text-amber-200 text-[11px] bg-zinc-950 p-2 rounded-md border border-zinc-800/80">
                    {info.example}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors shadow-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
