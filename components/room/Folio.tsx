import { cn } from '@/lib/utils'
import type { ReadState } from '@/lib/reading'

/**
 * The margin column: an accession number with a read mark beneath it.
 *
 * The accession number is the document's address — "04.03" is section four,
 * item three — and it is derived from the stored sort order rather than the
 * render position, so two investors on different disclosure tiers cite the same
 * number for the same file when they are on a call about it. The same string
 * appears again in the viewer's running head and at the foot of the page.
 */

export function Accession({ value, className }: { value: string; className?: string }) {
  return <span className={cn('folio', className)}>{value}</span>
}

/**
 * How far through this document the reader got — and the only place Sahel
 * appears in the room.
 *
 * `state="next"` draws a 4px leading edge on the single entry the reader should
 * open first, so a first visit is never entirely cold. When a section is
 * finished the whole column is warm.
 */
export function ReadMark({
  state,
  fraction,
  label,
  className,
}: {
  state: ReadState | 'next'
  fraction: number
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span
        className="read-mark"
        data-state={state}
        style={{ ['--read' as string]: String(Math.max(0, Math.min(1, fraction))) }}
        aria-hidden
      >
        <i />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Stacked for the desktop margin column; inline once the margin disappears. */
export function Folio({
  accession,
  state,
  fraction,
  label,
  orientation = 'stacked',
}: {
  accession: string
  state: ReadState | 'next'
  fraction: number
  label: string
  orientation?: 'stacked' | 'inline'
}) {
  if (orientation === 'inline') {
    return (
      <span className="flex items-center gap-3">
        <Accession value={accession} />
        <ReadMark state={state} fraction={fraction} label={label} />
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-2">
      <Accession value={accession} />
      <ReadMark state={state} fraction={fraction} label={label} />
    </span>
  )
}
