import { Children, isValidElement, useState, type ReactNode } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import type { Components } from "react-markdown"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { NoteProperties } from "@/components/note-properties"
import { splitFrontmatter } from "@/lib/frontmatter"
import { isExternalHref, rewriteWikilinks } from "@/lib/wikilinks"

const CALLOUT_RE = /^\[!([A-Za-z-]+)\](?:[ \t]+([^\n]*))?/

function splitCallout(children: ReactNode): {
  type: string
  title: string
  body: ReactNode
} | null {
  const items = Children.toArray(children)
  const start = items.findIndex((item) => textOf(item).trim().length > 0)
  if (start < 0) return null
  const first = items[start]
  const text = textOf(first).trim()
  const match = text.match(CALLOUT_RE)
  if (!match) return null
  const leftover = text.slice(match[0].length).trim()
  const rest = items.slice(start + 1)
  return {
    type: match[1].toLowerCase(),
    title: (match[2] ?? "").trim() || match[1],
    body: leftover ? [<p key="callout-rest">{leftover}</p>, ...rest] : rest,
  }
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function copyText(text: string) {
  const fallback = () => {
    const el = document.createElement("textarea")
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    el.remove()
    toast.success("Copied")
  }
  if (!navigator.clipboard?.writeText) {
    fallback()
    return
  }
  void navigator.clipboard.writeText(text).then(() => toast.success("Copied")).catch(fallback)
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="wiki-code-copy"
      aria-label="Copy"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        copyText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  )
}

function CodeBlock({ children }: { children: ReactNode }) {
  let language = ""
  Children.forEach(children, (child) => {
    if (!isValidElement<{ className?: string }>(child)) return
    language = child.props.className?.match(/language-(\S+)/)?.[1] ?? ""
  })
  const text = textOf(children).replace(/\n$/, "")
  return (
    <div className="wiki-codeblock">
      <div className="wiki-codeblock-bar">
        <span className="wiki-codeblock-lang">{language}</span>
        <CopyBtn text={text} />
      </div>
      <pre>{children}</pre>
    </div>
  )
}

function InlineCode({ children }: { children: ReactNode }) {
  const text = textOf(children)
  return (
    <code className="wiki-inline-code">
      {children}
      <CopyBtn text={text} />
    </code>
  )
}

export function MarkdownView({
  content,
  onWikiLink,
  onToggleTask,
}: {
  content: string
  onWikiLink: (target: string) => void
  onToggleTask?: (index: number, checked: boolean) => void
}) {
  const { meta, body } = splitFrontmatter(content)
  let taskIndex = 0

  const components: Components = {
    a({ href, children }) {
      if (!href || href.startsWith("#")) {
        return <a href={href}>{children}</a>
      }
      if (isExternalHref(href)) {
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      }
      const target = href.startsWith("wiki://")
        ? decodeURIComponent(href.slice("wiki://".length))
        : href
      return (
        <button type="button" className="wiki-link" onClick={() => onWikiLink(target)}>
          {children}
        </button>
      )
    },
    pre({ children }) {
      return <CodeBlock>{children}</CodeBlock>
    },
    blockquote({ children }) {
      const callout = splitCallout(children)
      if (!callout) return <blockquote>{children}</blockquote>
      return (
        <aside className={`wiki-callout wiki-callout-${callout.type}`}>
          <div className="wiki-callout-title">{callout.title}</div>
          <div className="wiki-callout-body">{callout.body}</div>
        </aside>
      )
    },
    input({ type, checked, disabled, node, ...props }) {
      if (type !== "checkbox") return <input type={type} checked={checked} disabled={disabled} {...props} />
      void node
      const index = taskIndex++
      const isChecked = Boolean(checked)
      return (
        <label className="wiki-task-wrap">
          <input
            type="checkbox"
            className="wiki-task"
            checked={isChecked}
            disabled={false}
            readOnly
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggleTask?.(index, !isChecked)
            }}
          />
        </label>
      )
    },
    code({ className, children }) {
      const isBlock = Boolean(className) || String(children).includes("\n")
      if (isBlock) return <code className={className}>{children}</code>
      return <InlineCode>{children}</InlineCode>
    },
  }

  return (
    <article className="wiki-md mx-auto max-w-3xl px-6 py-8">
      <NoteProperties meta={meta} />
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (/^javascript:/i.test(url) ? "" : url)}
        components={components}
      >
        {rewriteWikilinks(body)}
      </Markdown>
    </article>
  )
}
