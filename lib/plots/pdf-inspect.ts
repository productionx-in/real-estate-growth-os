// lib/plots/pdf-inspect.ts — reads an uploaded PDF on the server with PDF.js (parsing only: no rendering, no
// scripts, no fonts) to prove it is a readable, unencrypted PDF and to record its pages. Rendering happens in the
// browser; the server re-checks the resulting image (lib/plots/files.ts).
import { LIMITS } from '@/lib/plots/files'

export interface PdfPage { page: number; width: number; height: number; rotate: number }
export type PdfInspection = { ok: true; pages: PdfPage[] } | { ok: false; error: string }

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes), // PDF.js takes ownership of the buffer
      isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true, verbosity: 0,
    }).promise
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') return { ok: false, error: 'The PDF is password-protected. Upload a copy without a password.' }
    return { ok: false, error: 'The file is not a readable PDF. Export it again from the drawing software.' }
  }
  try {
    if (doc.numPages < 1) return { ok: false, error: 'The PDF has no pages.' }
    if (doc.numPages > LIMITS.pdfPages) return { ok: false, error: `The PDF has ${doc.numPages} pages; upload at most ${LIMITS.pdfPages} (only the layout pages).` }
    const pages: PdfPage[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i)
      const v = p.getViewport({ scale: 1 })
      pages.push({ page: i, width: Math.round(v.width * 100) / 100, height: Math.round(v.height * 100) / 100, rotate: p.rotate })
      p.cleanup()
    }
    if (pages.some((p) => p.width < 72 || p.height < 72 || p.width > 14400 || p.height > 14400)) {
      return { ok: false, error: 'A page of this PDF has an unusable size.' }
    }
    return { ok: true, pages }
  } catch {
    return { ok: false, error: 'A page of this PDF could not be read.' }
  } finally {
    await doc.destroy()
  }
}
