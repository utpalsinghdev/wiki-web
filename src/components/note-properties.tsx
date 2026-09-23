import {
  CalendarIcon,
  CircleDotIcon,
  ClockIcon,
  HashIcon,
  ListIcon,
  Settings2Icon,
  TypeIcon,
} from "lucide-react"

import type { Frontmatter, PropertyValue } from "@/lib/frontmatter"

const ICONS: Record<string, typeof TypeIcon> = {
  title: TypeIcon,
  date: CalendarIcon,
  created: CalendarIcon,
  updated: CalendarIcon,
  deadline: ClockIcon,
  status: CircleDotIcon,
  mode: Settings2Icon,
  tags: HashIcon,
  aliases: ListIcon,
  cssclasses: ListIcon,
}

function values(value: PropertyValue): string[] {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  return [value]
}

export function NoteProperties({ meta }: { meta: Frontmatter }) {
  const entries = Object.entries(meta)
  if (entries.length === 0) return null

  return (
    <div className="wiki-props">
      {entries.map(([key, value]) => {
        const Icon = ICONS[key] ?? ListIcon
        const items = values(value)
        return (
          <div key={key} className="wiki-prop">
            <span className="wiki-prop-key">
              <Icon className="size-3.5 shrink-0 opacity-80" />
              {key}
            </span>
            <span className="wiki-prop-val">
              {key === "tags"
                ? items.map((tag) => (
                    <span key={tag} className="wiki-tag">
                      {tag}
                    </span>
                  ))
                : items.join(", ")}
            </span>
          </div>
        )
      })}
    </div>
  )
}
