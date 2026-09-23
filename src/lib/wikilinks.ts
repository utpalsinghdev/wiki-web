const wikiLink = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g

export function rewriteWikilinks(markdown: string) {
  return markdown
    .split(/(```[\s\S]*?```|`[^`]+`)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(wikiLink, (_match, target: string, alias?: string) => {
        const label = (alias ?? target).trim()
        return `[${label}](wiki://${encodeURIComponent(target.trim())})`
      })
    })
    .join("")
}

export function isExternalHref(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href)
}

type VaultFile = { path: string; name: string }

function joinRelative(fromFile: string, rel: string) {
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : ""
  const parts = dir ? dir.split("/") : []
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") parts.pop()
    else parts.push(seg)
  }
  return parts.join("/")
}

function matchFile(candidate: string, files: VaultFile[]) {
  const lower = candidate.replace(/\.md$/i, "").toLowerCase()
  return (
    files.find((file) => file.path.replace(/\.md$/i, "").toLowerCase() === lower) ??
    files.find((file) => file.path.toLowerCase() === `${lower}.md`) ??
    files.find((file) => {
      const path = file.path.replace(/\.md$/i, "").toLowerCase()
      return path.endsWith(`/${lower}`) || path === lower
    }) ??
    files.find(
      (file) => file.name.replace(/\.md$/i, "").toLowerCase() === lower.split("/").pop()
    )
  )
}

export function resolveVaultLink(
  href: string,
  currentPath: string,
  files: VaultFile[]
): string | null {
  let target = href.trim()
  try {
    target = decodeURIComponent(target)
  } catch {
    // keep raw
  }
  target = target.replace(/\\/g, "/")
  if (target.startsWith("wiki://")) target = target.slice("wiki://".length)
  target = (target.split("#")[0] ?? target).replace(/^\.\//, "")
  if (!target) return null

  const candidates = target.startsWith("/")
    ? [target.slice(1)]
    : [target, ...(currentPath ? [joinRelative(currentPath, target)] : [])]

  for (const candidate of candidates) {
    const hit = matchFile(candidate, files)
    if (hit) return hit.path
  }
  return matchFile(target, files)?.path ?? null
}
