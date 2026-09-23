import { useRef, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"

export function NoteEditor({
  value,
  dirty,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  value: string
  dirty: boolean
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      if (dirty && !saving) onSave()
      return
    }
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
    event.preventDefault()
    const area = areaRef.current
    if (!area) return
    const start = area.selectionStart
    const end = area.selectionEnd
    const next = `${value.slice(0, start)}  ${value.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      area.selectionStart = start + 2
      area.selectionEnd = start + 2
    })
  }

  return (
    <div className="wiki-editor">
      <div className="wiki-editor-bar">
        <span className="wiki-editor-hint">
          {saving ? "Saving..." : dirty ? "Unsaved markdown" : "Markdown source"}
        </span>
        <div className="wiki-editor-actions">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!dirty || saving}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={!dirty || saving}
            onClick={onSave}
          >
            Save
          </Button>
        </div>
      </div>
      <textarea
        ref={areaRef}
        className="wiki-editor-input"
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
