import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

const vaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../Vault"
)

const skipDirs = new Set([".obsidian", ".git", "node_modules"])
const wikiLink = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

export type VaultNode = {
  name: string
  path: string
  abs: string
  type: "file" | "folder"
  children?: VaultNode[]
}

export type GraphPayload = {
  nodes: { id: string; title: string; path: string; created: number }[]
  edges: { source: string; target: string }[]
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.end(JSON.stringify(body))
}

function toPosix(rel: string) {
  return rel.split(path.sep).join("/")
}

function resolveSafe(rel: string) {
  const resolved = path.resolve(vaultRoot, rel)
  const root = path.resolve(vaultRoot)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("path outside vault")
  }
  return resolved
}

function shouldSkip(name: string) {
  return skipDirs.has(name) || name === ".DS_Store" || name.startsWith("._")
}

function walk(abs: string, rel: string): VaultNode | null {
  const entries = fs.readdirSync(abs, { withFileTypes: true })
  const children: VaultNode[] = []

  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue
    const childRel = toPosix(path.join(rel, entry.name))
    const childAbs = path.join(abs, entry.name)

    if (entry.isDirectory()) {
      const folder = walk(childAbs, childRel)
      if (folder) children.push(folder)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      children.push({
        name: entry.name.replace(/\.md$/, ""),
        path: childRel,
        abs: childAbs,
        type: "file",
      })
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  if (rel !== "" && children.length === 0) return null

  return {
    name: rel === "" ? "Vault" : path.basename(rel),
    path: rel,
    abs,
    type: "folder",
    children,
  }
}

type SearchHit = {
  id: string
  kind: "file" | "folder" | "content"
  path: string
  title: string
  score: number
  snippet?: string
  line?: number
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q || !t) return 0
  if (t === q) return 1200
  if (t.startsWith(q)) return 900
  const idx = t.indexOf(q)
  if (idx >= 0) return 700 - Math.min(idx, 80)
  let ti = 0
  let run = 0
  let score = 180
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    run = found === ti ? run + 1 : 1
    score += run * 6 - Math.min(found, 40) * 0.2
    ti = found + 1
  }
  return score
}

function snippetAround(line: string, query: string, max = 92) {
  const i = line.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return line.slice(0, max).trim()
  const start = Math.max(0, i - 28)
  const chunk = line.slice(start, start + max).replace(/\s+/g, " ").trim()
  return `${start > 0 ? "…" : ""}${chunk}`
}

function collectNodes(
  node: VaultNode,
  files: VaultNode[],
  folders: VaultNode[]
) {
  if (node.type === "file") {
    files.push(node)
    return
  }
  if (node.path) folders.push(node)
  for (const child of node.children ?? []) collectNodes(child, files, folders)
}

function searchVault(query: string): SearchHit[] {
  const q = query.trim()
  if (q.length < 1) return []
  const tree = walk(vaultRoot, "")
  if (!tree) return []
  const files: VaultNode[] = []
  const folders: VaultNode[] = []
  collectNodes(tree, files, folders)
  const hits: SearchHit[] = []

  for (const folder of folders) {
    const score = Math.max(fuzzyScore(q, folder.name), fuzzyScore(q, folder.path) * 0.85)
    if (score <= 0) continue
    hits.push({
      id: `folder:${folder.path}`,
      kind: "folder",
      path: folder.path,
      title: folder.name,
      score,
    })
  }

  for (const file of files) {
    const nameScore = Math.max(fuzzyScore(q, file.name), fuzzyScore(q, file.path) * 0.9)
    if (nameScore > 0) {
      hits.push({
        id: `file:${file.path}`,
        kind: "file",
        path: file.path,
        title: file.name,
        score: nameScore + 40,
      })
    }
    const abs = resolveSafe(file.path)
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      continue
    }
    if (stat.size > 400_000) continue
    let text: string
    try {
      text = fs.readFileSync(abs, "utf8")
    } catch {
      continue
    }
    const lower = q.toLowerCase()
    let perFile = 0
    const lines = text.split(/\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ""
      if (!line.toLowerCase().includes(lower)) continue
      perFile += 1
      hits.push({
        id: `content:${file.path}:${i + 1}`,
        kind: "content",
        path: file.path,
        title: file.name,
        score: 90 - perFile,
        snippet: snippetAround(line, q),
        line: i + 1,
      })
      if (perFile >= 3) break
    }
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return hits.slice(0, 50)
}

function collectFiles(
  node: VaultNode,
  out: { path: string; title: string; abs: string }[]
) {
  if (node.type === "file") {
    out.push({
      path: node.path,
      title: node.name,
      abs: resolveSafe(node.path),
    })
    return
  }
  for (const child of node.children ?? []) collectFiles(child, out)
}

