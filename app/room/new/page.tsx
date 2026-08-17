import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import { requireVisitor, canDownload } from '@/lib/auth'
import { getWhatsNew, getVisitorProgress, getVisibleFolders } from '@/lib/room'
import { displayFolderName, folderIndex } from '@/lib/brand'
import { Colophon } from '@/components/room/Colophon'
import { Register, buildEntries, chooseRailUnit } from '@/components/room/Register'

export const dynamic = 'force-dynamic'

/**
 * What changed since the reader was last here, set in the same register as a
 * section — same accession numbers, same deck line, same read marks. The only
 * difference is a kicker naming which section each document came from, because
 * on this page that is not obvious from context.
 */
export default async function WhatsNewPage() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const [{ since, documents }, progress, folders] = await Promise.all([
    getWhatsNew(auth.link, auth.visitor.id),
    getVisitorProgress(auth.visitor.id),
    getVisibleFolders(auth.link),
  ])

  const folderBySlug = new Map(folders.map((f) => [f.slug, f]))

  const entries = documents.map((doc, i) => {
    const folder = folderBySlug.get(doc.folderSlug)
    const sectionIndex = folderIndex(doc.folderName) ?? '00'
    const built = buildEntries({
      documents: [doc],
      sectionIndex,
      folderTier: folder?.tier ?? 'diligence',
      folderSlug: doc.folderSlug,
      progress,
      canDownload: (d) => canDownload(auth.link, d),
      kickerFor: () => displayFolderName(doc.folderName),
    })[0]!
    // Each document is built alone, so nothing is ever "next" on this page —
    // the reading route belongs to a section, not to a changelog.
    return { ...built, isNext: false, key: i }
  })

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <div className="max-w-[54rem]">
        <Link href="/room" className="label inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
          <ChevronLeft size={13} aria-hidden />
          Contents
        </Link>

        <header className="mt-8">
          <div className="flex items-baseline gap-4">
            <p className="label shrink-0">Since your last visit</p>
            <span aria-hidden className="hairline flex-1" />
          </div>

          <h1
            className="font-display mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.02] tracking-[-0.025em]"
            style={{ color: 'var(--text-primary)' }}
          >
            What changed
          </h1>

          <div className="rule-masthead mt-8" />
        </header>

        <Colophon
          className="mt-3"
          segments={[
            `${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`,
            since ? `You were last here ${format(since, 'd MMMM')}` : null,
          ]}
        />

        {documents.length === 0 ? (
          <p
            className="font-display mt-10 text-[1.25rem] italic"
            style={{ color: 'var(--text-primary)' }}
          >
            Nothing has been added or updated since you were last here.
          </p>
        ) : (
          <div className="mt-10">
            <Register entries={entries} railUnit={chooseRailUnit(documents)} />
          </div>
        )}
      </div>
    </div>
  )
}
