import { useState, type ReactNode } from "react"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"
import { toast } from "sonner"

import { ConvertPdfDialog } from "@/components/convert-pdf-dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import type { VaultNode } from "@/lib/types"
import { cn } from "@/lib/utils"

function matchesQuery(node: VaultNode, query: string): boolean {
  if (!query) return true
  if (node.name.toLowerCase().includes(query)) return true
  return (node.children ?? []).some((child) => matchesQuery(child, query))
}

function copyPath(path: string) {
  const fallback = () => {
    const el = document.createElement("textarea")
    el.value = path
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    el.remove()
    toast.success("Copied path")
  }
  if (!navigator.clipboard?.writeText) {
    fallback()
    return
  }
  void navigator.clipboard.writeText(path).then(() => toast.success("Copied path")).catch(fallback)
}

function NodeMenu({
  path,
  kind,
  onConvertPdf,
  onSplit,
  children,
}: {
  path: string
  kind: "file" | "folder"
  onConvertPdf?: () => void
  onSplit?: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="block w-full" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copyPath(path)}>Copy path</ContextMenuItem>
        {kind === "file" && onSplit ? (
          <ContextMenuItem onClick={onSplit}>Open in split</ContextMenuItem>
        ) : null}
        {kind === "file" && onConvertPdf ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onConvertPdf}>Convert to PDF</ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function TreeItem({
  node,
  query,
  activePaths,
  revealPath,
  onOpen,
  onConvertPdf,
  onSplit,
  splitFromPath,
}: {
  node: VaultNode
  query: string
  activePaths: string[]
  revealPath: string | null
  onOpen: (path: string) => void
  onConvertPdf: (path: string) => void
  onSplit?: (path: string) => void
  splitFromPath?: string | null
}) {
  const inReveal = Boolean(
    revealPath && (revealPath === node.path || revealPath.startsWith(`${node.path}/`))
  )
  const [open, setOpen] = useState(false)
  const expanded = open || inReveal

  if (!matchesQuery(node, query)) return null

  if (node.type === "file") {
    return (
      <SidebarMenuItem>
        <NodeMenu
          path={node.abs}
          kind="file"
          onConvertPdf={() => onConvertPdf(node.path)}
          onSplit={
            onSplit && splitFromPath && splitFromPath !== node.path
              ? () => onSplit(node.path)
              : undefined
          }
        >
          <SidebarMenuButton
            size="sm"
            isActive={activePaths.includes(node.path)}
            onClick={() => onOpen(node.path)}
          >
            <FileTextIcon />
            <span>{node.name}</span>
          </SidebarMenuButton>
        </NodeMenu>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible open={expanded} onOpenChange={setOpen} className="w-full">
        <NodeMenu path={node.abs} kind="folder">
          <CollapsibleTrigger
            render={<SidebarMenuButton size="sm" className="w-full" />}
          >
            <ChevronRightIcon
              className={cn("transition-transform", expanded && "rotate-90")}
            />
            <FolderIcon />
            <span>{node.name}</span>
          </CollapsibleTrigger>
        </NodeMenu>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {(node.children ?? []).map((child) => (
              <TreeItem
                key={child.path || child.name}
                node={child}
                query={query}
                activePaths={activePaths}
                revealPath={revealPath}
                onOpen={onOpen}
                onConvertPdf={onConvertPdf}
                onSplit={onSplit}
                splitFromPath={splitFromPath}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

export function FileTree({
  tree,
  query,
  activePaths,
  revealPath,
  onOpen,
  onSplit,
  splitFromPath,
}: {
  tree: VaultNode
  query: string
  activePaths: string[]
  revealPath?: string | null
  onOpen: (path: string) => void
  onSplit?: (path: string) => void
  splitFromPath?: string | null
}): ReactNode {
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  return (
    <>
      <SidebarMenu>
        {(tree.children ?? []).map((child) => (
          <TreeItem
            key={child.path || child.name}
            node={child}
            query={query.trim().toLowerCase()}
            activePaths={activePaths}
            revealPath={revealPath ?? null}
            onOpen={onOpen}
            onConvertPdf={setPdfPath}
            onSplit={onSplit}
            splitFromPath={splitFromPath}
          />
        ))}
      </SidebarMenu>
      <ConvertPdfDialog path={pdfPath} onClose={() => setPdfPath(null)} />
    </>
  )
}
