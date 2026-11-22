// lib/plots/files.ts — what an Interactive Plot Map upload may be, checked from its actual bytes (pure: no I/O).
// The browser's file name and declared type are only hints: the server reads the first bytes (signature), the
// image header (dimensions) and, for PDFs, the document structure (lib/plots/pdf-inspect.ts) before accepting it.

export const LIMITS = {
  pdfBytes: 25 * 1024 * 1024,
  imageBytes: 15 * 1024 * 1024,
  pdfPages: 20,
  /** Rendered page image: long edge in pixels (the browser renders at this size). */
  renderLongEdge: 4096,
  renderMinEdge: 256,
  renderMaxBytes: 15 * 1024 * 1024,
  thumbLongEdge: 512,
  thumbMaxBytes: 2 * 1024 * 1024,
  /** Source raster images must be at least this big to be readable as a layout. */
  sourceImageMinEdge: 600,
  sourceImageMaxEdge: 20_000,
} as const

export type DocKind = 'pdf' | 'png' | 'jpeg'
export const KIND_MIME: Record<DocKind, string> = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' }
export const KIND_EXT: Record<DocKind, 'pdf' | 'png' | 'jpg'> = { pdf: 'pdf', png: 'png', jpeg: 'jpg' }

/** The kind the bytes really are, from their signature — or null. */
export function sniffKind(b: Uint8Array): DocKind | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf' // %PDF-
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  return null
}

/** The kind a declared MIME type / file name asks for (only these three are accepted). */
export function declaredKind(mime: string, fileName: string): DocKind | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const byMime: Record<string, DocKind> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg' }
  const byExt: Record<string, DocKind> = { pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg' }
  const m = byMime[mime.toLowerCase()]
  const e = ext ? byExt[ext] : undefined
  if (!m || !e || m !== e) return null
  return m
}

/** Problem with a requested upload before any bytes are sent, or null. */
export function checkUploadRequest(mime: string, fileName: string, size: number): { kind: DocKind } | { error: string } {
  const kind = declaredKind(mime, fileName)
  if (!kind) return { error: 'Upload a PDF, PNG or JPG file.' }
  if (!Number.isInteger(size) || size <= 0) return { error: 'The file is empty.' }
  const max = kind === 'pdf' ? LIMITS.pdfBytes : LIMITS.imageBytes
  if (size > max) return { error: `The file is larger than ${max / 1024 / 1024} MB.` }
  return { kind }
}

/** A safe display name: no path, no control characters, at most 200 characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim()
  return (clean || 'layout').slice(0, 200)
}

/** PNG width/height from the IHDR chunk, or null if the header is not a valid PNG. */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (sniffKind(b) !== 'png' || b.length < 24) return null
  // IHDR must be the first chunk: length 13, type "IHDR".
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const width = dv.getUint32(16), height = dv.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** JPEG width/height from the first SOFn marker, or null. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (sniffKind(b) !== 'jpeg') return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2) return null
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof) {
      const height = (b[i + 5] << 8) | b[i + 6], width = (b[i + 7] << 8) | b[i + 8]
      return width > 0 && height > 0 ? { width, height } : null
    }
    i += 2 + len
  }
  return null
}

/** Checks a source raster image's header. */
export function checkSourceImage(b: Uint8Array, kind: 'png' | 'jpeg'): { width: number; height: number } | { error: string } {
  const size = kind === 'png' ? pngSize(b) : jpegSize(b)
  if (!size) return { error: 'The image could not be read. Export it again as PNG or JPG.' }
  const long = Math.max(size.width, size.height), short = Math.min(size.width, size.height)
  if (short < LIMITS.sourceImageMinEdge) return { error: `The image is too small to read plot numbers (at least ${LIMITS.sourceImageMinEdge} px on each side).` }
  if (long > LIMITS.sourceImageMaxEdge) return { error: 'The image is too large. Export it at a smaller size.' }
  return size
}

/** Checks a rendered page image or thumbnail produced by the browser against what was declared. */
export function checkRender(b: Uint8Array, expect: { width: number; height: number }, which: 'page' | 'thumb'): string | null {
  const size = pngSize(b)
  if (!size) return 'The rendered image is not a PNG.'
  if (b.length > (which === 'page' ? LIMITS.renderMaxBytes : LIMITS.thumbMaxBytes)) return 'The rendered image is too large.'
  const long = Math.max(size.width, size.height), short = Math.min(size.width, size.height)
  if (which === 'page') {
    if (size.width !== expect.width || size.height !== expect.height) return 'The rendered image does not match its declared size.'
    if (long > LIMITS.renderLongEdge || short < LIMITS.renderMinEdge) return 'The rendered image has an unexpected size.'
  } else if (long > LIMITS.thumbLongEdge) return 'The thumbnail is too large.'
  return null
}

/** The size a page renders to: long edge 4096 px (never upscaling raster sources), aspect ratio kept. */
export function renderSize(sourceWidth: number, sourceHeight: number, kind: DocKind): { width: number; height: number; scale: number } {
  const long = Math.max(sourceWidth, sourceHeight)
  const target = kind === 'pdf' ? LIMITS.renderLongEdge : Math.min(LIMITS.renderLongEdge, long)
  const scale = target / long
  return { width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)), scale }
}

/** The pixel size the server requires a page to be rendered at: the page as it displays (its own /Rotate already
 *  applied by the PDF reader), turned by the chosen rotation, scaled by renderSize. The browser uses the same function. */
export function expectedRender(page: { width: number; height: number }, rotation: 0 | 90 | 180 | 270, kind: DocKind) {
  const swap = rotation === 90 || rotation === 270
  return renderSize(swap ? page.height : page.width, swap ? page.width : page.height, kind)
}

export const paths = {
  original: (org: string, project: string, doc: string, kind: DocKind) => `org/${org}/project/${project}/documents/${doc}/original.${KIND_EXT[kind]}`,
  page: (org: string, project: string, version: string) => `org/${org}/project/${project}/versions/${version}/page.png`,
  thumb: (org: string, project: string, version: string) => `org/${org}/project/${project}/versions/${version}/thumb.png`,
}
export const PLOT_MAP_BUCKET = 'plot-map-files'
