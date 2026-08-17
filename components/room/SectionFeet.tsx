import Link from 'next/link'
import type { VisibleFolder } from '@/lib/room'
import { displayFolderName, folderIndex } from '@/lib/brand'

/**
 * The running feet: what comes before this section and what comes after.
 *
 * The document counts are deliberate — they let a reader decide whether it is
 * worth walking forward before they spend a click finding out.
 *
 * When the reader has finished this section the forward arrow is set in the
 * read-mark colour: the section's tick, having nowhere left to go inside it,
 * points out of it.
 */
export function SectionFeet({
  folders,
  currentSlug,
  finished,
}: {
  folders: VisibleFolder[]
  currentSlug: string
  finished: boolean
}) {
  const at = folders.findIndex((f) => f.slug === currentSlug)
  const previous = at > 0 ? folders[at - 1] : null
  const next = at > -1 && at < folders.length - 1 ? folders[at + 1] : null

  return (
    <footer className="mt-14">
      <div className="h-px" style={{ background: 'var(--border-strong)' }} />

      <div className="grid grid-cols-1 gap-6 pt-6 sm:grid-cols-2">
        <div>
          {previous ? (
            <Link href={`/room/${previous.slug}`} className="group block">
              <p className="label">← {folderIndex(previous.name) ?? ''}</p>
              <p
                className="link-ed font-display mt-1 text-[1rem]"
                style={{ color: 'var(--text-primary)' }}
              >
                {displayFolderName(previous.name)}
              </p>
              <p className="label tnum mt-1">
                {previous.documentCount} {previous.documentCount === 1 ? 'document' : 'documents'}
              </p>
            </Link>
          ) : (
            <Link href="/room" className="group block">
              <p className="label">←</p>
              <p
                className="link-ed font-display mt-1 text-[1rem]"
                style={{ color: 'var(--text-primary)' }}
              >
                The contents
              </p>
            </Link>
          )}
        </div>

        <div className="sm:text-right">
          {next ? (
            <Link href={`/room/${next.slug}`} className="group block">
              <p className="label" style={finished ? { color: 'var(--read-mark)' } : undefined}>
                {folderIndex(next.name) ?? ''} →
              </p>
              <p
                className="link-ed font-display mt-1 text-[1rem]"
                style={{ color: 'var(--text-primary)' }}
              >
                {displayFolderName(next.name)}
              </p>
              <p className="label tnum mt-1">
                {next.documentCount} {next.documentCount === 1 ? 'document' : 'documents'}
              </p>
            </Link>
          ) : (
            <Link href="/room" className="group block">
              <p className="label" style={finished ? { color: 'var(--read-mark)' } : undefined}>
                →
              </p>
              <p
                className="link-ed font-display mt-1 text-[1rem]"
                style={{ color: 'var(--text-primary)' }}
              >
                The contents
              </p>
            </Link>
          )}
        </div>
      </div>
    </footer>
  )
}
