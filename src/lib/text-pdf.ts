import html2canvas from "html2canvas"

import { paginateElement } from "@/lib/pdf-paginate"

export function pdfFilename(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "note"
  return `${base}.pdf`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

const PX_PER_MM = 96 / 25.4
const PT_PER_MM = 72 / 25.4
const RENDER_SCALE = 2

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function canvasToJpeg(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
  const bin = atob(dataUrl.split(",")[1] ?? "")
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

type PageImage = { jpeg: Uint8Array; width: number; height: number }

function buildPdfFromPages(pages: PageImage[], pageWpt: number, pageHpt: number): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let pos = 0

  const pushStr = (s: string) => {
    const b = enc.encode(s)
    chunks.push(b)
    pos += b.length
  }
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b)
    pos += b.length
  }
  const startObj = (id: number) => {
    offsets[id] = pos
  }

  const w = pageWpt.toFixed(2)
  const h = pageHpt.toFixed(2)

  pushStr("%PDF-1.4\n")
  startObj(1)
  pushStr("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")

  const pageIds = pages.map((_, i) => 3 + i * 3)
  startObj(2)
  pushStr(
    `2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >> endobj\n`
  )

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const pageId = 3 + i * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`

    startObj(pageId)
    pushStr(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> >> >> endobj\n`
    )
    startObj(contentId)
    pushStr(`${contentId} 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj\n`)
    startObj(imageId)
    pushStr(
      `${imageId} 0 obj << /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >> stream\n`
    )
    pushBytes(page.jpeg)
    pushStr("\nendstream endobj\n")
  }

  const xrefPos = pos
  const maxObj = 2 + pages.length * 3
  pushStr(`xref\n0 ${maxObj + 1}\n`)
  pushStr("0000000000 65535 f \n")
  for (let i = 1; i <= maxObj; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`)
  }
  pushStr(`trailer << /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
  return concat(chunks)
}

function triggerDownload(filename: string, bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function pageShellStyle(paper: { w: number; h: number }, margin: number, footer: number): string {
  return [
    `width:${paper.w}mm`,
    `height:${paper.h}mm`,
    `padding:${margin}mm`,
    `padding-bottom:${margin + footer}mm`,
    `box-sizing:border-box`,
    `background:#fff`,
    `overflow:hidden`,
    `position:relative`,
  ].join(";")
}

export async function downloadMarkdownPdf({
  title,
  html,
  pageHtmls,
  css,
  fontHrefs,
  paperMm: paper,
  marginMm: margin,
  pageNumbers,
}: {
  title: string
  html: string
  pageHtmls?: string[]
  css: string
  fontHrefs: string[]
  paperMm: { w: number; h: number }
  marginMm: number
  pageNumbers: boolean
}): Promise<void> {
  const footerMm = pageNumbers ? 10 : 0
  const contentWmm = Math.max(40, paper.w - margin * 2)
  const contentHmm = Math.max(40, paper.h - margin * 2 - footerMm)
  const hostWpx = Math.ceil(contentWmm * PX_PER_MM)
  const contentHpx = contentHmm * PX_PER_MM

  const host = document.createElement("div")
  host.setAttribute("data-pdf-export", "")
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    background: "#fff",
    color: "#111",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "0",
  })
  const links = fontHrefs
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("")
  host.innerHTML = `${links}<style>html,body{margin:0;padding:0;background:#fff;}article.pdf-md{max-width:100%;}${css}</style><article class="pdf-md" data-pdf-sizer style="width:${hostWpx}px">${html}</article>`
  document.body.appendChild(host)
  const sizer = host.querySelector<HTMLElement>("[data-pdf-sizer]")
  if (!sizer) {
    host.remove()
    throw new Error("pdf render failed")
  }

  try {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined)
    await new Promise((resolve) => window.setTimeout(resolve, 80))

    const htmls = (pageHtmls?.length ? pageHtmls : paginateElement(sizer, contentHpx)).filter(Boolean)
    const images: PageImage[] = []

    for (let i = 0; i < Math.max(htmls.length, 1); i++) {
      const sheet = document.createElement("div")
      sheet.setAttribute("data-pdf-sheet", "")
      sheet.style.cssText = pageShellStyle(paper, margin, footerMm)
      sheet.innerHTML = `<article class="pdf-md">${htmls[i] ?? ""}</article>${
        pageNumbers
          ? `<div style="position:absolute;left:0;right:0;bottom:${Math.max(4, margin / 2)}mm;text-align:center;font-size:9pt;color:#6b7280;line-height:1;">${i + 1}</div>`
          : ""
      }`
      host.appendChild(sheet)
      const canvas = await html2canvas(sheet, {
        scale: RENDER_SCALE,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      })
      sheet.remove()
      images.push({ jpeg: canvasToJpeg(canvas), width: canvas.width, height: canvas.height })
    }

    const pdf = buildPdfFromPages(images, paper.w * PT_PER_MM, paper.h * PT_PER_MM)
    triggerDownload(pdfFilename(title), pdf)
  } finally {
    host.remove()
  }
}
