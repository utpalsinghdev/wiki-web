import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  EyeIcon,
  FilePlusIcon,
  FolderPlusIcon,
  GitForkIcon,
  PanelLeftIcon,
  PencilIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"

import { FileTree } from "@/components/file-tree"
import { EmptyCanvas } from "@/components/empty-canvas"
import { GraphView } from "@/components/graph-view"
import { NoteCanvas } from "@/components/note-canvas"
import { SearchCommand } from "@/components/search-command"
import { SplitView } from "@/components/split-view"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { GRAPH_TAB, type GraphPayload, type NoteFile, type VaultNode } from "@/lib/types"
import {
  isSplitId,
  notePathsInTabs,
  useTabStore,
} from "@/lib/tab-store"
import { cn } from "@/lib/utils"
import {
  createVaultItem,
  fetchGraph,
  fetchNote,
  fetchTree,
  flattenFiles,
  saveNote,
} from "@/lib/vault-api"
import { resolveVaultLink } from "@/lib/wikilinks"
import { toggleTaskAt } from "@/lib/tasks"
import { useDebouncedSaves } from "@/lib/use-debounced-saves"

function tabLabel(path: string, notes: Record<string, NoteFile>) {
  return notes[path]?.title ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path
}

function HeaderIcon({
  label,
  onClick,
  children,
  side = "bottom",
  disabled,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  side?: "bottom" | "right"
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 560
const SIDEBAR_DEFAULT = 260
const TAB_TRIGGER =
  "h-full max-h-none flex-none rounded-none border-0 bg-transparent px-3 text-[#9893a5] shadow-none after:hidden hover:bg-[#1a1a1a] hover:text-foreground data-active:bg-[#1e1e1e] data-active:text-foreground dark:data-active:border-transparent dark:data-active:bg-[#1e1e1e]"

export function App() {
  const [tree, setTree] = useState<VaultNode | null>(null)
  const [query] = useState("")
  const tabPaths = useTabStore((s) => s.tabPaths)
  const active = useTabStore((s) => s.active)
  const graphOpen = useTabStore((s) => s.graphOpen)
  const openTab = useTabStore((s) => s.openTab)
  const openSplit = useTabStore((s) => s.openSplit)
  const closeStoredTab = useTabStore((s) => s.closeTab)
  const closeSplitPane = useTabStore((s) => s.closeSplitPane)
  const setActive = useTabStore((s) => s.setActive)
  const setGraphOpen = useTabStore((s) => s.setGraphOpen)
  const splits = useTabStore((s) => s.splits)
  const [notes, setNotes] = useState<Record<string, NoteFile>>({})
  const [graph, setGraph] = useState<GraphPayload | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [revealPath, setRevealPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [treeEpoch, setTreeEpoch] = useState(0)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [reloading, setReloading] = useState(false)
  const [editPaths, setEditPaths] = useState<Set<string>>(() => new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingPath, setSavingPath] = useState<string | null>(null)
  const [splitFocus, setSplitFocus] = useState<Record<string, "left" | "right">>({})
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false })

  const files = useMemo(() => (tree ? flattenFiles(tree) : []), [tree])
  const activeSplit = active && isSplitId(active) ? splits[active] ?? null : null
  const focusedNotePath = activeSplit
    ? splitFocus[active ?? ""] === "right"
      ? activeSplit.right
      : activeSplit.left
    : active && active !== GRAPH_TAB && !isSplitId(active)
      ? active
      : null
  const activeNote = (focusedNotePath && notes[focusedNotePath]) || null
  const activeIsNote = Boolean(focusedNotePath) && !activeSplit
  const activePaths = activeSplit
    ? [activeSplit.left, activeSplit.right]
    : focusedNotePath
      ? [focusedNotePath]
      : []

  function displayedContent(path: string) {
    return drafts[path] ?? notes[path]?.content ?? ""
  }

  function isDirty(path: string) {
    const note = notes[path]
    if (!note) return false
    const draft = drafts[path]
    return draft !== undefined && draft !== note.content
  }

  function tabDirty(path: string) {
    if (!isSplitId(path)) return isDirty(path)
    const split = splits[path]
    return Boolean(split && (isDirty(split.left) || isDirty(split.right)))
  }

  function toggleEditPath(path: string) {
    setEditPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleEdit() {
    if (!focusedNotePath) return
    toggleEditPath(focusedNotePath)
  }

  async function saveDraft(path: string) {
    const note = notes[path]
    const content = drafts[path]
    if (!note || content === undefined || content === note.content || savingPath === path) return
    setSavingPath(path)
    setError(null)
    try {
      await saveNote(path, content)
      setNotes((current) => ({
        ...current,
        [path]: { ...note, content },
      }))
      setDrafts((current) => {
        const next = { ...current }
        delete next[path]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed")
    } finally {
      setSavingPath(null)
    }
  }

  function discardDraft(path: string) {
    setDrafts((current) => {
      const next = { ...current }
      delete next[path]
      return next
    })
  }

  const queueSave = useDebouncedSaves((path, content) => {
    void saveNote(path, content).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "save failed")
    })
  }, 450)

  const reloadTree = useCallback(async () => {
    const next = await fetchTree()
    setTree(next)
  }, [])

  const reloadVault = useCallback(async () => {
    setReloading(true)
    setError(null)
    try {
      await reloadTree()
      const { tabPaths: openPaths, graphOpen: graphIsOpen, splits: openSplits } = useTabStore.getState()
      const notePaths = notePathsInTabs(openPaths, openSplits)
      if (notePaths.length > 0) {
        const loaded = await Promise.all(
          notePaths.map((path) => fetchNote(path).catch(() => null))
        )
        setNotes((current) => {
          const next = { ...current }
          for (const note of loaded) {
            if (note) next[note.path] = note
          }
          return next
        })
        const failed = new Set(
          notePaths.filter((_, i) => !loaded[i])
        )
        for (const path of openPaths) {
          if (isSplitId(path)) {
            const split = openSplits[path]
            if (!split || failed.has(split.left) || failed.has(split.right)) {
              closeStoredTab(path)
            }
            continue
          }
          if (failed.has(path)) closeStoredTab(path)
        }
      }
      if (graphIsOpen) {
        setGraph(await fetchGraph())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "reload failed")
    } finally {
      setReloading(false)
    }
  }, [closeStoredTab, reloadTree])

  const openNote = useCallback(
    async (path: string) => {
      if (path === GRAPH_TAB) {
        setGraphOpen(true)
        return
      }
      if (isSplitId(path)) {
        setActive(path)
        return
      }
      openTab(path)
      if (notes[path]) return
      try {
        const note = await fetchNote(path)
        setNotes((current) => ({ ...current, [path]: note }))
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to load note")
      }
    },
    [notes, openTab, setActive, setGraphOpen]
  )

  async function ensureNote(path: string) {
    if (notes[path]) return
    const note = await fetchNote(path)
    setNotes((current) => ({ ...current, [path]: note }))
  }

  async function openInSplit(rightPath: string) {
    const leftPath = focusedNotePath
    if (!leftPath || leftPath === rightPath) return
    try {
      await Promise.all([ensureNote(leftPath), ensureNote(rightPath)])
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load note")
      return
    }
    const id = openSplit(leftPath, rightPath)
    setSplitFocus((current) => ({ ...current, [id]: "right" }))
  }

  const openWiki = useCallback(
    (target: string, fromPath?: string) => {
      const match = resolveVaultLink(target, fromPath ?? activeNote?.path ?? "", files)
      if (!match) {
        setError(`No note for [[${target}]]`)
        return
      }
      void openNote(match)
    },
    [activeNote?.path, files, openNote]
  )

  function toggleTask(path: string, index: number, checked: boolean) {
    const note = notes[path]
    const base = displayedContent(path)
    if (!base) return
    const content = toggleTaskAt(base, index, checked)
    const changed = content !== base
    if (!changed) return
    if (isDirty(path) || drafts[path] !== undefined) {
      setDrafts((current) => ({ ...current, [path]: content }))
      return
    }
    if (!note) return
    queueSave(path, content)
    setNotes((current) => ({ ...current, [path]: { ...note, content } }))
  }

  function pathStillOpen(path: string, exceptSplitId?: string) {
    const { tabPaths: openPaths, splits: openSplits } = useTabStore.getState()
    for (const id of openPaths) {
      if (id === exceptSplitId) continue
      if (id === path) return true
      const split = openSplits[id]
      if (split && (split.left === path || split.right === path)) return true
    }
    return false
  }

  function closeTab(path: string) {
    if (path === GRAPH_TAB) {
      setGraphOpen(false)
      setGraph(null)
      return
    }
    if (isSplitId(path)) {
      closeStoredTab(path)
      setSplitFocus((current) => {
        const next = { ...current }
        delete next[path]
        return next
      })
      return
    }
    closeStoredTab(path)
    discardDraft(path)
    setEditPaths((current) => {
      const next = new Set(current)
      next.delete(path)
      return next
    })
  }

  function closePane(splitId: string, side: "left" | "right") {
    const split = splits[splitId]
    if (!split) return
    const closed = side === "left" ? split.left : split.right
    closeSplitPane(splitId, side)
    setSplitFocus((current) => {
      const next = { ...current }
      delete next[splitId]
      return next
    })
    if (!pathStillOpen(closed, splitId)) {
      discardDraft(closed)
      setEditPaths((current) => {
        const next = new Set(current)
        next.delete(closed)
        return next
      })
    }
  }

  function onTabAuxClick(event: ReactMouseEvent, path: string) {
    if (event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    closeTab(path)
  }

  function blockMiddleAutoscroll(event: ReactMouseEvent) {
    if (event.button === 1) event.preventDefault()
  }

  function collapseAll() {
    setRevealPath(null)
    setTreeEpoch((value) => value + 1)
  }

  function onResizeSidebar(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = sidebarWidth

    function onMove(next: PointerEvent) {
      const width = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, startWidth + next.clientX - startX)
      )
      setSidebarWidth(width)
    }
    function onUp(next: PointerEvent) {
      handle.releasePointerCapture(next.pointerId)
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
  }

  async function onCreate(kind: "file" | "folder") {
    const name = window.prompt(kind === "file" ? "Note name" : "Folder name")
    if (!name?.trim()) return
    try {
      const created = await createVaultItem(kind, name.trim())
      await reloadTree()
      if (created.kind === "file") void openNote(created.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed")
    }
  }

  useEffect(() => {
    void Promise.resolve().then(reloadTree).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "vault load failed")
    })
  }, [reloadTree])

  useEffect(() => {
    let cancelled = false
    const missing = notePathsInTabs(tabPaths, splits).filter((path) => !notes[path])
    if (missing.length === 0) return
    void Promise.all(
      missing.map((path) => fetchNote(path).catch(() => null))
    ).then((loaded) => {
      if (cancelled) return
      setNotes((current) => {
        const next = { ...current }
        for (const note of loaded) {
          if (note) next[note.path] = note
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // notes omitted on purpose: openNote fills cache; this only backfills persisted paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabPaths, splits])

  useEffect(() => {
    if (!graphOpen || graph) return
    let cancelled = false
    fetchGraph()
      .then((next) => {
        if (!cancelled) setGraph(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "graph load failed")
      })
    return () => {
      cancelled = true
    }
  }, [graphOpen, graph])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        if (!focusedNotePath) return
        event.preventDefault()
        void saveDraft(focusedNotePath)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        if (!focusedNotePath) return
        if (event.shiftKey || event.altKey) return
        event.preventDefault()
        toggleEdit()
        return
      }
      if (event.key.toLowerCase() !== "k") return
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
      event.preventDefault()
      setSearchOpen((open) => !open)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focusedNotePath, drafts, notes, savingPath])

  const hasTabs = graphOpen || tabPaths.length > 0
  const tabValue = active ?? (graphOpen ? GRAPH_TAB : tabPaths[0] ?? "")

  const updateTabOverflow = useCallback(() => {
    const el = tabStripRef.current
    if (!el) return
    setTabOverflow({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const el = tabStripRef.current
    if (!el) return
    updateTabOverflow()
    el.addEventListener("scroll", updateTabOverflow, { passive: true })
    const observer = new ResizeObserver(updateTabOverflow)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", updateTabOverflow)
      observer.disconnect()
    }
  }, [updateTabOverflow, tabPaths, graphOpen, hasTabs])

  function scrollTabs(direction: -1 | 1) {
    const el = tabStripRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(180, el.clientWidth * 0.7), behavior: "smooth" })
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <div className="flex h-svh w-full">
        <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#333] bg-[#161616] py-2">
          <img
            src="/wiki-web-icon.png"
            alt="Wiki-Web"
            className="mb-1 size-6 rounded-[5px]"
          />
          <HeaderIcon
            label={explorerOpen ? "Hide sidebar" : "Show sidebar"}
            side="right"
            onClick={() => setExplorerOpen((open) => !open)}
          >
            <PanelLeftIcon />
          </HeaderIcon>
          <HeaderIcon
            label="Graph view"
            side="right"
            onClick={() => {
              void openNote(GRAPH_TAB)
            }}
          >
            <GitForkIcon />
          </HeaderIcon>
          <HeaderIcon
            label="Reload vault"
            side="right"
            disabled={reloading}
            onClick={() => void reloadVault()}
          >
            <RefreshCwIcon className={reloading ? "animate-spin" : undefined} />
          </HeaderIcon>
        </aside>

        <aside
          className="relative h-full shrink-0 overflow-hidden border-r border-solid border-[#333] bg-[#161616] transition-[width] duration-200 ease-out"
          style={{
            width: explorerOpen ? sidebarWidth : 0,
            borderRightWidth: explorerOpen ? 1 : 0,
            pointerEvents: explorerOpen ? "auto" : "none",
          }}
        >
          <div className="flex h-full flex-col" style={{ width: sidebarWidth }}>
            <div className="flex items-center justify-end px-1 py-1">
              <HeaderIcon label="New note" onClick={() => void onCreate("file")}>
                <FilePlusIcon />
              </HeaderIcon>
              <HeaderIcon label="New folder" onClick={() => void onCreate("folder")}>
                <FolderPlusIcon />
              </HeaderIcon>
              <HeaderIcon label="Collapse all" onClick={collapseAll}>
                <ChevronsDownUpIcon />
              </HeaderIcon>
            </div>
            <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
              <SidebarGroupContent className="h-full min-h-0">
                <ScrollArea className="h-full">
                  {tree ? (
                    <FileTree
                      key={treeEpoch}
                      tree={tree}
                      query={query}
                      activePaths={activePaths}
                      revealPath={revealPath}
                      splitFromPath={focusedNotePath}
                      onOpen={(path) => {
                        void openNote(path)
                      }}
                      onSplit={(path) => {
                        void openInSplit(path)
                      }}
                    />
                  ) : (
                    <p className="px-2 text-xs text-muted-foreground">Loading vault...</p>
                  )}
                </ScrollArea>
              </SidebarGroupContent>
            </SidebarGroup>
            {explorerOpen ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                className="absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize hover:bg-[#7f6df2]"
                onPointerDown={onResizeSidebar}
              />
            ) : null}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 bg-background">
          {hasTabs ? (
            <Tabs
              value={tabValue}
              onValueChange={(value) => {
                if (typeof value !== "string") return
                if (value === GRAPH_TAB) setGraphOpen(true)
                else setActive(value)
              }}
              className="flex h-full min-h-0 flex-col gap-0"
            >
              <div className="wiki-tabbar flex items-center">
                <HeaderIcon
                  label="Scroll tabs left"
                  disabled={!tabOverflow.left}
                  onClick={() => scrollTabs(-1)}
                >
                  <ChevronLeftIcon />
                </HeaderIcon>
                <div ref={tabStripRef} className="min-w-0 flex-1 overflow-x-auto">
                <TabsList
                  variant="line"
                  className="h-9 w-max min-w-full justify-start gap-0 overflow-visible rounded-none bg-[#161616] p-0"
                >
                  {graphOpen ? (
                    <TabsTrigger
                      value={GRAPH_TAB}
                      className={cn(TAB_TRIGGER, "max-w-48")}
                      onMouseDown={blockMiddleAutoscroll}
                      onAuxClick={(event) => onTabAuxClick(event, GRAPH_TAB)}
                    >
                      Graph
                      <span
                        className="inline-flex"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          closeTab(GRAPH_TAB)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <XIcon className="size-3.5 opacity-60 hover:opacity-100" />
                      </span>
                    </TabsTrigger>
                  ) : null}
                  {tabPaths.map((path) => (
                    <TabsTrigger
                      key={path}
                      value={path}
                      className={cn(TAB_TRIGGER, "max-w-56")}
                      onMouseDown={blockMiddleAutoscroll}
                      onAuxClick={(event) => onTabAuxClick(event, path)}
                    >
                      <span className="truncate">
                        {isSplitId(path)
                          ? `Split ${splits[path]?.n ?? ""}`.trim()
                          : tabLabel(path, notes)}
                      </span>
                      {tabDirty(path) ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-[#7f6df2]" />
                      ) : null}
                      <span
                        className="inline-flex"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          closeTab(path)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <XIcon className="size-3.5 opacity-60 hover:opacity-100" />
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                </div>
                <HeaderIcon
                  label="Scroll tabs right"
                  disabled={!tabOverflow.right}
                  onClick={() => scrollTabs(1)}
                >
                  <ChevronRightIcon />
                </HeaderIcon>
                {activeIsNote ? (
                  <div className="flex shrink-0 items-center pr-1">
                    <HeaderIcon
                      label={
                        focusedNotePath && editPaths.has(focusedNotePath)
                          ? "Preview note"
                          : "Edit markdown"
                      }
                      onClick={toggleEdit}
                    >
                      {focusedNotePath && editPaths.has(focusedNotePath) ? <EyeIcon /> : <PencilIcon />}
                    </HeaderIcon>
                  </div>
                ) : null}
              </div>
              {graphOpen ? (
                <TabsContent value={GRAPH_TAB} className="min-h-0 overflow-hidden bg-background">
                  {graph ? (
                    <GraphView graph={graph} activePath={activeNote?.path ?? null} onOpen={(path) => void openNote(path)} />
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">Loading graph...</p>
                  )}
                </TabsContent>
              ) : null}
              {tabPaths.map((path) => {
                const split = isSplitId(path) ? splits[path] : null
                return (
                <TabsContent
                  key={path}
                  value={path}
                  className={cn(
                    "min-h-0 bg-background",
                    split || editPaths.has(path) ? "overflow-hidden" : "overflow-auto"
                  )}
                >
                  {split ? (
                    <SplitView
                      left={{
                        path: split.left,
                        title: tabLabel(split.left, notes),
                        content: displayedContent(split.left),
                        editing: editPaths.has(split.left),
                        dirty: isDirty(split.left),
                        saving: savingPath === split.left,
                        focused: splitFocus[path] !== "right",
                        onFocus: () => setSplitFocus((current) => ({ ...current, [path]: "left" })),
                        onClose: () => closePane(path, "left"),
                        onToggleEdit: () => toggleEditPath(split.left),
                        onChange: (content) =>
                          setDrafts((current) => ({ ...current, [split.left]: content })),
                        onSave: () => void saveDraft(split.left),
                        onDiscard: () => discardDraft(split.left),
                        onWikiLink: openWiki,
                        onToggleTask: toggleTask,
                      }}
                      right={{
                        path: split.right,
                        title: tabLabel(split.right, notes),
                        content: displayedContent(split.right),
                        editing: editPaths.has(split.right),
                        dirty: isDirty(split.right),
                        saving: savingPath === split.right,
                        focused: splitFocus[path] === "right",
                        onFocus: () => setSplitFocus((current) => ({ ...current, [path]: "right" })),
                        onClose: () => closePane(path, "right"),
                        onToggleEdit: () => toggleEditPath(split.right),
                        onChange: (content) =>
                          setDrafts((current) => ({ ...current, [split.right]: content })),
                        onSave: () => void saveDraft(split.right),
                        onDiscard: () => discardDraft(split.right),
                        onWikiLink: openWiki,
                        onToggleTask: toggleTask,
                      }}
                    />
                  ) : notes[path] ? (
                    <NoteCanvas
                      path={path}
                      content={displayedContent(path)}
                      editing={editPaths.has(path)}
                      dirty={isDirty(path)}
                      saving={savingPath === path}
                      onChange={(content) =>
                        setDrafts((current) => ({ ...current, [path]: content }))
                      }
                      onSave={() => void saveDraft(path)}
                      onDiscard={() => discardDraft(path)}
                      onWikiLink={openWiki}
                      onToggleTask={toggleTask}
                    />
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">Loading note...</p>
                  )}
                </TabsContent>
                )
              })}
            </Tabs>
          ) : (
            <EmptyCanvas />
          )}
          {error ? (
            <div className="absolute right-3 bottom-3 rounded-md border bg-background px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </main>
      </div>

      <SearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(hit) => {
          setRevealPath(hit.path)
          if (hit.kind !== "folder") void openNote(hit.path)
        }}
      />
    </SidebarProvider>
  )
}

export default App
