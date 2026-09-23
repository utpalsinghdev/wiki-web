export type PropertyValue = string | string[]
export type Frontmatter = Record<string, PropertyValue>

function stripQuotes(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseInlineList(value: string): string[] | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean)
}

export function splitFrontmatter(content: string): {
  meta: Frontmatter
  body: string
} {
  const fence = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/)
  if (!fence) return { meta: {}, body: content }

  const raw = fence[1] ?? ""
  const body = content.slice(fence[0].length)
  const meta: Frontmatter = {}
  let currentKey: string | null = null

  for (const line of raw.split(/\r?\n/)) {
    const listItem = line.match(/^\s+-\s+(.*)$/)
    if (listItem && currentKey) {
      const item = stripQuotes(listItem[1] ?? "")
      const prev = meta[currentKey]
      meta[currentKey] = Array.isArray(prev)
        ? [...prev, item]
        : prev
          ? [prev, item]
          : [item]
      continue
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) continue
    currentKey = pair[1] ?? null
    if (!currentKey) continue
    const value = (pair[2] ?? "").trim()
    if (!value) {
      meta[currentKey] = ""
      continue
    }
    meta[currentKey] = parseInlineList(value) ?? stripQuotes(value)
  }

  return { meta, body }
}
