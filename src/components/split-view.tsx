import { EyeIcon, PencilIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

import { NoteCanvas } from "@/components/note-canvas"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/lib/utils"

type PaneProps = {
  path: string
  title: string
  content: string
  editing: boolean
  dirty: boolean
  saving: boolean
  focused: boolean
  onFocus: () => void
  onClose: () => void
  onToggleEdit: () => void
  onChange: (content: string) => void
  onSave: () => void
  onDiscard: () => void
  onWikiLink: (target: string, fromPath: string) => void
  onToggleTask: (path: string, index: number, checked: boolean) => void
}

function SplitPane(props: PaneProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col",
        props.focused ? "bg-background" : "bg-background"
      )}
      onPointerDown={props.onFocus}
    >
      <div
        className={cn(
          "flex h-8 shrink-0 items-center gap-1 border-b px-2",
          props.focused ? "border-b-[#7f6df2]/40" : "border-border"
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {props.title}
        </span>
        {props.dirty ? <span className="size-1.5 shrink-0 rounded-full bg-[#7f6df2]" /> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={props.editing ? "Preview note" : "Edit markdown"}
          onClick={props.onToggleEdit}
        >
          {props.editing ? <EyeIcon /> : <PencilIcon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close pane"
          onClick={props.onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1",
          props.editing ? "overflow-hidden" : "overflow-auto"
        )}
      >
        <NoteCanvas
          path={props.path}
          content={props.content}
          editing={props.editing}
          dirty={props.dirty}
          saving={props.saving}
          onChange={props.onChange}
          onSave={props.onSave}
          onDiscard={props.onDiscard}
          onWikiLink={props.onWikiLink}
          onToggleTask={props.onToggleTask}
        />
      </div>
    </div>
  )
}

export function SplitView({
  left,
  right,
}: {
  left: PaneProps
  right: PaneProps
}): ReactNode {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
      <ResizablePanel defaultSize={50} minSize={22}>
        <SplitPane {...left} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={22}>
        <SplitPane {...right} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
