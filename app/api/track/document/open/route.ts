import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, documentViews, documents, folders } from '@/lib/db'
import { canSeeDocument, getRequestContext } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { authorize, forbidden, json, readBody, softFail } from '@/app/api/track/_lib/guard'

export const runtime = 'nodejs'

const Body = z.strictObject({ documentId: z.uuid() })

/**
 * Navigating away from a document and back within this window continues the
 * same view row instead of starting a new one, so "time on this document" is
 * one number rather than a scatter of fragments. Past it, the visitor came back
 * later and that genuinely is a second visit.
 */
const RESUME_WINDOW_MS = 30 * 60_000

/** POST /api/track/document/open → { documentViewId } */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response

  const body = await readBody(req, Body)
  if (!body.ok) return body.response

  const { session, link } = auth.value
  const { documentId } = body.value

  try {
    const [doc] = await db
      .select({
        id: documents.id,
        folderId: documents.folderId,
        isHidden: documents.isHidden,
        tier: documents.tier,
        folderHidden: folders.isHidden,
        folderTier: folders.tier,
      })
      .from(documents)
      .innerJoin(folders, eq(documents.folderId, folders.id))
      .where(eq(documents.id, documentId))
      .limit(1)

    // One answer for "no such document", "hidden" and "not yours" — a visitor
    // should not be able to probe this endpoint to learn which ids exist. The
    // full visibility test runs here, tier included, so a view row can never be
    // opened against material the room would refuse to show.
    if (!doc || doc.isHidden || doc.folderHidden) return forbidden()
    if (!canSeeDocument(link, doc, { tier: doc.folderTier, isHidden: doc.folderHidden })) {
      return forbidden()
    }

    const [resumable] = await db
      .select({ id: documentViews.id })
      .from(documentViews)
      .where(
        and(
          eq(documentViews.sessionId, session.sessionId),
          eq(documentViews.documentId, doc.id),
          isNull(documentViews.closedAt),
          gte(documentViews.lastSeenAt, new Date(Date.now() - RESUME_WINDOW_MS)),
        ),
      )
      .orderBy(desc(documentViews.lastSeenAt))
      .limit(1)

    let documentViewId: string
    if (resumable) {
      documentViewId = resumable.id
      await db
        .update(documentViews)
        .set({ lastSeenAt: new Date() })
        .where(eq(documentViews.id, resumable.id))
    } else {
      const [created] = await db
        .insert(documentViews)
        .values({
          sessionId: session.sessionId,
          visitorId: session.visitorId,
          documentId: doc.id,
        })
        .returning({ id: documentViews.id })

      if (!created) return softFail()
      documentViewId = created.id
    }

    const ctx = await getRequestContext()
    await recordEvent({
      type: 'document_opened',
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      documentId: doc.id,
      actor: 'visitor',
      metadata: { documentViewId, resumed: Boolean(resumable) },
      ip: ctx.ip,
      country: ctx.country,
    })

    return json({ documentViewId })
  } catch (error) {
    console.error('[track] document/open failed', error)
    return softFail()
  }
}
