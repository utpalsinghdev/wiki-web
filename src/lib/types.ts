export type VaultNode = {
  name: string
  path: string
  abs: string
  type: "file" | "folder"
  children?: VaultNode[]
}

export type NoteFile = {
  path: string
  title: string
  content: string
}

export type SearchHit = {
  id: string
  kind: "file" | "folder" | "content"
  path: string
  title: string
  score: number
  snippet?: string
  line?: number
}

export type GraphPayload = {
  nodes: { id: string; title: string; path: string; created?: number }[]
  edges: { source: string; target: string }[]
}

export const GRAPH_TAB = "__graph__"
