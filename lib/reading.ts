/**
 * How far through a document a reader actually got.
 *
 * Pure and dependency-free so both server pages and client components can share
 * one definition of "read" — the room's margin marks and the admin console must
 * never disagree about the same document.
 *
 * The awkward case this exists for: `completion` is only meaningful when a
 * document has pages. `UnsupportedPreview` used to report a page count of 1 for
 * files it cannot render, which made the completion maths `1/1` and recorded
 * every spreadsheet as fully read on the first click. The write is fixed, but
 * rows already in the database carry that value, so the guard below is
 * permanent: for an unpaged document, time spent is the only honest signal.
 */

export type ReadState = 'unread' | 'started' | 'read'

export type Progress = {
  activeMs: number
  completion: number
  lastSeenAt: Date
}

/** Thresholds, named so the reasoning survives the next edit. */
const UNPAGED_READ_MS = 20_000 // a spreadsheet held for 20s was genuinely looked at
const PAGED_READ_MS = 120_000 // two minutes in a PDF counts even if scrolling missed pages
const PAGED_READ_FRACTION = 0.9
const STARTED_MS = 8_000
const STARTED_FRACTION = 0.05

export function readState(doc: { pageCount: number | null }, p?: Progress): ReadState {
  if (!p) return 'unread'

  const paged = Boolean(doc.pageCount && doc.pageCount > 0)

  if (!paged) {
    if (p.activeMs >= UNPAGED_READ_MS) return 'read'
    return p.activeMs > 0 ? 'started' : 'unread'
  }

  if (p.completion >= PAGED_READ_FRACTION || p.activeMs >= PAGED_READ_MS) return 'read'
  return p.activeMs >= STARTED_MS || p.completion > STARTED_FRACTION ? 'started' : 'unread'
}

/**
 * 0..1 for the margin mark. An unpaged document has two states, not
 * twenty-eight, so a started one returns a fixed leading edge rather than a
 * fraction the room cannot actually measure.
 */
export function readFraction(
  doc: { pageCount: number | null },
  state: ReadState,
  p?: Progress,
): number {
  if (state === 'read') return 1
  if (state !== 'started') return 0

  const paged = Boolean(doc.pageCount && doc.pageCount > 0)
  if (!paged) return 0.14

  return Math.max(0.14, p?.completion ?? 0)
}

/** Screen-reader text for a margin mark, so the colour is never the sole carrier. */
export function readLabel(state: ReadState, isNext: boolean, activeMs?: number): string {
  const spent = activeMs && activeMs > 0 ? ` ${formatSpent(activeMs)} in this document.` : ''
  if (state === 'read') return `Read.${spent}`
  if (state === 'started') return `Started.${spent}`
  return isNext ? 'Not opened. Read this next.' : 'Not opened.'
}

function formatSpent(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}
