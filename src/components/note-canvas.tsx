import type { ReactNode } from "react"

import { MarkdownView } from "@/components/markdown-view"
import { NoteEditor } from "@/components/note-editor"

export function NoteCanvas({
  path,
  content,
  editing,
  dirty,
  saving,
  onChange,
  onSave,
  onDiscard,
  onWikiLink,
  onToggleTask,
}: {
  path: string
  content: string
  editing: boolean
  dirty: boolean
  saving: boolean
  onChange: (content: string) => void
  onSave: () => void
  onDiscard: () => void
  onWikiLink: (target: string, fromPath: string) => void
  onToggleTask: (path: string, index: number, checked: boolean) => void
}): ReactNode {
  if (editing) {
    return (
      <NoteEditor
        value={content}
        dirty={dirty}
        saving={saving}
        onChange={onChange}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    )
  }
  return (
    <MarkdownView
      content={content}
      onWikiLink={(target) => onWikiLink(target, path)}
      onToggleTask={(index, checked) => onToggleTask(path, index, checked)}
    />
  )
}
