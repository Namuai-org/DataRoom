import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { db, admins, accessLinks, visitors, sessions } from '@/lib/db'
import { resolveTier, tierVisible } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

/* -------------------------------------------------------------------------- */
/*  Secrets                                                                    */
/* -------------------------------------------------------------------------- */

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 32',
    )
  }
  return new TextEncoder().encode(secret)
}

export const VISITOR_COOKIE = 'namu_room'
export const ADMIN_COOKIE = 'namu_admin'

/* -------------------------------------------------------------------------- */
/*  Token helpers                                                              */
/* -------------------------------------------------------------------------- */

/** 32 bytes of entropy, URL-safe. This is what goes in the invite link. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Access links are stored hashed; the raw token exists only in the URL. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Six-digit numeric code for admin sign-in, uniformly distributed. */
export function generateLoginCode(): string {
  // Rejection sampling keeps every code equally likely (a plain modulo would
  // bias the low end).
  let value: number
  do {
    value = randomBytes(4).readUInt32BE(0)
  } while (value >= 4_294_967_290)
  return String(value % 1_000_000).padStart(6, '0')
}

export function hashCode(code: string): string {
  return createHash('sha256')
    .update(`${code}:${process.env.SESSION_SECRET ?? ''}`)
    .digest('hex')
}

/** Length-safe constant-time comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/* -------------------------------------------------------------------------- */
/*  Request context                                                            */
/* -------------------------------------------------------------------------- */

export type RequestContext = {
  ip: string | null
  country: string | null
  countryRegion: string | null
  city: string | null
  latitude: string | null
  longitude: string | null
  timezone: string | null
  userAgent: string | null
  referrer: string | null
}

/**
 * Reads Vercel's geolocation headers. On Vercel these are populated at the
 * edge; locally they are absent and every field degrades to null.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : h.get('x-real-ip')

  return {
    ip: ip || null,
    country: h.get('x-vercel-ip-country'),
    countryRegion: h.get('x-vercel-ip-country-region'),
    city: safeDecode(h.get('x-vercel-ip-city')),
    latitude: h.get('x-vercel-ip-latitude'),
    longitude: h.get('x-vercel-ip-longitude'),
    timezone: h.get('x-vercel-ip-timezone'),
    userAgent: h.get('user-agent'),
    referrer: h.get('referer'),
  }
}

function safeDecode(value: string | null): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * A coarse device fingerprint used only to notice that an invite link is being
 * opened from somewhere new. Deliberately weak — it is a forwarding signal, not
 * an identity check, and it uses no client-side probing.
 */
export function computeFingerprint(ctx: RequestContext): string {
  return createHash('sha256')
    .update([ctx.userAgent ?? '', ctx.country ?? '', ctx.city ?? ''].join('|'))
    .digest('hex')
    .slice(0, 32)
}

/* -------------------------------------------------------------------------- */
/*  Visitor sessions                                                           */
/* -------------------------------------------------------------------------- */

export type VisitorSession = {
  sessionId: string
  visitorId: string
  accessLinkId: string
  email: string
}

const VISITOR_TTL_HOURS = 12

const visitorCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Lax rather than strict: the visitor arrives by clicking a link in an email,
  // which is a cross-site navigation. Strict would drop the cookie on that
  // first hop and bounce them straight back out.
  sameSite: 'lax',
  path: '/',
  maxAge: VISITOR_TTL_HOURS * 60 * 60,
} as const

