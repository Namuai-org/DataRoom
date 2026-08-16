import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessLinks, visitors, sessions, ndaAcceptances } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { readSettings } from '@/app/admin/_lib/settings'
import {
  hashToken,
  getRequestContext,
  computeFingerprint,
  buildVisitorSessionCookie,
} from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { notifyRoomEntered } from '@/lib/notify'
import { UAParser } from 'ua-parser-js'

/**
 * The invite link lands here.
 *
 * Everything the room later trusts is established in this one handler: the
 * link is validated against the database, a session row is opened, and the
 * signed cookie is issued. Nothing downstream re-derives identity from the URL.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  const origin = new URL(request.url).origin
  const ctxInfo = await getRequestContext()

  const fail = async (reason: string, record = true) => {
    // A rejected link is worth knowing about — a revoked invite still being
    // opened is a real signal. An unrecognised token is not: this endpoint is
    // unauthenticated, so writing a row for every made-up path would let anyone
    // fill the events table in a loop. Only rejections of links that actually
    // exist are recorded.
    if (record) {
      await recordEvent({
        type: 'link_rejected',
        actor: 'system',
        label: reason,
        ip: ctxInfo.ip,
        country: ctxInfo.country,
        metadata: { tokenPreview: token.slice(0, 8) },
      })
    }
    return NextResponse.redirect(new URL(`/access-denied?reason=${reason}`, origin))
  }

  if (!token || token.length < 20) return fail('invalid', false)

  const rows = await db
    .select({ link: accessLinks, visitor: visitors })
    .from(accessLinks)
    .innerJoin(visitors, eq(accessLinks.visitorId, visitors.id))
    .where(eq(accessLinks.tokenHash, hashToken(token)))
    .limit(1)

  const row = rows[0]
  // No matching link at all — an unrecognised token, so not recorded.
  if (!row) return fail('invalid', false)
  if (row.link.revokedAt) return fail('revoked')
  if (row.link.expiresAt && row.link.expiresAt.getTime() < Date.now()) return fail('expired')

  /* ---- Device binding -------------------------------------------------- */
  // The link carries no second factor, so a forwarded link would otherwise be
  // logged as the original invitee. Binding to the first device that opens it
  // lets the analytics say plainly when that has happened.
  const fingerprint = computeFingerprint(ctxInfo)
  const isFirstOpen = !row.link.boundFingerprint
  const isNewDevice =
    !isFirstOpen &&
    (row.link.boundFingerprint !== fingerprint || row.link.boundIp !== ctxInfo.ip)

  const ua = new UAParser(ctxInfo.userAgent ?? '')
  const uaResult = ua.getResult()

  const [session] = await db
    .insert(sessions)
    .values({
      visitorId: row.visitor.id,
      accessLinkId: row.link.id,
      ip: ctxInfo.ip,
      country: ctxInfo.country,
      countryRegion: ctxInfo.countryRegion,
      city: ctxInfo.city,
      latitude: ctxInfo.latitude,
      longitude: ctxInfo.longitude,
      timezone: ctxInfo.timezone,
      userAgent: ctxInfo.userAgent,
      browser: uaResult.browser.name
        ? `${uaResult.browser.name} ${uaResult.browser.version ?? ''}`.trim()
        : null,
      os: uaResult.os.name ? `${uaResult.os.name} ${uaResult.os.version ?? ''}`.trim() : null,
      deviceType: uaResult.device.type ?? 'desktop',
      referrer: ctxInfo.referrer,
      fingerprint,
      isNewDevice,
    })
    .returning()

  if (!session) return fail('invalid')

  await db
    .update(accessLinks)
    .set({
      firstOpenedAt: row.link.firstOpenedAt ?? new Date(),
      lastOpenedAt: new Date(),
      openCount: row.link.openCount + 1,
      ...(isFirstOpen ? { boundFingerprint: fingerprint, boundIp: ctxInfo.ip } : {}),
    })
    .where(eq(accessLinks.id, row.link.id))

  const sessionCookie = await buildVisitorSessionCookie({
    sessionId: session.id,
    visitorId: row.visitor.id,
    accessLinkId: row.link.id,
    email: row.visitor.email,
  })

  await recordEvent({
    type: 'link_opened',
    sessionId: session.id,
    visitorId: row.visitor.id,
    ip: ctxInfo.ip,
    country: ctxInfo.country,
    metadata: { isNewDevice, isFirstOpen, browser: uaResult.browser.name },
  })

  // Fire-and-forget so a slow mail provider never delays the visitor.
  void notifyRoomEntered({
    visitorName: row.visitor.name,
    visitorEmail: row.visitor.email,
    organization: row.visitor.organization,
    city: ctxInfo.city,
    country: ctxInfo.country,
    isNewDevice,
    isFirstOpen,
  })

  /* ---- NDA gate --------------------------------------------------------- */
  // Read through the shared settings module rather than querying the table
  // directly: the stored keys are snake_case, and hand-writing one here is
  // exactly how this drifted out of step with the console once already.
  const { ndaEnabled } = await readSettings()

  let destination = '/room'
  if (ndaEnabled) {
    const [signed] = await db
      .select({ id: ndaAcceptances.id })
      .from(ndaAcceptances)
      .where(eq(ndaAcceptances.visitorId, row.visitor.id))
      .orderBy(desc(ndaAcceptances.acceptedAt))
      .limit(1)

    if (!signed) destination = '/nda'
  }

  const response = NextResponse.redirect(new URL(destination, origin))
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options)
  return response
}
