function blockHeight(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  return (
    el.getBoundingClientRect().height +
    (parseFloat(cs.marginTop) || 0) +
    (parseFloat(cs.marginBottom) || 0)
  )
}

function fits(probe: HTMLElement, html: string, maxHeightPx: number): boolean {
  probe.innerHTML = html
  return probe.scrollHeight <= maxHeightPx + 1
}

function wrapClone(el: HTMLElement, inner: string): string {
  const clone = el.cloneNode(false) as HTMLElement
  clone.innerHTML = inner
  return clone.outerHTML
}

function splitChildren(el: HTMLElement, maxHeightPx: number, probe: HTMLElement): string[] {
  const kids = [...el.children] as HTMLElement[]
  if (kids.length === 0) return [el.outerHTML]
  const chunks: string[] = []
  let inner = ""
  for (const kid of kids) {
    const next = inner + kid.outerHTML
    if (inner && !fits(probe, wrapClone(el, next), maxHeightPx)) {
      chunks.push(wrapClone(el, inner))
      inner = kid.outerHTML
    } else {
      inner = next
    }
  }
  if (inner) chunks.push(wrapClone(el, inner))
  return chunks.length ? chunks : [el.outerHTML]
}

export function paginateElement(root: HTMLElement, maxHeightPx: number): string[] {
  const limit = Math.max(40, maxHeightPx - 8)
  const probe = document.createElement("div")
  probe.className = root.className
  const cs = getComputedStyle(root)
  probe.style.cssText = [
    `position:absolute`,
    `left:-9999px`,
    `top:0`,
    `width:${root.clientWidth}px`,
    `font:${cs.font}`,
    `color:${cs.color}`,
    `line-height:${cs.lineHeight}`,
  ].join(";")
  document.body.appendChild(probe)

  try {
    const pages: string[] = []
    let current = ""
    const children = [...root.children] as HTMLElement[]
    if (children.length === 0) return [root.innerHTML]

    for (const child of children) {
      const piece = child.outerHTML
      const next = current + piece
      if (current && !fits(probe, next, limit)) {
        if (blockHeight(child) > limit) {
          pages.push(current)
          current = ""
          for (const chunk of splitChildren(child, limit, probe)) {
            if (current && !fits(probe, current + chunk, limit)) {
              pages.push(current)
              current = chunk
            } else {
              current += chunk
            }
          }
          continue
        }
        pages.push(current)
        current = piece
      } else {
        current = next
      }
    }
    if (current) pages.push(current)
    return pages.length ? pages : [""]
  } finally {
    probe.remove()
  }
}
