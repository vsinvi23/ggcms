import type { ReactNode } from "react"
import { Fragment } from "react"

// A deliberately small, dependency-free markdown renderer for content bodies
// coming back from the backend. It builds React elements directly (never
// dangerouslySetInnerHTML), so all text is passed through React's normal
// escaping and there is no HTML-injection surface even though the markdown
// itself is LLM-generated and unreviewed.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Order matters: code spans first (so ** inside `code` isn't touched),
  // then links, then bold, then italic.
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const key = `${keyPrefix}-${i++}`
    if (match[1] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-purple-300">
          {match[1]}
        </code>,
      )
    } else if (match[2] !== undefined) {
      nodes.push(
        <a
          key={key}
          href={match[3]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-purple-400 underline decoration-purple-700 underline-offset-2 hover:text-purple-300"
        >
          {match[2]}
        </a>,
      )
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-zinc-100">
          {match[4]}
        </strong>,
      )
    } else if (match[5] !== undefined) {
      nodes.push(
        <em key={key} className="italic">
          {match[5]}
        </em>,
      )
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

interface Block {
  type: "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "code" | "quote" | "hr"
  content: string[]
  lang?: string
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === "") {
      i++
      continue
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ type: "code", content: codeLines, lang: lang || undefined })
      continue
    }

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      blocks.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", content: [line.replace(/^#{1,3}\s/, "")] })
      i++
      continue
    }

    if (/^---+\s*$/.test(line.trim())) {
      blocks.push({ type: "hr", content: [] })
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "quote", content: quoteLines })
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const itemLines: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        itemLines.push(lines[i].replace(/^\s*[-*]\s+/, ""))
        i++
      }
      blocks.push({ type: "ul", content: itemLines })
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const itemLines: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        itemLines.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""))
        i++
      }
      blocks.push({ type: "ol", content: itemLines })
      continue
    }

    // paragraph: consume until blank line or a line that starts a new block
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: "p", content: [paraLines.join(" ")] })
  }
  return blocks
}

export default function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source)

  return (
    <div className="max-w-none space-y-4 text-sm leading-relaxed text-zinc-300">
      {blocks.map((block, idx) => {
        const key = `block-${idx}`
        switch (block.type) {
          case "h1":
            return (
              <h1 key={key} className="text-xl font-bold text-zinc-50">
                {renderInline(block.content[0], key)}
              </h1>
            )
          case "h2":
            return (
              <h2 key={key} className="pt-1 text-lg font-bold text-zinc-50">
                {renderInline(block.content[0], key)}
              </h2>
            )
          case "h3":
            return (
              <h3 key={key} className="text-base font-semibold text-zinc-100">
                {renderInline(block.content[0], key)}
              </h3>
            )
          case "hr":
            return <hr key={key} className="border-zinc-800" />
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-purple-600/50 pl-4 italic text-zinc-400">
                {block.content.map((line, li) => (
                  <p key={li}>{renderInline(line, `${key}-${li}`)}</p>
                ))}
              </blockquote>
            )
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
                <code>{block.content.join("\n")}</code>
              </pre>
            )
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {block.content.map((item, li) => (
                  <li key={li}>{renderInline(item, `${key}-${li}`)}</li>
                ))}
              </ul>
            )
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {block.content.map((item, li) => (
                  <li key={li}>{renderInline(item, `${key}-${li}`)}</li>
                ))}
              </ol>
            )
          case "p":
          default:
            return (
              <p key={key}>
                {block.content[0].split("\n").map((line, li, arr) => (
                  <Fragment key={li}>
                    {renderInline(line, `${key}-${li}`)}
                    {li < arr.length - 1 && <br />}
                  </Fragment>
                ))}
              </p>
            )
        }
      })}
    </div>
  )
}