function noteTime(abs: string, text: string) {
  const fence = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const raw = fence?.[1]?.match(
    /^date:\s*["']?(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/m
  )?.[1]
  if (raw) {
    const parsed = Date.parse(raw.replace(" ", "T"))
    if (!Number.isNaN(parsed)) return parsed
  }
  const st = fs.statSync(abs)
  return st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs
}

function buildGraph(root: VaultNode): GraphPayload {
  const files = [] as { path: string; title: string; abs: string }[]
  collectFiles(root, files)

  const loaded = files.map((file) => {
    const text = fs.readFileSync(file.abs, "utf8")
    return { ...file, text, created: noteTime(file.abs, text) }
  })

  const byTitle = new Map<string, string[]>()
  const byPathNoExt = new Map<string, string>()

  for (const file of loaded) {
    const noExt = file.path.replace(/\.md$/, "")
    byPathNoExt.set(noExt.toLowerCase(), file.path)
    byPathNoExt.set(path.basename(noExt).toLowerCase(), file.path)
    const key = file.title.toLowerCase()
    const list = byTitle.get(key) ?? []
    list.push(file.path)
    byTitle.set(key, list)
  }

  function resolveTarget(raw: string) {
    const target = raw.trim().replace(/\\/g, "/")
    const lower = target.toLowerCase()
    return (
      byPathNoExt.get(lower) ??
      byPathNoExt.get(`${lower}.md`) ??
      byTitle.get(lower)?.[0] ??
      null
    )
  }

  const edges: GraphPayload["edges"] = []
  const seen = new Set<string>()

  for (const file of loaded) {
    wikiLink.lastIndex = 0
    for (const match of file.text.matchAll(wikiLink)) {
      const dest = resolveTarget(match[1] ?? "")
      if (!dest || dest === file.path) continue
      const key = `${file.path}\0${dest}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ source: file.path, target: dest })
    }
  }

  return {
    nodes: loaded.map((file) => ({
      id: file.path,
      title: file.title,
      path: file.path,
      created: file.created,
    })),
    edges,
  }
}

function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://wiki-web.local")
  const route = url.pathname.replace(/\/$/, "") || "/"

  try {
    if (route === "/api/vault/tree") {
      const tree = walk(vaultRoot, "")
      sendJson(res, tree ?? { name: "Vault", path: "", abs: vaultRoot, type: "folder", children: [] })
      return
    }

    if (route === "/api/vault/file" && req.method === "PUT") {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            path?: string
            content?: string
          }
          const rel = (body.path ?? "").replaceAll("\\", "/")
          if (!rel || typeof body.content !== "string") {
            sendJson(res, { error: "missing path or content" }, 400)
            return
          }
          const abs = resolveSafe(rel)
          if (!abs.endsWith(".md")) {
            sendJson(res, { error: "not a note" }, 400)
            return
          }
          fs.mkdirSync(path.dirname(abs), { recursive: true })
          fs.writeFileSync(abs, body.content, "utf8")
          sendJson(res, { path: toPosix(rel), ok: true })
        } catch (error) {
          sendJson(
            res,
            { error: error instanceof Error ? error.message : "save failed" },
            500
          )
        }
      })
      return
    }

    if (route === "/api/vault/file") {
      const rel = url.searchParams.get("path")
      if (!rel) {
        sendJson(res, { error: "missing path" }, 400)
        return
      }
      const abs = resolveSafe(rel)
      if (!abs.endsWith(".md") || !fs.existsSync(abs)) {
        sendJson(res, { error: "not found" }, 404)
        return
      }
      sendJson(res, {
        path: toPosix(rel),
        title: path.basename(rel, ".md"),
        content: fs.readFileSync(abs, "utf8"),
      })
      return
    }

    if (route === "/api/vault/search") {
      const q = url.searchParams.get("q") ?? ""
      sendJson(res, { hits: searchVault(q) })
      return
    }

    if (route === "/api/vault/graph") {
      const tree = walk(vaultRoot, "")
      sendJson(res, buildGraph(tree ?? { name: "Vault", path: "", abs: vaultRoot, type: "folder", children: [] }))
      return
    }

    if (route === "/api/vault/create" && req.method === "POST") {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            kind?: string
            name?: string
          }
          const raw = (body.name ?? "").replaceAll("\\", "/").replace(/^\/+/, "")
          const parts = raw.split("/").filter(Boolean)
          if (
            parts.length === 0 ||
            parts.some((part) => part === ".." || part === "." || part.startsWith("."))
          ) {
            sendJson(res, { error: "invalid name" }, 400)
            return
          }
          if (body.kind === "folder") {
            const rel = parts.join("/")
            fs.mkdirSync(resolveSafe(rel), { recursive: true })
            sendJson(res, { path: rel, kind: "folder" })
            return
          }
          const fileName = parts[parts.length - 1].endsWith(".md")
            ? parts[parts.length - 1]
            : `${parts[parts.length - 1]}.md`
          const rel = [...parts.slice(0, -1), fileName].join("/")
          const abs = resolveSafe(rel)
          if (fs.existsSync(abs)) {
            sendJson(res, { error: "already exists" }, 409)
            return
          }
          fs.mkdirSync(path.dirname(abs), { recursive: true })
          const title = fileName.replace(/\.md$/, "")
          fs.writeFileSync(abs, `# ${title}\n`, "utf8")
          sendJson(res, { path: rel, kind: "file" })
        } catch (error) {
          sendJson(
            res,
            { error: error instanceof Error ? error.message : "create failed" },
            500
          )
        }
      })
      return
    }

    sendJson(res, { error: "not found" }, 404)
  } catch (error) {
    sendJson(
      res,
      { error: error instanceof Error ? error.message : "vault error" },
      500
    )
  }
}

export function vaultPlugin(): Plugin {
  return {
    name: "wiki-web-vault",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/vault")) {
          next()
          return
        }
        handle(req, res)
      })
    },
  }
}
