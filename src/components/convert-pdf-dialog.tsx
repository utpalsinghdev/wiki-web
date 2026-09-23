import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { splitFrontmatter } from "@/lib/frontmatter"
import {
  contentBoxMm,
  defaultPdfStyle,
  ensureFontLinks,
  loadSavedPdfStyle,
  PDF_FONTS,
  pdfDocumentCss,
  pdfStyleEquals,
  savePdfStyle,
  styleFontHrefs,
  type FontId,
  type PdfStyle,
} from "@/lib/pdf-style"
import { paginateElement } from "@/lib/pdf-paginate"
import { downloadMarkdownPdf } from "@/lib/text-pdf"
import { cn } from "@/lib/utils"
import { fetchNote } from "@/lib/vault-api"
import { rewriteWikilinks } from "@/lib/wikilinks"

function PdfMarkdown({ source }: { source: string }) {
  const { body } = splitFrontmatter(source)
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => (/^javascript:/i.test(url) ? "" : url)}
      components={{
        a({ href, children }) {
          if (!href || href.startsWith("#") || href.startsWith("wiki://")) {
            return <span>{children}</span>
          }
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        },
      }}
    >
      {rewriteWikilinks(body)}
    </Markdown>
  )
}

function NativeSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {children}
    </select>
  )
}

