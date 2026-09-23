import { useEffect, useRef, useState } from "react"
import { WandSparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { GraphPayload } from "@/lib/types"
import { cn } from "@/lib/utils"

const MIN_SCALE = 0.25
const MAX_SCALE = 2.6
const DEFAULT_ZOOM = 10
const LAPSE_MS = 10000
const ZOOM_COLLAPSE_MS = 2500
const MAX_DRAG_STEP = 24
const MAX_SPEED = 12

function pctToScale(pct: number) {
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * (pct / 100)
}

function folderHue(path: string) {
  const folder = path.split("/")[0] ?? path
  let hash = 0
  for (let i = 0; i < folder.length; i++) {
    hash = (hash * 33 + folder.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

type SimNode = GraphPayload["nodes"][number] & {
  x: number
  y: number
  vx: number
  vy: number
  degree: number
  hue: number
}

export function GraphView({
  graph,
  activePath,
  onOpen,
}: {
  graph: GraphPayload
  activePath: string | null
  onOpen: (path: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [lapsing, setLapsing] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const zoomRef = useRef(zoom)
  const startLapseRef = useRef<(() => void) | null>(null)
  const onOpenRef = useRef(onOpen)
  const activePathRef = useRef(activePath)
  const zoomHideRef = useRef<number | null>(null)
  useEffect(() => {
    zoomRef.current = zoom
    onOpenRef.current = onOpen
    activePathRef.current = activePath
  }, [zoom, onOpen, activePath])

  function clearZoomHide() {
    if (zoomHideRef.current != null) {
      window.clearTimeout(zoomHideRef.current)
      zoomHideRef.current = null
    }
  }

  function scheduleZoomHide() {
    clearZoomHide()
    zoomHideRef.current = window.setTimeout(() => setZoomOpen(false), ZOOM_COLLAPSE_MS)
  }

  useEffect(() => () => clearZoomHide(), [])

  useEffect(() => {
    const canvasEl = canvasRef.current
    const wrapEl = wrapRef.current
    if (!canvasEl || !wrapEl) return
    const ctx = canvasEl.getContext("2d")
    if (!ctx) return
    const view = { canvas: canvasEl, wrap: wrapEl, ctx }

    const degree = new Map<string, number>()
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    }

    const n = graph.nodes.length
    const spread = Math.max(260, Math.sqrt(Math.max(n, 1)) * 32)
    const nodes: SimNode[] = graph.nodes.map((node, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 + Math.random() * 0.2
      const radius = spread * (0.25 + Math.random() * 0.75)
      return {
        ...node,
        degree: degree.get(node.id) ?? 0,
        hue: folderHue(node.path),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      }
    })
    const index = new Map(nodes.map((node) => [node.id, node]))
    const ranked = [...nodes].sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
    const rank = new Map(ranked.map((node, i) => [node, i]))
    const lapse = { playing: false, t0: 0 }
    const links = graph.edges
      .map((edge) => ({
        source: index.get(edge.source),
        target: index.get(edge.target),
      }))
      .filter(
        (edge): edge is { source: SimNode; target: SimNode } =>
          Boolean(edge.source && edge.target)
      )

    let width = 0
    let height = 0
    const pan = { x: 0, y: 0 }
    let dragging: SimNode | null = null
    let hovered: SimNode | null = null
    let panning = false
    let lastPtr = { x: 0, y: 0 }
    let moved = 0
    let raf = 0
    let running = true
    let time = 0

    function scaleNow() {
      return pctToScale(zoomRef.current)
    }

    function nodeAlpha(node: SimNode) {
      if (!lapse.playing) return 1
      const elapsed = performance.now() - lapse.t0
      if (elapsed >= LAPSE_MS) {
        lapse.playing = false
        return 1
      }
      const progress = (elapsed / LAPSE_MS) * nodes.length
      const i = rank.get(node) ?? 0
      if (i + 1 <= progress) return 1
      if (i >= progress) return 0
      return progress - i
    }

    function nodeRadius(node: SimNode) {
      return 1.7 + Math.sqrt(node.degree) * 1.05
    }

    function resize() {
      const rect = view.wrap.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = window.devicePixelRatio || 1
      view.canvas.width = Math.floor(width * dpr)
      view.canvas.height = Math.floor(height * dpr)
      view.canvas.style.width = `${width}px`
      view.canvas.style.height = `${height}px`
      view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function tick() {
      if (!running) return
      time += 1
      const count = nodes.length
      const springK = 0.022
      const rest = 88
      const wobble = 0.045

      for (let i = 0; i < count; i++) {
        const a = nodes[i]
        if (a === dragging) continue
        a.vx += -a.x * 0.0007
        a.vy += -a.y * 0.0007
        a.vx += Math.sin(time * 0.012 + i) * wobble
        a.vy += Math.cos(time * 0.01 + i * 0.7) * wobble
        for (let j = i + 1; j < count; j++) {
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          const dist = Math.hypot(dx, dy) || 0.1
          if (dist > 420) continue
          const force = Math.min(2800 / (dist * dist), 6)
          dx = (dx / dist) * force
          dy = (dy / dist) * force
          if (a !== dragging) {
            a.vx += dx
            a.vy += dy
          }
          if (b !== dragging) {
            b.vx -= dx
            b.vy -= dy
          }
        }
      }

      for (const link of links) {
        const dx = link.target.x - link.source.x
        const dy = link.target.y - link.source.y
        const dist = Math.hypot(dx, dy) || 0.1
        const pull = (dist - rest) * springK
        const fx = (dx / dist) * pull
        const fy = (dy / dist) * pull
        if (link.source !== dragging) {
          link.source.vx += fx
          link.source.vy += fy
        }
        if (link.target !== dragging) {
          link.target.vx -= fx
          link.target.vy -= fy
        }
      }

      for (const node of nodes) {
        if (node === dragging) {
          node.vx = 0
          node.vy = 0
          continue
        }
        node.vx *= 0.9
        node.vy *= 0.9
        const speed = Math.hypot(node.vx, node.vy)
        if (speed > MAX_SPEED) {
          node.vx = (node.vx / speed) * MAX_SPEED
          node.vy = (node.vy / speed) * MAX_SPEED
        }
        node.x += node.vx
        node.y += node.vy
      }

      draw()
      raf = requestAnimationFrame(tick)
    }

    function setCursor(pointer: boolean) {
      const value = pointer ? "pointer" : "grab"
      view.canvas.style.cursor = value
      view.wrap.style.cursor = value
    }

    function drawName(node: SimNode, emphasize: boolean) {
      const scale = scaleNow()
      const fontSize = (emphasize ? 13 : 11) / scale
      view.ctx.font = `${emphasize ? 600 : 400} ${fontSize}px ui-sans-serif, system-ui, sans-serif`
      const text = node.title
      const x = node.x + nodeRadius(node) + 8 / scale
      const y = node.y
      if (emphasize) {
        const padX = 6 / scale
        const padY = 4 / scale
        const tw = view.ctx.measureText(text).width
        view.ctx.fillStyle = "rgba(20, 20, 20, 0.92)"
        view.ctx.beginPath()
        view.ctx.roundRect(
          x - padX,
          y - fontSize / 2 - padY,
          tw + padX * 2,
          fontSize + padY * 2,
          4 / scale
        )
        view.ctx.fill()
      }
      view.ctx.fillStyle = "#dadada"
      view.ctx.textBaseline = "middle"
      view.ctx.fillText(text, x, y)
    }

    function draw() {
      const scale = scaleNow()
      view.ctx.fillStyle = "#1e1e1e"
      view.ctx.fillRect(0, 0, width, height)
      view.ctx.save()
      view.ctx.translate(width / 2 + pan.x, height / 2 + pan.y)
      view.ctx.scale(scale, scale)

      view.ctx.lineWidth = 1.1 / scale
      for (const link of links) {
        const alpha = Math.min(nodeAlpha(link.source), nodeAlpha(link.target))
        if (alpha <= 0.02) continue
        const hot =
          link.source === hovered ||
          link.target === hovered ||
          link.source === dragging ||
          link.target === dragging
        view.ctx.globalAlpha = alpha
        view.ctx.strokeStyle = hot
          ? "rgba(155, 140, 255, 0.55)"
          : "rgba(127, 109, 242, 0.22)"
        view.ctx.beginPath()
        view.ctx.moveTo(link.source.x, link.source.y)
        view.ctx.lineTo(link.target.x, link.target.y)
        view.ctx.stroke()
      }
      view.ctx.globalAlpha = 1

      for (const node of nodes) {
        const alpha = nodeAlpha(node)
        if (alpha <= 0.02) continue
        const active = node.path === activePathRef.current
        const hot = node === hovered || node === dragging
        const r = nodeRadius(node) * (hot || active ? 1.12 : 1)
        view.ctx.globalAlpha = alpha
        view.ctx.beginPath()
        view.ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        if (hot || active) view.ctx.fillStyle = `hsl(${node.hue} 70% 72%)`
        else if (node.degree > 0) view.ctx.fillStyle = `hsl(${node.hue} 52% 58%)`
        else view.ctx.fillStyle = "#6b6b6b"
        view.ctx.fill()
        if (hot || active) {
          view.ctx.strokeStyle = "#ffffff"
          view.ctx.lineWidth = 1.4 / scale
          view.ctx.stroke()
        }
      }
      view.ctx.globalAlpha = 1

      if (scale >= 1.9) {
        for (const node of nodes) {
          if (node === hovered || nodeAlpha(node) < 0.7) continue
          drawName(node, false)
        }
      } else if (scale >= 1.25) {
        for (const node of nodes) {
          if (node === hovered || node.degree < 3 || nodeAlpha(node) < 0.7) continue
          drawName(node, false)
        }
      }

      if (hovered && nodeAlpha(hovered) > 0.4) drawName(hovered, true)
      else {
        const active = nodes.find((node) => node.path === activePathRef.current && nodeAlpha(node) > 0.4)
        if (active) drawName(active, true)
      }
      view.ctx.restore()
    }

    function toWorld(event: PointerEvent) {
      const scale = scaleNow()
      const rect = view.canvas.getBoundingClientRect()
      return {
        x: (event.clientX - rect.left - width / 2 - pan.x) / scale,
        y: (event.clientY - rect.top - height / 2 - pan.y) / scale,
      }
    }

    function hit(event: PointerEvent) {
      const p = toWorld(event)
      const threshold = 14 / scaleNow()
      return [...nodes]
        .reverse()
        .find((node) => {
          if (nodeAlpha(node) <= 0.4) return false
          return (
            Math.hypot(node.x - p.x, node.y - p.y) <
            Math.max(nodeRadius(node) + 2, threshold)
          )
        })
    }

    function onDown(event: PointerEvent) {
      const node = hit(event)
      dragging = node ?? null
      panning = !node
      moved = 0
      lastPtr = { x: event.clientX, y: event.clientY }
      setCursor(Boolean(node))
      view.canvas.setPointerCapture(event.pointerId)
    }
    function onMove(event: PointerEvent) {
      if (event.buttons) {
        const dx = event.clientX - lastPtr.x
        const dy = event.clientY - lastPtr.y
        moved += Math.hypot(dx, dy)
        lastPtr = { x: event.clientX, y: event.clientY }
        if (panning) {
          pan.x += dx
          pan.y += dy
          return
        }
        if (dragging) {
          const p = toWorld(event)
          const worldDx = p.x - dragging.x
          const worldDy = p.y - dragging.y
          const distance = Math.hypot(worldDx, worldDy)
          const step = Math.min(distance, MAX_DRAG_STEP)
          if (distance > 0) {
            dragging.x += (worldDx / distance) * step
            dragging.y += (worldDy / distance) * step
          }
          return
        }
      }
      hovered = hit(event) ?? null
      setCursor(Boolean(hovered))
    }
    function onLeave() {
      hovered = null
      setCursor(false)
    }
    function onUp(event: PointerEvent) {
      if (dragging && moved < 6) {
        const node = hit(event)
        if (node && node.id === dragging.id) onOpenRef.current(node.path)
      }
      dragging = null
      panning = false
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault()
    }

    startLapseRef.current = () => {
      pan.x = 0
      pan.y = 0
      lapse.playing = true
      lapse.t0 = performance.now()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(view.wrap)
    view.canvas.addEventListener("pointerdown", onDown)
    view.canvas.addEventListener("pointermove", onMove)
    view.canvas.addEventListener("pointerup", onUp)
    view.canvas.addEventListener("pointerleave", onLeave)
    view.canvas.addEventListener("wheel", onWheel, { passive: false })
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      view.canvas.removeEventListener("pointerdown", onDown)
      view.canvas.removeEventListener("pointermove", onMove)
      view.canvas.removeEventListener("pointerup", onUp)
      view.canvas.removeEventListener("pointerleave", onLeave)
      view.canvas.removeEventListener("wheel", onWheel)
      startLapseRef.current = null
    }
  }, [graph])

  return (
    <div ref={wrapRef} className="relative size-full bg-[#1e1e1e]">
      <canvas ref={canvasRef} className="size-full cursor-grab" />
      <div
        className="absolute top-3 right-3 z-10"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`size-8 border border-[#333] bg-[#161616]/95 ${lapsing ? "text-[#c4bbf7]" : "text-[#dadada]"}`}
                onClick={() => {
                  setLapsing(true)
                  startLapseRef.current?.()
                  window.setTimeout(() => setLapsing(false), LAPSE_MS)
                }}
              />
            }
          >
            <WandSparklesIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Start time-lapse</TooltipContent>
        </Tooltip>
      </div>
      <div
        className={cn(
          "absolute right-4 bottom-4 z-10 flex h-9 items-center overflow-hidden rounded-md border border-[#333] bg-[#161616]/95 transition-[width,padding,gap] duration-300 ease-out",
          zoomOpen ? "w-56 gap-3 px-3" : "w-[3.15rem] gap-0 px-2"
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onPointerEnter={clearZoomHide}
        onPointerLeave={scheduleZoomHide}
      >
        <button
          type="button"
          className="w-10 shrink-0 text-left text-xs text-[#dadada]"
          onClick={() => {
            setZoomOpen(true)
            clearZoomHide()
          }}
        >
          {zoom}%
        </button>
        <Slider
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-200",
            zoomOpen ? "opacity-100 delay-75" : "pointer-events-none opacity-0"
          )}
          min={0}
          max={100}
          value={[zoom]}
          onValueChange={(next) => {
            const value = Array.isArray(next) ? next[0] : next
            if (typeof value === "number") setZoom(value)
            clearZoomHide()
          }}
        />
      </div>
    </div>
  )
}
