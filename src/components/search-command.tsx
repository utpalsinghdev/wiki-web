import { useEffect, useMemo, useRef, useState } from "react"
import { FileTextIcon, FolderIcon } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SearchHit } from "@/lib/types"
import { searchVault } from "@/lib/vault-api"

function moveSelection(root: HTMLElement, delta: 1 | -1) {
  const items = [...root.querySelectorAll<HTMLElement>("[data-slot=command-item]")]
  if (items.length === 0) return
  const current = items.findIndex((el) => el.getAttribute("data-selected") === "true")
  const next = items[(current + delta + items.length) % items.length]
  next?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }))
}

export function SearchCommand({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (hit: SearchHit) => void
}) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const seq = useRef(0)

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery("")
        setHits([])
        setStatus("idle")
      })
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length === 0) {
      queueMicrotask(() => {
        setHits([])
        setStatus("idle")
      })
      return
    }
    const id = ++seq.current
    queueMicrotask(() => setStatus("loading"))
    const timer = window.setTimeout(() => {
      void searchVault(q)
        .then((next) => {
          if (seq.current !== id) return
          setHits(next)
          setStatus("idle")
        })
        .catch(() => {
          if (seq.current !== id) return
          setHits([])
          setStatus("error")
        })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [open, query])

  const names = useMemo(
    () => hits.filter((hit) => hit.kind === "file" || hit.kind === "folder"),
    [hits]
  )
  const contents = useMemo(
    () => hits.filter((hit) => hit.kind === "content"),
    [hits]
  )

  function pick(hit: SearchHit) {
    onSelect(hit)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search vault</DialogTitle>
        <DialogDescription>Find notes and folders by name or content</DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        className="wiki-search-dialog top-[18%] translate-y-0 overflow-hidden rounded-xl p-0 sm:max-w-xl"
      >
        <Command
          shouldFilter={false}
          className="wiki-search max-h-[min(80vh,32rem)]"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              const input = event.currentTarget.querySelector("input")
              if (input instanceof HTMLInputElement && input.selectionStart !== input.value.length) {
                return
              }
              event.preventDefault()
              moveSelection(event.currentTarget, 1)
            }
            if (event.key === "ArrowLeft") {
              const input = event.currentTarget.querySelector("input")
              if (input instanceof HTMLInputElement && input.selectionStart !== 0) {
                return
              }
              event.preventDefault()
              moveSelection(event.currentTarget, -1)
            }
          }}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search files, folders, and note text..."
          />
          <CommandList>
            {hits.length === 0 ? (
              <CommandEmpty>
                {status === "loading"
                  ? "Searching..."
                  : status === "error"
                    ? "Search failed."
                    : query.trim()
                      ? "No matches."
                      : "Type to search the vault."}
              </CommandEmpty>
            ) : null}
            {names.length > 0 ? (
              <CommandGroup heading="Names">
                {names.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={hit.id}
                    onSelect={() => pick(hit)}
                  >
                    {hit.kind === "folder" ? <FolderIcon /> : <FileTextIcon />}
                    <span className="min-w-0 truncate">{hit.title}</span>
                    <span className="ml-auto min-w-0 max-w-[55%] truncate text-xs text-muted-foreground">
                      {hit.path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {contents.length > 0 ? (
              <CommandGroup heading="In notes">
                {contents.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={hit.id}
                    onSelect={() => pick(hit)}
                  >
                    <FileTextIcon />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {hit.title}
                        {hit.line != null ? (
                          <span className="text-muted-foreground">:{hit.line}</span>
                        ) : null}
                      </span>
                      {hit.snippet ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {hit.snippet}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