async function signVisitorToken(payload: VisitorSession): Promise<string> {
  return new SignJWT({ ...payload, kind: 'visitor' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${VISITOR_TTL_HOURS}h`)
    .sign(getSecret())
}

/**
 * Builds the session cookie without writing it, for callers that return a
 * response they constructed themselves. The invite handler uses this so the
 * `Set-Cookie` header is attached to the very redirect it returns, rather than
 * relying on the framework to merge a `cookies().set()` into it.
 */
export async function buildVisitorSessionCookie(payload: VisitorSession): Promise<{
  name: string
  value: string
  options: typeof visitorCookieOptions
}> {
  return {
    name: VISITOR_COOKIE,
    value: await signVisitorToken(payload),
    options: visitorCookieOptions,
  }
}

export async function createVisitorSession(payload: VisitorSession): Promise<void> {
  const jar = await cookies()
  jar.set(VISITOR_COOKIE, await signVisitorToken(payload), visitorCookieOptions)
}

export async function readVisitorSession(): Promise<VisitorSession | null> {
  const jar = await cookies()
  const token = jar.get(VISITOR_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (payload.kind !== 'visitor') return null
    return {
      sessionId: payload.sessionId as string,
      visitorId: payload.visitorId as string,
      accessLinkId: payload.accessLinkId as string,
      email: payload.email as string,
    }
  } catch {
    return null
  }
}

export async function clearVisitorSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(VISITOR_COOKIE)
}

/**
 * The authoritative gate for visitor-facing pages and routes.
 *
 * A valid cookie alone is not enough: the access link is re-checked against the
 * database on every call, so revoking or expiring a link takes effect
 * immediately rather than when the cookie happens to expire.
 */
export async function requireVisitor(): Promise<{
  session: VisitorSession
  link: typeof accessLinks.$inferSelect
  visitor: typeof visitors.$inferSelect
} | null> {
  const session = await readVisitorSession()
  if (!session) return null

  const rows = await db
    .select({ link: accessLinks, visitor: visitors })
    .from(accessLinks)
    .innerJoin(visitors, eq(accessLinks.visitorId, visitors.id))
    .where(and(eq(accessLinks.id, session.accessLinkId), isNull(accessLinks.revokedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (row.link.expiresAt && row.link.expiresAt.getTime() < Date.now()) return null
  if (row.link.visitorId !== session.visitorId) return null

  return { session, link: row.link, visitor: row.visitor }
}

/* -------------------------------------------------------------------------- */
/*  Admin sessions                                                             */
/* -------------------------------------------------------------------------- */

export type AdminSession = {
  adminId: string
  email: string
  isOwner: boolean
}

const ADMIN_TTL_HOURS = 8

export async function createAdminSession(payload: AdminSession): Promise<void> {
  const token = await new SignJWT({ ...payload, kind: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_HOURS}h`)
    .sign(getSecret())

  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Strict: the admin console should never be reachable from a cross-site
    // navigation, which removes a whole class of CSRF.
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_TTL_HOURS * 60 * 60,
  })
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (payload.kind !== 'admin') return null
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      isOwner: Boolean(payload.isOwner),
    }
  } catch {
    return null
  }
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(ADMIN_COOKIE)
}

/** Re-checks the admin still exists on every call, so removal is immediate. */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await readAdminSession()
  if (!session) return null

  const rows = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.id, session.adminId))
    .limit(1)

  return rows[0] ? session : null
}

/* -------------------------------------------------------------------------- */
/*  Authorisation helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Whether a link's folder allow-list admits this folder. Empty list = all. */
export function canSeeFolder(link: typeof accessLinks.$inferSelect, folderId: string): boolean {
  const allowed = link.allowedFolderIds
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(folderId)
}

/**
 * The full visibility test for a document: the folder must be allowed AND the
 * document's effective disclosure tier must sit at or below the link's tier.
 * Both conditions are checked server-side on every read.
 */
export function canSeeDocument(
  link: typeof accessLinks.$inferSelect,
  doc: { tier: string; isHidden: boolean; folderId: string },
  folder: { tier: string; isHidden: boolean },
): boolean {
  if (doc.isHidden || folder.isHidden) return false
  if (!canSeeFolder(link, doc.folderId)) return false
  return tierVisible(link.tier, resolveTier(doc, folder))
}

/** Document policy wins over the visitor flag when it is not 'inherit'. */
export function canDownload(
  link: typeof accessLinks.$inferSelect,
  doc: { downloadPolicy: string },
): boolean {
  if (doc.downloadPolicy === 'never') return false
  if (doc.downloadPolicy === 'allow') return true
  return link.canDownload
}

export type { accessLinks, visitors, sessions }
