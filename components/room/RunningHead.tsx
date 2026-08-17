import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

/**
 * The running head of a section — both the way back and the answer to "where am
 * I", which is why it replaces the standalone back link and saves the page a
 * couple of rems of vertical space.
 *
 * Sticky below the room header (`h-16`), on a blurred field so ruled rows pass
 * cleanly underneath it.
 */
export function RunningHead({
  sectionIndex,
  sectionTotal,
  sectionName,
  itemCount,
}: {
  sectionIndex: string
  sectionTotal: number
  sectionName: string
  itemCount: number
}) {
  return (
    <div
      className="sticky top-16 z-30 -mx-5 flex h-[2.125rem] items-center gap-3 border-b px-5 backdrop-blur-xl sm:-mx-8 sm:px-8"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
      }}
    >
      <Link href="/room" className="label flex items-center gap-1 hover:text-[var(--text-primary)]">
        <ChevronLeft size={13} aria-hidden />
        Contents
      </Link>

      <span aria-hidden className="rule-v" />

      <p className="label tnum min-w-0 truncate">
        <span className="hidden sm:inline">Section </span>
        {sectionIndex} of {sectionTotal} · {sectionName}
      </p>

      <p className="label tnum ml-auto shrink-0">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </p>
    </div>
  )
}
