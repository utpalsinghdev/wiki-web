const taskItem = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)\[([ xX])\]/gm

export function toggleTaskAt(markdown: string, index: number, checked: boolean): string {
  const mark = checked ? "x" : " "
  let seen = 0
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part
      taskItem.lastIndex = 0
      return part.replace(taskItem, (full, prefix: string) => {
        if (seen++ !== index) return full
        return `${prefix}[${mark}]`
      })
    })
    .join("")
}
