import type { GraphPayload, NoteFile, SearchHit, VaultNode } from "@/lib/types"

export async function fetchTree(): Promise<VaultNode> {
  const res = await fetch("/api/vault/tree", { cache: "no-store" })
  if (!res.ok) throw new Error("failed to load vault tree")
  return res.json() as Promise<VaultNode>
}

export async function fetchNote(path: string): Promise<NoteFile> {
  const res = await fetch(`/api/vault/file?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error("failed to load note")
  return res.json() as Promise<NoteFile>
}

export async function saveNote(path: string, content: string): Promise<void> {
  const res = await fetch("/api/vault/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "failed to save note")
  }
}

export async function searchVault(query: string): Promise<SearchHit[]> {
  const res = await fetch(`/api/vault/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error("search failed")
  const body = (await res.json()) as { hits?: SearchHit[] }
  return body.hits ?? []
}

export async function fetchGraph(): Promise<GraphPayload> {
  const res = await fetch("/api/vault/graph", { cache: "no-store" })
  if (!res.ok) throw new Error("failed to load graph")
  return res.json() as Promise<GraphPayload>
}

export async function createVaultItem(
  kind: "file" | "folder",
  name: string
): Promise<{ path: string; kind: string }> {
  const res = await fetch("/api/vault/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, name }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? "create failed")
  }
  return res.json() as Promise<{ path: string; kind: string }>
}

export function flattenFiles(node: VaultNode, out: VaultNode[] = []): VaultNode[] {
  if (node.type === "file") {
    out.push(node)
    return out
  }
  for (const child of node.children ?? []) flattenFiles(child, out)
  return out
}
