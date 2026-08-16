/**
 * Date formatting for the console.
 *
 * Everything absolute is rendered in UTC and says so. Two reasons: the server
 * and the browser would otherwise disagree during hydration, and an audit trail
 * that silently shifts with the reader's timezone is not an audit trail.
 * Relative phrasing ("4 minutes ago") is only ever produced on the client,
 * after mount, by <RelativeTime />.
 */

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

export type DateInput = Date | string | number | null | undefined

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "12 Aug 2026" */
export function formatDate(value: DateInput, empty = '—'): string {
  const date = toDate(value)
  return date ? DATE_FMT.format(date) : empty
}

/** "12 Aug 2026, 14:03 UTC" */
export function formatDateTime(value: DateInput, empty = '—'): string {
  const date = toDate(value)
  if (!date) return empty
  return `${DATE_FMT.format(date)}, ${TIME_FMT.format(date)} UTC`
}

/** "14:03 UTC" */
export function formatTime(value: DateInput, empty = '—'): string {
  const date = toDate(value)
  return date ? `${TIME_FMT.format(date)} UTC` : empty
}

/** ISO-8601, for <time dateTime> and for sorting. */
export function toISO(value: DateInput): string | undefined {
  return toDate(value)?.toISOString()
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "just now" / "18 minutes ago" / "3 days ago". Client-side only — it depends
 * on the current clock, so rendering it on the server guarantees a mismatch.
 */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const date = toDate(value)
  if (!date) return '—'
  const delta = now - date.getTime()

  if (delta < 0) {
    const ahead = Math.abs(delta)
    if (ahead < HOUR) return `in ${Math.max(1, Math.round(ahead / MINUTE))} min`
    if (ahead < DAY) return `in ${Math.round(ahead / HOUR)} h`
    return `in ${Math.round(ahead / DAY)} days`
  }

  if (delta < 45_000) return 'just now'
  if (delta < HOUR) {
    const minutes = Math.round(delta / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (delta < DAY) {
    const hours = Math.round(delta / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (delta < 30 * DAY) {
    const days = Math.round(delta / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return formatDate(date)
}

/** "62%" — completion and other 0..1 ratios. */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** Groups thousands so long counts stay readable in a table. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-GB').format(Math.round(value))
}
