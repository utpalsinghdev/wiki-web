export const PDF_FONTS = [
  {
    id: "roboto",
    label: "Roboto",
    family: "Roboto, ui-sans-serif, system-ui, sans-serif",
    href: "https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400&display=swap",
  },
  {
    id: "source-sans",
    label: "Source Sans",
    family: '"Source Sans 3", ui-sans-serif, system-ui, sans-serif',
    href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap",
  },
  {
    id: "geist",
    label: "Geist",
    family: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "source-serif",
    label: "Source Serif",
    family: '"Source Serif 4", Georgia, serif',
    href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400&display=swap",
  },
  {
    id: "merriweather",
    label: "Merriweather",
    family: "Merriweather, Georgia, serif",
    href: "https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap",
  },
  {
    id: "georgia",
    label: "Georgia",
    family: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    family: '"JetBrains Mono", ui-monospace, monospace',
    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap",
  },
] as const

export type FontId = (typeof PDF_FONTS)[number]["id"]

export type PdfStyle = {
  bodyFont: FontId
  bodyColor: string
  linkColor: string
  headingMode: "all" | "each"
  headingFont: FontId
  headingColor: string
  h1Font: FontId
  h1Color: string
  h2Font: FontId
  h2Color: string
  h3Font: FontId
  h3Color: string
  paper: "a4" | "letter"
  margins: "narrow" | "normal" | "wide"
  orientation: "portrait" | "landscape"
  pageNumbers: boolean
}

export const defaultPdfStyle: PdfStyle = {
  bodyFont: "roboto",
  bodyColor: "#1f2937",
  linkColor: "#2563eb",
  headingMode: "all",
  headingFont: "roboto",
  headingColor: "#111827",
  h1Font: "roboto",
  h1Color: "#111827",
  h2Font: "roboto",
  h2Color: "#1f2937",
  h3Font: "roboto",
  h3Color: "#374151",
  paper: "a4",
  margins: "normal",
  orientation: "portrait",
  pageNumbers: true,
}

const MARGIN_MM = { narrow: 12, normal: 20, wide: 28 } as const
const PAPER_MM = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const

export function fontFamily(id: FontId): string {
  return PDF_FONTS.find((font) => font.id === id)?.family ?? PDF_FONTS[0].family
}

export function fontHref(id: FontId): string | undefined {
  const font = PDF_FONTS.find((item) => item.id === id)
  return font && "href" in font ? font.href : undefined
}

export function styleFontHrefs(style: PdfStyle): string[] {
  const ids: FontId[] =
    style.headingMode === "each"
      ? [style.bodyFont, style.h1Font, style.h2Font, style.h3Font]
      : [style.bodyFont, style.headingFont]
  return [...new Set(ids.map(fontHref).filter((href): href is string => Boolean(href)))]
}

export function paperMm(style: PdfStyle): { w: number; h: number } {
  const { w, h } = PAPER_MM[style.paper]
  return style.orientation === "landscape" ? { w: h, h: w } : { w, h }
}

export function marginMm(style: PdfStyle): number {
  return MARGIN_MM[style.margins]
}

export function contentBoxMm(style: PdfStyle) {
  const paper = paperMm(style)
  const margin = marginMm(style)
  const footer = style.pageNumbers ? 10 : 0
  return {
    paper,
    margin,
    footer,
    contentW: Math.max(40, paper.w - margin * 2),
    contentH: Math.max(40, paper.h - margin * 2 - footer),
  }
}

function headingFace(style: PdfStyle, level: 1 | 2 | 3): { family: string; color: string } {
  if (style.headingMode === "all") {
    return { family: fontFamily(style.headingFont), color: style.headingColor }
  }
  if (level === 1) return { family: fontFamily(style.h1Font), color: style.h1Color }
  if (level === 2) return { family: fontFamily(style.h2Font), color: style.h2Color }
  return { family: fontFamily(style.h3Font), color: style.h3Color }
}

export function pdfDocumentCss(style: PdfStyle, mode: "preview" | "print"): string {
  const h1 = headingFace(style, 1)
  const h2 = headingFace(style, 2)
  const h3 = headingFace(style, 3)
  const page =
    mode === "print"
      ? `@page {
  size: ${style.paper === "letter" ? "letter" : "A4"} ${style.orientation};
  margin: ${marginMm(style)}mm;
  ${
    style.pageNumbers
      ? `@bottom-center { content: counter(page); font-size: 9pt; color: #6b7280; }`
      : ""
  }
}`
      : ""

  return `${page}
