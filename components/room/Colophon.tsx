import { cn } from '@/lib/utils'

/**
 * The fact strip.
 *
 * One typographic object used in four places — the room's dateline, a section's
 * colophon band, a document's deck line, and the viewer's foot. A reader learns
 * to scan it once and then reads it everywhere without relearning, which is the
 * whole argument for having it.
 *
 * Separators are drawn by CSS (`.deck > * + *::before`) rather than passed in,
 * so a strip that wraps to two rows never strands a rule at the end of a line.
 * `null` and `undefined` segments are dropped, which lets callers write the
 * order once and let absent facts fall out.
 */
export function Colophon({
  segments,
  className,
}: {
  segments: (React.ReactNode | null | undefined | false)[]
  className?: string
}) {
  const kept = segments.filter((s) => s !== null && s !== undefined && s !== false)
  if (kept.length === 0) return null

  return (
    <div className={cn('deck tnum', className)}>
      {kept.map((segment, index) => (
        <span key={index}>{segment}</span>
      ))}
    </div>
  )
}
