import { jsonError, resolveDocumentForVisitor } from '../../_resolve'
import { streamDocument, UpstreamError } from '../../_stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The authorised document stream.
 *
 * This is the only path by which document bytes reach a browser. Blob URLs stay
 * on the server: they carry no session, expire never, and would survive being
 * forwarded, which is precisely the leak this room exists to prevent.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const resolved = await resolveDocumentForVisitor(id)
  if (!resolved.ok) return resolved.response

  const { doc } = resolved.value

  try {
    return await streamDocument({
      doc,
      rangeHeader: req.headers.get('range'),
      disposition: 'inline',
      // Uploaded HTML is same-origin content we did not write. `sandbox` gives
      // it an opaque origin if anyone navigates to this URL directly, so it
      // cannot script against the room. The viewer renders it in a sandboxed
      // iframe as well; this is the defence for the direct-navigation case.
      //
      // SVG belongs here too. It is an image everywhere it is rendered — the
      // viewer uses <img>, which keeps it inert — but navigating straight to
      // this URL would execute any script inside it on the room's own origin.
      extraHeaders: isActiveContent(doc) ? { 'Content-Security-Policy': 'sandbox' } : undefined,
    })
  } catch (error) {
    // Deliberately logs the document id and never the blob URL.
    console.error('[documents.content] upstream fetch failed', {
      documentId: doc.id,
      status: error instanceof UpstreamError ? error.status : undefined,
    })
    return jsonError(502, 'This document could not be retrieved just now. Please try again.')
  }
}

/**
 * File types that a browser will execute if it navigates to them directly.
 * These get an opaque origin via `Content-Security-Policy: sandbox`.
 */
function isActiveContent(doc: { kind: string; mimeType: string | null }): boolean {
  const mime = doc.mimeType ?? ''
  return (
    doc.kind === 'web' ||
    mime.startsWith('text/html') ||
    mime === 'image/svg+xml' ||
    mime === 'application/xhtml+xml'
  )
}