.pdf-md {
  color: ${style.bodyColor};
  font-family: ${fontFamily(style.bodyFont)};
  font-size: 11pt;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-wrap: break-word;
}
.pdf-md, .pdf-md * { box-sizing: border-box; max-width: 100%; }
.pdf-md > :first-child { margin-top: 0; }
.pdf-md > :last-child { margin-bottom: 0; }
.pdf-md h1, .pdf-md h2, .pdf-md h3, .pdf-md h4, .pdf-md h5, .pdf-md h6 {
  line-height: 1.25;
  text-wrap: balance;
  page-break-after: avoid;
}
.pdf-md h1 { margin: 0 0 0.55em; font-size: 22pt; font-weight: 700; font-family: ${h1.family}; color: ${h1.color}; }
.pdf-md h2 { margin: 1.15em 0 0.45em; font-size: 16pt; font-weight: 650; font-family: ${h2.family}; color: ${h2.color}; }
.pdf-md h3 { margin: 1em 0 0.4em; font-size: 13.5pt; font-weight: 650; font-family: ${h3.family}; color: ${h3.color}; }
.pdf-md h4, .pdf-md h5, .pdf-md h6 { margin: 0.9em 0 0.35em; font-size: 12pt; font-weight: 650; font-family: ${h3.family}; color: ${h3.color}; }
.pdf-md p { margin: 0.65em 0; }
.pdf-md ul, .pdf-md ol { margin: 0.65em 0; padding-left: 1.35em; }
.pdf-md li { margin: 0.2em 0; }
.pdf-md ul.contains-task-list { list-style: none; padding-left: 0.2em; }
.pdf-md li.task-list-item { list-style: none; }
.pdf-md a { color: ${style.linkColor}; text-decoration: underline; text-underline-offset: 2px; }
.pdf-md strong { font-weight: 700; }
.pdf-md em { font-style: italic; }
.pdf-md del { text-decoration: line-through; }
.pdf-md hr { border: 0; border-top: 1px solid #e5e7eb; margin: 1.2em 0; }
.pdf-md blockquote {
  margin: 0.8em 0;
  padding: 0.15em 0 0.15em 0.9em;
  border-left: 3px solid #d1d5db;
  color: #4b5563;
}
.pdf-md code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: #f3f4f6;
  padding: 0.12em 0.35em;
  border-radius: 4px;
}
.pdf-md pre {
  margin: 0.9em 0;
  padding: 12px 14px;
  overflow-x: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: #f3f4f6;
  border-radius: 8px;
  font-size: 0.86em;
  line-height: 1.45;
}
.pdf-md pre code { background: none; padding: 0; font-size: inherit; }
.pdf-md table { width: 100%; border-collapse: collapse; margin: 0.9em 0; font-size: 0.95em; }
.pdf-md th, .pdf-md td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
.pdf-md th { font-weight: 650; }
.pdf-md img { max-width: 100%; height: auto; }
.pdf-md input[type="checkbox"] { margin-right: 0.4em; accent-color: ${style.linkColor}; }
`
}

export function ensureFontLinks(hrefs: string[]) {
  for (const href of hrefs) {
    if (document.querySelector(`link[data-pdf-font][href="${href}"]`)) continue
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("data-pdf-font", "")
    document.head.appendChild(link)
  }
}

const STYLE_STORAGE_KEY = "wiki-web-pdf-style"
const FONT_IDS = new Set(PDF_FONTS.map((font) => font.id))

function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && FONT_IDS.has(value as FontId)
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function loadSavedPdfStyle(): PdfStyle {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY)
    if (!raw) return defaultPdfStyle
    const parsed = JSON.parse(raw) as Partial<PdfStyle>
    return {
      bodyFont: isFontId(parsed.bodyFont) ? parsed.bodyFont : defaultPdfStyle.bodyFont,
      bodyColor: isColor(parsed.bodyColor) ? parsed.bodyColor : defaultPdfStyle.bodyColor,
      linkColor: isColor(parsed.linkColor) ? parsed.linkColor : defaultPdfStyle.linkColor,
      headingMode: parsed.headingMode === "each" ? "each" : "all",
      headingFont: isFontId(parsed.headingFont) ? parsed.headingFont : defaultPdfStyle.headingFont,
      headingColor: isColor(parsed.headingColor) ? parsed.headingColor : defaultPdfStyle.headingColor,
      h1Font: isFontId(parsed.h1Font) ? parsed.h1Font : defaultPdfStyle.h1Font,
      h1Color: isColor(parsed.h1Color) ? parsed.h1Color : defaultPdfStyle.h1Color,
      h2Font: isFontId(parsed.h2Font) ? parsed.h2Font : defaultPdfStyle.h2Font,
      h2Color: isColor(parsed.h2Color) ? parsed.h2Color : defaultPdfStyle.h2Color,
      h3Font: isFontId(parsed.h3Font) ? parsed.h3Font : defaultPdfStyle.h3Font,
      h3Color: isColor(parsed.h3Color) ? parsed.h3Color : defaultPdfStyle.h3Color,
      paper: parsed.paper === "letter" ? "letter" : "a4",
      margins:
        parsed.margins === "narrow" || parsed.margins === "wide" ? parsed.margins : "normal",
      orientation: parsed.orientation === "landscape" ? "landscape" : "portrait",
      pageNumbers: parsed.pageNumbers !== false,
    }
  } catch {
    return defaultPdfStyle
  }
}

export function savePdfStyle(style: PdfStyle) {
  localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(style))
}

export function pdfStyleEquals(a: PdfStyle, b: PdfStyle) {
  return JSON.stringify(a) === JSON.stringify(b)
}
