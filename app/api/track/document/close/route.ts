import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, documentViews } from '@/lib/db'
import { getRequestContext } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { authorize, forbidden, json, readBody, softFail } from '@/app/api/track/_lib/guard'

export const runtime = 'nodejs'

const Body = z.strictObject({ documentViewId: z.uuid() })

/** POST /api/track/document/close → { ok: true } */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response

  const body = await readBody(req, Body)
  if (!body.ok) return body.response

  const { session } = auth.value
  const { documentViewId } = body.value

  try {
    const [view] = await db
      .select({
        visitorId: documentViews.visitorId,
        documentId: documentViews.documentId,
        activeMs: documentViews.activeMs,
        closedAt: documentViews.closedAt,
      })
      .from(documentViews)
      .where(eq(documentViews.id, documentViewId))
      .limit(1)

    if (!view || view.visitorId !== session.visitorId) return forbidden()

    // Closing is idempotent. A beacon on `pagehide` and the unmount cleanup can
    // both fire for the same view, and the audit trail should show one close.
    if (view.closedAt) return json({ ok: true })

    await db
      .update(documentViews)
      .set({ closedAt: new Date() })
      .where(and(eq(documentViews.id, documentViewId), isNull(documentViews.closedAt)))

    const ctx = await getRequestContext()
    await recordEvent({
      type: 'document_closed',
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      documentId: view.documentId,
      actor: 'visitor',
      // The row's own activeMs, not a number the client offered.
      metadata: { documentViewId, activeMs: view.activeMs },
      ip: ctx.ip,
      country: ctx.country,
    })

    return json({ ok: true })
  } catch (error) {
    console.error('[track] document/close failed', error)
    return softFail()
  }
}
