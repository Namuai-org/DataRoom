import { z } from 'zod'
import { requireVisitor } from '@/lib/auth'

/* -------------------------------------------------------------------------- */
/*  Responses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tracking responses are never cacheable and never surface an error the room
 * has to handle. The only hard failures are authentication and authorisation —
 * everything else degrades to `{ ok: false }` with a 200 so a database hiccup
 * can never take a visitor's document away from them.
 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export const unauthorized = () => json({ ok: false, error: 'unauthorized' }, 401)
export const forbidden = () => json({ ok: false, error: 'forbidden' }, 403)
export const badRequest = (error = 'invalid_body') => json({ ok: false, error }, 400)
export const payloadTooLarge = () => json({ ok: false, error: 'payload_too_large' }, 413)
export const rateLimited = () => json({ ok: false, error: 'rate_limited' }, 429)

/** A swallowed failure: the write did not happen, the room carries on. */
export const softFail = () => json({ ok: false }, 200)

/* -------------------------------------------------------------------------- */
/*  Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A token bucket per session, held in module memory.
 *
 * NOTE: this is per serverless instance. Two concurrent lambdas each keep their
 * own bucket and a cold start resets it, so a determined client can exceed the
 * nominal ceiling by a factor of however many instances are warm. It is a
 * courtesy limit that stops a runaway client loop from hammering Postgres — it
 * is NOT a security control. Everything that actually has to hold (session
 * identity, view-row ownership, folder access, the event whitelist) is checked
 * against the database on every single request.
 */
const BUCKET_CAPACITY = 120 // requests…
const BUCKET_WINDOW_MS = 60_000 // …per minute
const REFILL_PER_MS = BUCKET_CAPACITY / BUCKET_WINDOW_MS
const BUCKET_IDLE_TTL_MS = 10 * 60_000
const MAX_BUCKETS = 5_000

type Bucket = { tokens: number; updatedAt: number }
const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > BUCKET_IDLE_TTL_MS) buckets.delete(key)
  }
  // Still oversized means a genuine burst of distinct sessions; drop the
  // oldest insertions so the map can never grow without bound.
  if (buckets.size > MAX_BUCKETS) {
    let excess = buckets.size - MAX_BUCKETS
    for (const key of buckets.keys()) {
      if (excess-- <= 0) break
      buckets.delete(key)
    }
  }
}

export function takeToken(key: string): boolean {
  const now = Date.now()
  if (buckets.size >= MAX_BUCKETS) sweep(now)

  const bucket = buckets.get(key)
  if (!bucket) {
    buckets.set(key, { tokens: BUCKET_CAPACITY - 1, updatedAt: now })
    return true
  }

  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + (now - bucket.updatedAt) * REFILL_PER_MS)
  bucket.updatedAt = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

/* -------------------------------------------------------------------------- */
/*  Authorisation                                                              */
/* -------------------------------------------------------------------------- */

export type VisitorContext = NonNullable<Awaited<ReturnType<typeof requireVisitor>>>

type Guarded<T> = { ok: true; value: T } | { ok: false; response: Response }

/**
 * Identifies the visitor from the session cookie and spends a rate-limit token.
 *
 * The visitor id and session id always come from the signed cookie via
 * requireVisitor(); nothing in the request body is ever trusted to say who is
 * calling. requireVisitor() also re-reads the access link on every call, so a
 * revoked or expired link stops working immediately rather than when the cookie
 * happens to expire.
 */
export async function authorize(): Promise<Guarded<VisitorContext>> {
  let context: VisitorContext | null = null
  try {
    context = await requireVisitor()
  } catch (error) {
    // A database outage is not an authentication failure. Returning 401 here
    // would make the room think the visitor was signed out and bounce them to
    // the door, so infrastructure trouble degrades quietly instead.
    console.error('[track] session lookup failed', error)
    return { ok: false, response: softFail() }
  }

  if (!context) return { ok: false, response: unauthorized() }
  if (!takeToken(context.session.sessionId)) return { ok: false, response: rateLimited() }
  return { ok: true, value: context }
}

/* -------------------------------------------------------------------------- */
/*  Body parsing                                                               */
/* -------------------------------------------------------------------------- */

const MAX_BODY_BYTES = 4096

/**
 * Reads and validates a request body.
 *
 * The body is read as text rather than with `req.json()` because
 * `navigator.sendBeacon` is free to label the payload `text/plain`; the shape,
 * not the content type, is what matters. Every schema is strict, so an unknown
 * key is a 400 rather than something silently ignored.
 */
export async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<Guarded<z.output<S>>> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: payloadTooLarge() }
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return { ok: false, response: badRequest('unreadable_body') }
  }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, response: payloadTooLarge() }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, response: badRequest('malformed_json') }
  }

  const result = schema.safeParse(parsed)
  if (!result.success) return { ok: false, response: badRequest() }
  return { ok: true, value: result.data }
}

/* -------------------------------------------------------------------------- */
/*  Shared numeric guards                                                      */
/* -------------------------------------------------------------------------- */

/** Matches the ceiling `touchSession`/`touchDocumentView` already enforce. */
export const MAX_DELTA_MS = 120_000

/** The client's clock is advisory. This is the number that reaches the table. */
export function clampDelta(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_DELTA_MS, Math.max(0, Math.round(value)))
}

/** Nobody paginates past this; it exists so a bad number cannot poison a heatmap. */
export const MAX_PAGE_NUMBER = 10_000

export function clampPage(value: number | undefined, pageCount: number | null): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const ceiling = pageCount && pageCount > 0 ? Math.min(pageCount, MAX_PAGE_NUMBER) : MAX_PAGE_NUMBER
  return Math.min(ceiling, Math.max(1, Math.round(value)))
}
