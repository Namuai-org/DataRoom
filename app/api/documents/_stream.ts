import 'server-only'
import { get } from '@vercel/blob'
import { NO_STORE, contentDisposition, safeContentType } from './_resolve'
import type { Document } from '@/lib/db/schema'

/**
 * Streams a document's bytes from Blob storage through our own origin.
 *
 * The blob URL is a bearer capability: anyone holding it can read the file
 * forever, with no session and no audit trail. So it never leaves the server —
 * not in a response body, not in a header, not in a log line. The only way
 * bytes reach a browser is this function.
 *
 * Range support matters more than it looks: pdf.js asks for the first and last
 * few kilobytes of a PDF to read its cross-reference table, then pulls pages on
 * demand. Without 206 responses it has to download a 40 MB deck before drawing
 * page one.
 */

export type StreamOptions = {
  doc: Document
  rangeHeader: string | null
  disposition: 'inline' | 'attachment'
  /** Extra response headers, e.g. a sandbox CSP for HTML documents. */
  extraHeaders?: Record<string, string>
}

type ParsedRange = { start: number | null; end: number | null }

/** `bytes=0-1023`, `bytes=1024-`, `bytes=-500`. Anything else is ignored. */
function parseRange(header: string): ParsedRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null
  return {
    start: rawStart ? Number(rawStart) : null,
    end: rawEnd ? Number(rawEnd) : null,
  }
}

function baseHeaders(options: StreamOptions): Headers {
  const headers = new Headers(options.extraHeaders)
  headers.set('Content-Type', safeContentType(options.doc))
  headers.set('Content-Disposition', contentDisposition(options.disposition, options.doc.fileName))
  headers.set('Cache-Control', NO_STORE)
  headers.set('Accept-Ranges', 'bytes')
  // Belt and braces alongside the global config: never sniff a confidential
  // document into something executable.
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

/** Thrown when Blob storage itself fails, so callers can answer 502 not 500. */
export class UpstreamError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`upstream responded ${status}`)
    this.name = 'UpstreamError'
    this.status = status
  }
}

/**
 * Reads the blob with the store token.
 *
 * The store is private, so its URLs are inert without authentication — a leaked
 * blobUrl reads nothing. That makes `get()` the only way in, and it is also the
 * better shape: it takes the stored pathname, attaches the authorization header
 * itself, and hands back a stream we never buffer.
 *
 * The Range header is passed straight through, because pdf.js asks for the
 * first and last few kilobytes of a PDF to read its cross-reference table
 * before it will draw anything.
 */
async function fetchUpstream(doc: Document, range?: string): Promise<Response> {
  const result = await get(doc.blobPath, {
    access: 'private',
    ...(range ? { headers: { Range: range } } : {}),
  })

  if (!result) throw new UpstreamError(404)
  if (result.statusCode === 304 || !result.stream) throw new UpstreamError(304)

  // `get()` types its result as 200, but a ranged read really does come back
  // partial; the presence of Content-Range is what says so.
  const contentRange = result.headers.get('content-range')
  const headers = new Headers()
  if (contentRange) headers.set('content-range', contentRange)

  const length = result.headers.get('content-length')
  if (length) headers.set('content-length', length)
  else if (!contentRange && typeof result.blob.size === 'number') {
    headers.set('content-length', String(result.blob.size))
  }

  return new Response(result.stream, {
    status: contentRange ? 206 : 200,
    headers,
  })
}

export async function streamDocument(options: StreamOptions): Promise<Response> {
  const { doc, rangeHeader } = options
  const requested = rangeHeader ? parseRange(rangeHeader) : null

  if (!requested) {
    const upstream = await fetchUpstream(doc)
    const headers = baseHeaders(options)
    const length = upstream.headers.get('content-length')

    if (length) {
      headers.set('Content-Length', length)
      return new Response(upstream.body, { status: 200, headers })
    }

    // pdf.js only enables ranged fetching when it can trust Content-Length, so
    // when storage withholds it we buffer once to measure the file exactly.
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    headers.set('Content-Length', String(bytes.byteLength))
    return new Response(toBody(bytes), { status: 200, headers })
  }

  // Prefer passing the range straight through — storage answers from its CDN
  // edge and we never hold the file in memory.
  const upstream = await fetchUpstream(doc, rangeHeader ?? undefined)

  if (upstream.status === 206) {
    const headers = baseHeaders(options)
    const contentRange = upstream.headers.get('content-range')
    const length = upstream.headers.get('content-length')
    if (contentRange) headers.set('Content-Range', contentRange)
    if (length) headers.set('Content-Length', length)
    return new Response(upstream.body, { status: 206, headers })
  }

  // Storage ignored the Range header and sent the whole file. Slice it here so
  // the client still gets the 206 it asked for.
  const bytes = new Uint8Array(await upstream.arrayBuffer())
  const total = bytes.byteLength

  let start: number
  let end: number
  if (requested.start === null) {
    // Suffix range: the last N bytes.
    const suffix = Math.min(requested.end ?? 0, total)
    start = total - suffix
    end = total - 1
  } else {
    start = requested.start
    end = requested.end === null ? total - 1 : Math.min(requested.end, total - 1)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    const headers = baseHeaders(options)
    headers.set('Content-Range', `bytes */${total}`)
    headers.delete('Content-Length')
    return new Response(null, { status: 416, headers })
  }

  const slice = bytes.subarray(start, end + 1)
  const headers = baseHeaders(options)
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
  headers.set('Content-Length', String(slice.byteLength))
  return new Response(toBody(slice), { status: 206, headers })
}

/**
 * A Uint8Array view is a valid BodyInit, but its backing buffer may be larger
 * than the view. Copying to a standalone ArrayBuffer keeps the response exactly
 * the requested bytes and keeps the DOM lib types happy.
 */
function toBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}
