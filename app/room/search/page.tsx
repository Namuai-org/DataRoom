import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireVisitor, canDownload } from '@/lib/auth'
import { searchDocuments, getVisitorProgress, getVisibleFolders } from '@/lib/room'
import { recordEvent } from '@/lib/analytics'
import { displayFolderName, folderIndex, brand } from '@/lib/brand'
import { Colophon } from '@/components/room/Colophon'
import { Register, buildEntries, chooseRailUnit } from '@/components/room/Register'

export const dynamic = 'force-dynamic'

/** Results, set in the same register as a section, with the source section as a kicker. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const query = (q ?? '').trim()

  const [results, progress, folders] = await Promise.all([
    query ? searchDocuments(auth.link, query) : Promise.resolve([]),
    getVisitorProgress(auth.visitor.id),
    getVisibleFolders(auth.link),
  ])

  if (query) {
    // Search terms are worth keeping: they say what a reader came looking for,
    // including the things the room does not yet answer.
    await recordEvent({
      type: 'search',
      sessionId: auth.session.sessionId,
      visitorId: auth.visitor.id,
      label: query,
      metadata: { resultCount: results.length },
    })
  }

  const folderBySlug = new Map(folders.map((f) => [f.slug, f]))

  const entries = results.map((doc) => {
    const folder = folderBySlug.get(doc.folderSlug)
    const built = buildEntries({
      documents: [doc],
      sectionIndex: folderIndex(doc.folderName) ?? '00',
      folderTier: folder?.tier ?? 'diligence',
      folderSlug: doc.folderSlug,
      progress,
      canDownload: (d) => canDownload(auth.link, d),
      kickerFor: () => displayFolderName(doc.folderName),
    })[0]!
    return { ...built, isNext: false }
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
            <p className="label shrink-0">Search</p>
            <span aria-hidden className="hairline flex-1" />
          </div>

          <h1
            className="font-display mt-3 text-[clamp(1.75rem,3.6vw,2.5rem)] leading-[1.05] tracking-[-0.025em]"
            style={{ color: 'var(--text-primary)' }}
          >
            {query ? <>“{query}”</> : 'Search the room'}
          </h1>

          <div className="rule-masthead mt-8" />
        </header>

        <Colophon
          className="mt-3"
          segments={[
            query
              ? `${results.length} ${results.length === 1 ? 'document' : 'documents'}`
              : 'Type at least two characters',
          ]}
        />

        {query && results.length === 0 ? (
          <div className="mt-10">
            <p className="font-display text-[1.25rem] italic" style={{ color: 'var(--text-primary)' }}>
              Nothing matched.
            </p>
            <p
              className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              If you are looking for something that should be here, ask for it directly and we will
              add it — or write to{' '}
              <a
                href={`mailto:${brand.contact}`}
                className="underline decoration-1 underline-offset-[0.22em]"
                style={{ textDecorationColor: 'var(--border-strong)' }}
              >
                {brand.contact}
              </a>
              .
            </p>
            <Link
              href="/room/questions"
              className="mt-5 inline-block px-4 py-2 text-[0.8125rem] font-medium"
              style={{
                background: 'var(--text-primary)',
                color: 'var(--surface)',
                borderRadius: 'var(--radius-sheet)',
              }}
            >
              Request a document
            </Link>
          </div>
        ) : results.length > 0 ? (
          <div className="mt-10">
            <Register entries={entries} railUnit={chooseRailUnit(results)} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
