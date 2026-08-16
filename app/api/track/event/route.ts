import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, documentViews, documents, folders } from '@/lib/db'
import { canSeeDocument, getRequestContext } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { authorize, badRequest, forbidden, json, readBody, softFail } from '@/app/api/track/_lib/guard'

export const runtime = 'nodejs'

/**
 * The only event types a visitor's browser may write.
 *
 * This is the whole point of the endpoint. `events` is the audit trail the
 * security log and the admin activity feed both read from, so a visitor must
 * never be able to post an `admin_login`, `invite_created` or `nda_accepted`
 * row into it. Those types are written server-side by the routes that actually
 * perform the action; anything not on this list is a 400.
 *
 * `download` is deliberately absent. It is written by the download route once
 * the bytes have actually been authorised and sent, so accepting it here would
 * let a visitor record a download that never happened — and flip the same flag
 * on their view row — for a document they are not even allowed to download.
 */
const VISITOR_EVENT_TYPES = [
  'folder_opened',
  'search',
  'print_attempt',
  'room_entered',
] as const

const MAX_METADATA_CHARS = 2000

const Body = z.strictObject({
  type: z.enum(VISITOR_EVENT_TYPES),
  documentId: z.uuid().optional(),
  label: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** POST /api/track/event → { ok: true } */
export async function POST(req: Request): Promise<Response> {
  const auth = await authorize()
  if (!auth.ok) return auth.response

  const body = await readBody(req, Body)
  if (!body.ok) return body.response

  const { session, link } = auth.value
  const { type, documentId, label, metadata } = body.value

  if (metadata && JSON.stringify(metadata).length > MAX_METADATA_CHARS) {
    return badRequest('metadata_too_large')
  }

  try {
    if (documentId) {
      // An event may only be attributed to a document this visitor can
      // actually reach, otherwise the analytics could be seeded with reads of
      // material that was never shown to them.
      const [doc] = await db
        .select({
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

      // The full test, tier included — the same one the room pages and the
      // byte routes run — so an event can never be attributed to material this
      // link has not been released.
      if (!doc || doc.isHidden || doc.folderHidden) return forbidden()
      if (!canSeeDocument(link, doc, { tier: doc.folderTier, isHidden: doc.folderHidden })) {
        return forbidden()
      }

      // Mirror the flag the document view carries, so the per-document table
      // shows it without having to join the event log.
      const flag = type === 'print_attempt' ? { printAttempted: true } : null

      if (flag) {
        await db
          .update(documentViews)
          .set(flag)
          .where(
            and(
              eq(documentViews.sessionId, session.sessionId),
              eq(documentViews.documentId, documentId),
              isNull(documentViews.closedAt),
            ),
          )
      }
    }

    const ctx = await getRequestContext()
    await recordEvent({
      type,
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      documentId: documentId ?? null,
      actor: 'visitor',
      label: label ?? null,
      metadata,
      ip: ctx.ip,
      country: ctx.country,
    })

    return json({ ok: true })
  } catch (error) {
    console.error('[track] event failed', error)
    return softFail()
  }
}
