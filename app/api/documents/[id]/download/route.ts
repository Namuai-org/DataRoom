import { and, desc, eq } from 'drizzle-orm'
import { db, documentViews } from '@/lib/db'
import { canDownload, getRequestContext } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { brand } from '@/lib/brand'
import { jsonError, resolveDocumentForVisitor } from '../../_resolve'
import { streamDocument, UpstreamError } from '../../_stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Gated download.
 *
 * A download is the one action that takes a document permanently outside the
 * room, so it is both the most restricted and the most carefully logged.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const resolved = await resolveDocumentForVisitor(id)
  if (!resolved.ok) return resolved.response

  const { doc, link, session, visitor } = resolved.value

  if (!canDownload(link, doc)) {
    return jsonError(
      403,
      `Downloads are disabled for this document. You can read it in full inside the room — email ${brand.contact} if you need a copy.`,
      { documentId: doc.id, reason: doc.downloadPolicy === 'never' ? 'document' : 'link' },
    )
  }

  let response: Response
  try {
    response = await streamDocument({
      doc,
      // A download is a single sequential read; ranges only complicate the
      // audit trail, so the whole file goes out in one response.
      rangeHeader: null,
      disposition: 'attachment',
    })
  } catch (error) {
    console.error('[documents.download] upstream fetch failed', {
      documentId: doc.id,
      status: error instanceof UpstreamError ? error.status : undefined,
    })
    return jsonError(502, 'This document could not be retrieved just now. Please try again.')
  }

  // Recorded after the bytes are secured but before they are returned, so a
  // successful download is always accounted for. Failures here are swallowed
  // by recordEvent — analytics must never break a legitimate download.
  const ctxInfo = await getRequestContext()
  await recordEvent({
    type: 'download',
    visitorId: visitor.id,
    sessionId: session.sessionId,
    documentId: doc.id,
    label: doc.title,
    metadata: { fileName: doc.fileName, sizeBytes: doc.sizeBytes, kind: doc.kind },
    ip: ctxInfo.ip,
    country: ctxInfo.country,
  })

  await markViewDownloaded(visitor.id, doc.id)

  return response
}

/**
 * Flags the visitor's most recent view of this document. Downloading almost
 * always follows opening, so this attaches the download to the reading session
 * it came from rather than leaving it as a free-floating event.
 */
async function markViewDownloaded(visitorId: string, documentId: string): Promise<void> {
  try {
    const rows = await db
      .select({ id: documentViews.id })
      .from(documentViews)
      .where(
        and(eq(documentViews.visitorId, visitorId), eq(documentViews.documentId, documentId)),
      )
      .orderBy(desc(documentViews.openedAt))
      .limit(1)

    const view = rows[0]
    if (!view) return

    await db.update(documentViews).set({ downloaded: true }).where(eq(documentViews.id, view.id))
  } catch (error) {
    console.error('[documents.download] could not flag document view', { documentId, error })
  }
}
