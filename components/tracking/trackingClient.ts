'use client'

/**
 * The transport half of the tracking layer: four endpoints, no state, no React.
 *
 * Every function here is total — it resolves, it never throws, and it never
 * rejects. Tracking is the least important thing happening on the page and must
 * never be able to interrupt a visitor reading a document, so a network failure
 * is a return value rather than an exception.
 */

export const TRACK_ENDPOINTS = {
  open: '/api/track/document/open',
  close: '/api/track/document/close',
  heartbeat: '/api/track/heartbeat',
  event: '/api/track/event',
} as const

/** Mirrors the server's whitelist. Anything else is a 400 by design. */
export const VISITOR_EVENT_TYPES = [
  'folder_opened',
  'search',
  'print_attempt',
  'room_entered',
] as const

export type VisitorEventType = (typeof VISITOR_EVENT_TYPES)[number]

export type HeartbeatInput = {
  deltaMs: number
  documentViewId?: string | null
  currentPage?: number | null
  pageCount?: number | null
}

export type TrackEventPayload = {
  documentId?: string | null
  label?: string | null
  metadata?: Record<string, unknown>
}

/** `status: 0` means the request never reached the server. */
export type TrackResult = { ok: boolean; status: number }

/**
 * The ceiling a single heartbeat can carry. Mirrors the server-side clamp, so
 * a client holding on to unsent time never inflates past what would be stored
 * anyway.
 */
export const MAX_DELTA_MS = 120_000

const REQUEST_TIMEOUT_MS = 10_000

function timeoutSignal(): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  } catch {
    /* no AbortSignal support: fall through to an untimed request */
  }
  return undefined
}

async function post<T>(url: string, body: unknown): Promise<{ result: TrackResult; data: T | null }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: timeoutSignal(),
    })

    let data: T | null = null
    try {
      data = (await response.json()) as T
    } catch {
      data = null
    }

    return { result: { ok: response.ok, status: response.status }, data }
  } catch {
    return { result: { ok: false, status: 0 }, data: null }
  }
}

/**
 * Fire-and-forget send that survives the page going away. `sendBeacon` is the
 * only thing browsers guarantee during `pagehide`; `keepalive` fetch is the
 * fallback for the handful of cases where the beacon is refused (for instance
 * when the beacon queue is already full).
 */
export function beacon(url: string, body: unknown): boolean {
  let payload: string
  try {
    payload = JSON.stringify(body)
  } catch {
    return false
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // A Blob keeps the content type honest; the route reads the raw text
      // either way, so a browser that downgrades it changes nothing.
      if (navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))) return true
    }
  } catch {
    /* fall through */
  }

  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {})
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/*  Payload shaping                                                            */
/* -------------------------------------------------------------------------- */

/** The routes validate strictly, so only finite numbers are ever sent. */
function positiveInt(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return undefined
  return Math.round(value)
}

export function heartbeatPayload(input: HeartbeatInput): Record<string, unknown> {
  const deltaMs = Number.isFinite(input.deltaMs) ? Math.max(0, Math.round(input.deltaMs)) : 0
  const payload: Record<string, unknown> = { deltaMs }
  if (input.documentViewId) payload.documentViewId = input.documentViewId
  const currentPage = positiveInt(input.currentPage)
  if (currentPage !== undefined) payload.currentPage = currentPage
  const pageCount = positiveInt(input.pageCount)
  if (pageCount !== undefined) payload.pageCount = pageCount
  return payload
}

function eventPayload(type: VisitorEventType, payload?: TrackEventPayload): Record<string, unknown> {
  const body: Record<string, unknown> = { type }
  if (payload?.documentId) body.documentId = payload.documentId
  if (payload?.label) body.label = String(payload.label).slice(0, 200)
  if (payload?.metadata && Object.keys(payload.metadata).length > 0) body.metadata = payload.metadata
  return body
}

/* -------------------------------------------------------------------------- */
/*  The four calls                                                             */
/* -------------------------------------------------------------------------- */

export async function openDocument(documentId: string): Promise<string | null> {
  if (!documentId) return null
  const { data } = await post<{ documentViewId?: string }>(TRACK_ENDPOINTS.open, { documentId })
  return typeof data?.documentViewId === 'string' ? data.documentViewId : null
}

export function closeDocument(documentViewId: string): void {
  if (!documentViewId) return
  beacon(TRACK_ENDPOINTS.close, { documentViewId })
}

export async function sendHeartbeat(input: HeartbeatInput): Promise<TrackResult> {
  const { result } = await post(TRACK_ENDPOINTS.heartbeat, heartbeatPayload(input))
  return result
}

export function beaconHeartbeat(input: HeartbeatInput): void {
  beacon(TRACK_ENDPOINTS.heartbeat, heartbeatPayload(input))
}

export async function trackEvent(
  type: VisitorEventType,
  payload?: TrackEventPayload,
): Promise<boolean> {
  const { result } = await post(TRACK_ENDPOINTS.event, eventPayload(type, payload))
  return result.ok
}

/* -------------------------------------------------------------------------- */
/*  The context value                                                          */
/* -------------------------------------------------------------------------- */

export type TrackingApi = {
  trackEvent(type: VisitorEventType, payload?: TrackEventPayload): Promise<boolean>
  openDocument(documentId: string): Promise<string | null>
  closeDocument(documentViewId: string): void
  heartbeat(input: HeartbeatInput): Promise<TrackResult>
}

/**
 * Used when a component calls useTracking() outside the provider. The calls are
 * identical — the context exists to save prop drilling and to allow a test to
 * swap the transport, not to gate access — so a missing provider degrades to
 * working tracking rather than to a thrown error.
 */
export const defaultTrackingApi: TrackingApi = {
  trackEvent,
  openDocument,
  closeDocument,
  heartbeat: sendHeartbeat,
}
