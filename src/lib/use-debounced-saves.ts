import { useCallback, useEffect, useRef } from "react"

export function useDebouncedSaves(
  save: (path: string, content: string) => void | Promise<void>,
  ms: number
) {
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])
  const pending = useRef(new Map<string, string>())
  const timer = useRef<number | null>(null)

  const flush = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const batch = pending.current
    if (batch.size === 0) return
    pending.current = new Map()
    for (const [path, content] of batch) void saveRef.current(path, content)
  }, [])

  useEffect(() => {
    function onLeave() {
      flush()
    }
    window.addEventListener("beforeunload", onLeave)
    return () => {
      window.removeEventListener("beforeunload", onLeave)
      flush()
    }
  }, [flush])

  const run = useCallback(
    (path: string, content: string) => {
      pending.current.set(path, content)
      if (timer.current != null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = null
        flush()
      }, ms)
    },
    [flush, ms]
  )

  return run
}