function FontSelect({
  value,
  onChange,
}: {
  value: FontId
  onChange: (id: FontId) => void
}) {
  return (
    <NativeSelect value={value} onChange={(id) => onChange(id as FontId)} className="w-[9.5rem]">
      {PDF_FONTS.map((font) => (
        <option key={font.id} value={font.id}>
          {font.label}
        </option>
      ))}
    </NativeSelect>
  )
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-8 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
    />
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function FontColorRow({
  font,
  color,
  colorLabel,
  onFont,
  onColor,
}: {
  font: FontId
  color: string
  colorLabel: string
  onFont: (id: FontId) => void
  onColor: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <FontSelect value={font} onChange={onFont} />
      <ColorInput value={color} onChange={onColor} label={colorLabel} />
    </div>
  )
}

export function ConvertPdfDialog({
  path,
  onClose,
}: {
  path: string | null
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const [title, setTitle] = useState("")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [step, setStep] = useState<"edit" | "style">("edit")
  const [style, setStyle] = useState<PdfStyle>(loadSavedPdfStyle)
  const [savedStyle, setSavedStyle] = useState<PdfStyle>(loadSavedPdfStyle)
  const [saving, setSaving] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    const stored = loadSavedPdfStyle()
    queueMicrotask(() => {
      if (cancelled) return
      setStatus("loading")
      setText("")
      setTitle("")
      setStep("edit")
      setStyle(stored)
      setSavedStyle(stored)
    })
    void fetchNote(path)
      .then((note) => {
        if (cancelled) return
        setTitle(note.title)
        setText(note.content)
        setStatus("ready")
      })
      .catch(() => {
        if (cancelled) return
        setStatus("error")
        toast.error("Failed to load file")
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const fontHrefs = useMemo(() => styleFontHrefs(style), [style])
  const previewCss = useMemo(() => pdfDocumentCss(style, "preview"), [style])
  const layout = useMemo(() => contentBoxMm(style), [style])
  const paper = layout.paper
  const margin = layout.margin
  const [pageHtmls, setPageHtmls] = useState<string[]>([""])
  const sizerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ensureFontLinks(fontHrefs)
  }, [fontHrefs])

  useEffect(() => {
    if (step !== "style") return
    const el = stageRef.current
    if (!el) return
    const pageW = (paper.w / 25.4) * 96
    const update = () => setScale(Math.min(1, Math.max(0.35, (el.clientWidth - 48) / pageW)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paper.w, step])

  useLayoutEffect(() => {
    if (step !== "style") return
    const el = sizerRef.current
    if (!el) return
    const maxH = (layout.contentH / 25.4) * 96
    const update = () => setPageHtmls(paginateElement(el, maxH))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [step, text, previewCss, layout.contentH, layout.contentW])

  async function download() {
    if (status !== "ready" || saving) return
    const html = sizerRef.current?.innerHTML.trim()
    if (!html) {
      toast.error("Nothing to export")
      return
    }
    setSaving(true)
    try {
      await downloadMarkdownPdf({
        title,
        html,
        pageHtmls,
        css: previewCss,
        fontHrefs,
        paperMm: paper,
        marginMm: margin,
        pageNumbers: style.pageNumbers,
      })
      toast.success("PDF downloaded")
    } catch {
      toast.error("PDF download failed")
    } finally {
      setSaving(false)
    }
  }

  function patch(next: Partial<PdfStyle>) {
    setStyle((prev) => ({ ...prev, ...next }))
  }

  function saveStyle() {
    savePdfStyle(style)
    setSavedStyle(style)
    toast.success("Style saved. Next PDF will use this.")
  }

  return (
    <Dialog
      open={path !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn(
          "flex w-full flex-col",
          step === "edit"
            ? "max-h-[min(90vh,44rem)] gap-3 sm:max-w-3xl"
            : "h-[min(92vh,56rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]"
        )}
      >
        {step === "edit" ? (
          <>
            <DialogHeader>
              <DialogTitle>Convert to PDF</DialogTitle>
              <DialogDescription>
                {title ? `${title}.md` : "Loading note"}. Remove anything you do not want in the PDF. The vault file is not changed.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={status === "loading" ? "Loading…" : status === "error" ? "Could not load this file." : text}
              onChange={(event) => setText(event.target.value)}
              readOnly={status !== "ready"}
              className="field-sizing-fixed min-h-64 flex-1 resize-y font-mono text-sm md:min-h-[28rem]"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={() => setStep("style")} disabled={status !== "ready"}>
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b pr-12 pl-4 py-3">
              <DialogHeader className="gap-1">
                <DialogTitle>Fine-tune styles</DialogTitle>
                <DialogDescription>
                  Customise fonts, colours, and page layout. Changes apply live.
                </DialogDescription>
              </DialogHeader>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <Button type="button" variant="outline" onClick={() => setStep("edit")}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveStyle}
                  disabled={pdfStyleEquals(style, savedStyle)}
                >
                  Save style
                </Button>
                <Button type="button" onClick={() => void download()} disabled={saving}>
                  Download PDF
                </Button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[18.5rem_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b p-4 lg:border-r lg:border-b-0">
                <div className="flex flex-col gap-5">
                  <Section title="Body">
                    <FontColorRow
                      font={style.bodyFont}
                      color={style.bodyColor}
                      colorLabel="Body colour"
                      onFont={(bodyFont) => patch({ bodyFont })}
                      onColor={(bodyColor) => patch({ bodyColor })}
                    />
                  </Section>
                  <Section title="Links">
                    <ColorInput value={style.linkColor} onChange={(linkColor) => patch({ linkColor })} label="Link colour" />
                  </Section>
                  <Section title="Headings">
                    <div className="flex rounded-lg border border-input p-0.5">
                      <button
                        type="button"
                        className={cn(
                          "h-7 flex-1 rounded-md text-xs",
                          style.headingMode === "all" && "bg-muted font-medium"
                        )}
                        onClick={() => patch({ headingMode: "all" })}
                      >
                        All the same
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-7 flex-1 rounded-md text-xs",
                          style.headingMode === "each" && "bg-muted font-medium"
                        )}
                        onClick={() => patch({ headingMode: "each" })}
                      >
                        Each level
                      </button>
                    </div>
                    {style.headingMode === "all" ? (
                      <FontColorRow
                        font={style.headingFont}
                        color={style.headingColor}
                        colorLabel="Heading colour"
                        onFont={(headingFont) => patch({ headingFont })}
                        onColor={(headingColor) => patch({ headingColor })}
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">H1</span>
                          <FontColorRow
                            font={style.h1Font}
                            color={style.h1Color}
                            colorLabel="H1 colour"
                            onFont={(h1Font) => patch({ h1Font })}
                            onColor={(h1Color) => patch({ h1Color })}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">H2</span>
                          <FontColorRow
                            font={style.h2Font}
                            color={style.h2Color}
                            colorLabel="H2 colour"
                            onFont={(h2Font) => patch({ h2Font })}
                            onColor={(h2Color) => patch({ h2Color })}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">H3</span>
                          <FontColorRow
                            font={style.h3Font}
                            color={style.h3Color}
                            colorLabel="H3 colour"
                            onFont={(h3Font) => patch({ h3Font })}
                            onColor={(h3Color) => patch({ h3Color })}
                          />
                        </div>
                      </div>
                    )}
                  </Section>
                  <Separator />
                  <Section title="Page layout">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Paper size</span>
                      <NativeSelect
                        value={style.paper}
                        onChange={(paper) => patch({ paper: paper as PdfStyle["paper"] })}
                        className="w-28"
                      >
                        <option value="a4">A4</option>
                        <option value="letter">Letter</option>
                      </NativeSelect>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Margins</span>
                      <NativeSelect
                        value={style.margins}
                        onChange={(margins) => patch({ margins: margins as PdfStyle["margins"] })}
                        className="w-28"
                      >
                        <option value="narrow">Narrow</option>
                        <option value="normal">Normal</option>
                        <option value="wide">Wide</option>
                      </NativeSelect>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Orientation</span>
                      <NativeSelect
                        value={style.orientation}
                        onChange={(orientation) =>
                          patch({ orientation: orientation as PdfStyle["orientation"] })
                        }
                        className="w-28"
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </NativeSelect>
                    </div>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Page numbers</span>
                      <input
                        type="checkbox"
                        checked={style.pageNumbers}
                        onChange={(event) => patch({ pageNumbers: event.target.checked })}
                        className="size-4 accent-primary"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setStyle(defaultPdfStyle)}
                      disabled={pdfStyleEquals(style, defaultPdfStyle)}
                    >
                      Reset defaults
                    </Button>
                  </Section>
                </div>
              </aside>
              <div ref={stageRef} className="min-h-0 overflow-auto bg-muted/50 p-6">
                <style>{previewCss}</style>
                <div
                  ref={sizerRef}
                  className="pdf-md"
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: 0,
                    width: `${layout.contentW}mm`,
                    visibility: "hidden",
                  }}
                >
                  <PdfMarkdown source={text} />
                </div>
                <div className="mx-auto flex flex-col items-center gap-6">
                  {pageHtmls.map((pageHtml, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden bg-white shadow-md"
                      style={{
                        width: `${paper.w * scale}mm`,
                        height: `${paper.h * scale}mm`,
                      }}
                    >
                      <article
                        className="pdf-md bg-white"
                        style={{
                          width: `${paper.w}mm`,
                          height: `${paper.h}mm`,
                          padding: `${margin}mm`,
                          paddingBottom: `${margin + layout.footer}mm`,
                          overflow: "hidden",
                          boxSizing: "border-box",
                          transform: `scale(${scale})`,
                          transformOrigin: "top left",
                        }}
                        dangerouslySetInnerHTML={{ __html: pageHtml }}
                      />
                      {style.pageNumbers ? (
                        <div className="pointer-events-none absolute right-0 bottom-0 left-0 pb-[4mm] text-center text-[9pt] leading-none text-[#6b7280]">
                          {i + 1}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
