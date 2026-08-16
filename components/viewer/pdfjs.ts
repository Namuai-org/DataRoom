/**
 * pdf.js loading, isolated so the 900 KB library never lands in the server
 * bundle or the initial client chunk. It is imported dynamically from inside an
 * effect, which means it is fetched only when a PDF is actually opened.
 */

export type PdfjsModule = typeof import('pdfjs-dist')

/**
 * Companion assets pdf.js fetches at runtime: CMaps for CJK text, the fourteen
 * standard fonts for PDFs that do not embed them, and WebAssembly for JPEG 2000
 * images. They live in node_modules and must be copied into `public/pdfjs/`.
 *
 * If they are missing, pdf.js degrades rather than fails: embedded-font PDFs —
 * which is nearly everything exported from Keynote, Slides or InDesign — render
 * perfectly, and only the exotic cases fall back to a substitute font.
 */
const PDFJS_ASSET_BASE = '/pdfjs/'

export const PDFJS_ASSET_OPTIONS = {
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
} as const

/**
 * The worker URL. `new URL(specifier, import.meta.url)` is the form Turbopack
 * and webpack both recognise: they resolve the specifier at build time, emit
 * the worker as a static asset and rewrite this to its hashed public path. The
 * filename below is the one that actually exists in pdfjs-dist v6.2's build
 * directory — `pdf.worker.min.mjs`.
 */
function resolveWorkerSrc(): string {
  try {
    return new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  } catch {
    // If a bundler ever fails to rewrite the expression we fall back to a copy
    // served from public/, which is the documented manual step.
    return `${PDFJS_ASSET_BASE}pdf.worker.min.mjs`
  }
}

let cached: Promise<PdfjsModule> | null = null

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!cached) {
    cached = import('pdfjs-dist')
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = resolveWorkerSrc()
        return lib
      })
      .catch((error: unknown) => {
        // Do not memoise a failure; a transient chunk-load error should be
        // retryable from the viewer's error state.
        cached = null
        throw error
      })
  }
  return cached
}

/** Turns a pdf.js failure into something a person can act on. */
export function describePdfError(error: unknown): string {
  const status = (error as { status?: number } | null)?.status
  const name = (error as { name?: string } | null)?.name
  const message = error instanceof Error ? error.message : String(error ?? '')

  if (status === 401 || /\(401\)/.test(message)) {
    return 'Your session has expired. Open your invitation link again to continue.'
  }
  if (status === 403 || /\(403\)/.test(message)) {
    return 'This document is not part of your access.'
  }
  if (status === 404 || /\(404\)/.test(message)) {
    return 'This document is no longer available.'
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
    return 'This file is not a readable PDF. It may have been damaged during upload.'
  }
  if (/worker/i.test(message)) {
    return 'The PDF engine could not start. Reload the page — if it keeps happening, let us know.'
  }
  if (/fetch|network|load/i.test(message)) {
    return 'The document could not be loaded. Check your connection and try again.'
  }
  return 'This document could not be displayed.'
}
