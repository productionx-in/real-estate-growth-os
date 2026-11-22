// lib/plots/browser-render.ts — browser only. Renders a page of an uploaded layout (PDF via PDF.js, or a PNG/JPG)
// at the exact size the server chose, with the chosen rotation, into a PNG + a 512 px thumbnail. The server then
// re-checks both images (lib/plots/files.ts). Images are drawn without EXIF auto-rotation so the browser and the
// server agree on dimensions; orientation is corrected explicitly with the rotation buttons.
import { expectedRender, LIMITS } from '@/lib/plots/files'

type Rotation = 0 | 90 | 180 | 270
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPageProxy>; destroy: () => Promise<void> }
type PdfPageProxy = {
  rotate: number
  getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; background?: string }) => { promise: Promise<void> }
  cleanup: () => void
}

export const RENDERER = 'pdfjs-dist'
let pdfjsVersion = ''

async function pdfjs() {
  const lib = await import('pdfjs-dist')
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  }
  pdfjsVersion = lib.version
  return lib
}
export const rendererVersion = () => pdfjsVersion || 'unknown'

export async function openPdf(url: string): Promise<PdfDoc> {
  const lib = await pdfjs()
  return (await lib.getDocument({ url, isEvalSupported: false }).promise) as unknown as PdfDoc
}

async function loadImage(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load the image.')
  return createImageBitmap(await res.blob(), { imageOrientation: 'none' })
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the page. Try another browser.')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  return { c, ctx }
}

const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/png'))

/** A small preview of a page (for choosing the page and rotation). */
export async function previewPage(source: { kind: 'pdf'; doc: PdfDoc } | { kind: 'image'; url: string }, page: number, rotation: Rotation, longEdge = 360): Promise<string> {
  const out = await draw(source, page, rotation, null, longEdge)
  return out.c.toDataURL('image/png')
}

async function draw(source: { kind: 'pdf'; doc: PdfDoc } | { kind: 'image'; url: string }, pageNo: number, rotation: Rotation, exact: { width: number; height: number } | null, longEdge: number) {
  if (source.kind === 'pdf') {
    const p = await source.doc.getPage(pageNo)
    const rot = (p.rotate + rotation) % 360
    const base = p.getViewport({ scale: 1, rotation: rot })
    const scale = exact ? exact.width / base.width : longEdge / Math.max(base.width, base.height)
    const vp = p.getViewport({ scale, rotation: rot })
    const w = exact?.width ?? Math.round(vp.width), h = exact?.height ?? Math.round(vp.height)
    const { c, ctx } = canvas(w, h)
    await p.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise
    p.cleanup()
    return { c }
  }
  const img = await loadImage(source.url)
  const swap = rotation === 90 || rotation === 270
  const rw = swap ? img.height : img.width, rh = swap ? img.width : img.height
  const scale = exact ? exact.width / rw : Math.min(1, longEdge / Math.max(rw, rh))
  const w = exact?.width ?? Math.round(rw * scale), h = exact?.height ?? Math.round(rh * scale)
  const { c, ctx } = canvas(w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(w / 2, h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale)
  img.close()
  return { c }
}

/** The full render (exact size from the server) and its thumbnail, as PNG blobs. */
export async function renderForUpload(source: { kind: 'pdf'; doc: PdfDoc } | { kind: 'image'; url: string }, pageNo: number, rotation: Rotation, size: { width: number; height: number }) {
  const { c } = await draw(source, pageNo, rotation, size, Math.max(size.width, size.height))
  const t = LIMITS.thumbLongEdge / Math.max(size.width, size.height)
  const { c: tc, ctx } = canvas(Math.max(1, Math.round(size.width * t)), Math.max(1, Math.round(size.height * t)))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, tc.width, tc.height)
  const [page, thumb] = await Promise.all([toPng(c), toPng(tc)])
  c.width = 0; c.height = 0 // free the large canvas at once
  return { page, thumb }
}

/** The size the server will ask for: the same function the server checks against (lib/plots/files.ts). */
export function plannedSize(page: { width: number; height: number }, rotation: Rotation, kind: 'pdf' | 'png' | 'jpeg') {
  const { width, height } = expectedRender(page, rotation, kind)
  return { width, height }
}
