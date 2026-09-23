import { create } from "zustand"
import { persist } from "zustand/middleware"

import { GRAPH_TAB } from "@/lib/types"

export const SPLIT_PREFIX = "__split__"

export function isSplitId(id: string) {
  return id.startsWith(SPLIT_PREFIX)
}

export type SplitTab = {
  n: number
  left: string
  right: string
}

type TabState = {
  tabPaths: string[]
  active: string | null
  graphOpen: boolean
  splits: Record<string, SplitTab>
  splitSeq: number
  openTab: (path: string) => void
  openSplit: (left: string, right: string) => string
  closeTab: (path: string) => void
  closeSplitPane: (splitId: string, side: "left" | "right") => void
  setActive: (path: string | null) => void
  setGraphOpen: (open: boolean) => void
}

function nextActive(
  tabPaths: string[],
  closing: string,
  remaining: string[],
  graphOpen: boolean,
  active: string | null
) {
  if (active !== closing) return active
  const idx = tabPaths.indexOf(closing)
  return remaining[idx] ?? remaining[idx - 1] ?? (graphOpen ? GRAPH_TAB : null)
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabPaths: [],
      active: null,
      graphOpen: false,
      splits: {},
      splitSeq: 0,
      openTab: (path) => {
        const { tabPaths } = get()
        set({
          tabPaths: tabPaths.includes(path) ? tabPaths : [...tabPaths, path],
          active: path,
        })
      },
      openSplit: (left, right) => {
        const { tabPaths, splits, splitSeq } = get()
        const n = splitSeq + 1
        const id = `${SPLIT_PREFIX}${n}`
        set({
          splitSeq: n,
          splits: { ...splits, [id]: { n, left, right } },
          tabPaths: [...tabPaths, id],
          active: id,
        })
        return id
      },
      closeTab: (path) => {
        const { tabPaths, active, graphOpen, splits } = get()
        const next = tabPaths.filter((p) => p !== path)
        const nextSplits = { ...splits }
        delete nextSplits[path]
        set({
          tabPaths: next,
          splits: nextSplits,
          active: nextActive(tabPaths, path, next, graphOpen, active),
        })
      },
      closeSplitPane: (splitId, side) => {
        const { tabPaths, splits } = get()
        const split = splits[splitId]
        if (!split) return
        const leftover = side === "left" ? split.right : split.left
        const nextSplits = { ...splits }
        delete nextSplits[splitId]
        if (tabPaths.includes(leftover)) {
          set({
            tabPaths: tabPaths.filter((p) => p !== splitId),
            splits: nextSplits,
            active: leftover,
          })
          return
        }
        set({
          tabPaths: tabPaths.map((p) => (p === splitId ? leftover : p)),
          splits: nextSplits,
          active: leftover,
        })
      },
      setActive: (path) => set({ active: path }),
      setGraphOpen: (open) => {
        const { active, tabPaths } = get()
        set({
          graphOpen: open,
          active: open
            ? GRAPH_TAB
            : active === GRAPH_TAB
              ? (tabPaths[0] ?? null)
              : active,
        })
      },
    }),
    {
      name: "wiki-web-tabs",
      version: 2,
      partialize: (state) => ({
        tabPaths: state.tabPaths,
        active: state.active,
        graphOpen: state.graphOpen,
        splits: state.splits,
        splitSeq: state.splitSeq,
      }),
      merge: (persisted, current) => {
        const extra = (persisted ?? {}) as Partial<TabState>
        return {
          ...current,
          ...extra,
          splits: extra.splits ?? {},
          splitSeq: extra.splitSeq ?? 0,
        }
      },
    }
  )
)

export function notePathsInTabs(
  tabPaths: string[],
  splits: Record<string, SplitTab>
): string[] {
  const out: string[] = []
  for (const id of tabPaths) {
    if (isSplitId(id)) {
      const split = splits[id]
      if (split) {
        out.push(split.left, split.right)
      }
      continue
    }
    out.push(id)
  }
  return [...new Set(out)]
}
