'use client'

import { useEffect, useState } from 'react'
import { formatDateTime, formatRelative, toISO, type DateInput } from '@/app/admin/_lib/format'

/**
 * Renders an absolute UTC timestamp on the server and swaps to relative
 * phrasing once mounted.
 *
 * Doing it the other way round — relative on both sides — guarantees a
 * hydration mismatch, because the server's clock and the browser's clock are
 * never the same millisecond. The absolute form is the honest fallback: it is
 * what the audit trail actually recorded.
 */
export function RelativeTime({
  value,
  className,
  empty = '—',
}: {
  value: DateInput
  className?: string
  empty?: string
}) {
  const absolute = formatDateTime(value, empty)
  const [label, setLabel] = useState(absolute)

  useEffect(() => {
    if (!value) return
    const update = () => setLabel(formatRelative(value))
    update()
    // Minute-resolution refresh keeps "just now" from going stale on a screen
    // someone leaves open.
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [value])

  if (!value) return <span className={className}>{empty}</span>

  return (
    <time dateTime={toISO(value)} title={absolute} className={className} suppressHydrationWarning>
      {label}
    </time>
  )
}
