import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, documentViews, documents } from '@/lib/db'
import { touchDocumentView, touchSession } from '@/lib/analytics'
import {
  authorize,
  clampDelta,
  clampPage,
  forbidden,
  json,
  readBody,
  softFail,
} from '@/app/api/track/_lib/guard'

export const runtime = 'nodejs'

/**
 * Numbers arrive loose and are clamped rather than rejected: a heartbeat is the
 * only chance to bank a stretch of reading time, and throwing the whole beat
 * away over an out-of-range page number would lose real attention data.
 * Structure is still strict — an unknown key is a 400.
 */
const Body = z.strictObject({
  deltaMs: z.number(),
  documentViewId: z.uuid().optional(),
  currentPage: z.number().optional(),
  pageCount: z.number().optional(),
})

/** POST /api/track/heartbeat → { ok: true } */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response

  const body = await readBody(req, Body)
  if (!body.ok) return body.response

  const { session } = auth.value
  const { documentViewId } = body.value
  const deltaMs = clampDelta(body.value.deltaMs)

  try {
    if (!documentViewId) {
      await touchSession(session.sessionId, deltaMs)
      return json({ ok: true })
    }

    // The view row is looked up before it is written to. A visitor may only
    // advance their own view; handing us somebody else's id gets a 403 and no
    // write, which keeps one visitor's reading time out of another's record.
    const [view] = await db
      .select({
        visitorId: documentViews.visitorId,
        storedPageCount: documents.pageCount,
      })
      .from(documentViews)
      .innerJoin(documents, eq(documentViews.documentId, documents.id))
      .where(eq(documentViews.id, documentViewId))
      .limit(1)

    if (!view || view.visitorId !== session.visitorId) return forbidden()

    // The document's own page count wins over the client's claim; the client's
    // is only a fallback for documents whose length was never recorded.
    const pageCount =
      view.storedPageCount ??
      (Number.isFinite(body.value.pageCount ?? NaN) && (body.value.pageCount ?? 0) > 0
        ? Math.round(body.value.pageCount as number)
        : null)

    await Promise.all([
      touchSession(session.sessionId, deltaMs),
      touchDocumentView({
        documentViewId,
        deltaMs,
        currentPage: clampPage(body.value.currentPage, pageCount),
        pageCount,
      }),
    ])

    return json({ ok: true })
  } catch (error) {
    console.error('[track] heartbeat failed', error)
    return softFail()
  }
}
