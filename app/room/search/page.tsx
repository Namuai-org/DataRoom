import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireVisitor } from '@/lib/auth'
import { searchDocuments } from '@/lib/room'
import { recordEvent } from '@/lib/analytics'
import { displayFolderName } from '@/lib/brand'
import { formatBytes } from '@/lib/utils'
import { DocumentIcon, kindLabel } from '@/components/room/DocumentIcon'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const query = (q ?? '').trim()
  const results = query ? await searchDocuments(auth.link, query) : []

  if (query) {
    // Search terms are worth keeping: they say what an investor came looking
    // for, including the things the room does not yet answer.
    await recordEvent({
      type: 'search',
      sessionId: auth.session.sessionId,
      visitorId: auth.visitor.id,
      label: query,
      metadata: { resultCount: results.length },
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <Link
        href="/room"
        className="mb-9 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--text-primary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={14} />
        All folders
      </Link>

      <h1 className="font-display text-[1.7rem] leading-tight" style={{ color: 'var(--text-primary)' }}>
        {query ? <>Results for “{query}”</> : 'Search'}
      </h1>
      <p className="mt-2 text-sm tnum" style={{ color: 'var(--text-muted)' }}>
        {query
          ? `${results.length} ${results.length === 1 ? 'document' : 'documents'}`
          : 'Type at least two characters in the search field above.'}
      </p>

      {query && results.length === 0 && (
        <div className="namu-card mt-8 p-8 text-center" style={{ boxShadow: 'none' }}>
          <p className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
            Nothing matched
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
            If you are looking for something that should be here, ask for it directly and we will
            add it.
          </p>
          <Link
            href="/room/questions"
            className="mt-5 inline-block rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
          >
            Request a document
          </Link>
        </div>
      )}

      {results.length > 0 && (
        <ul className="stagger mt-8 flex flex-col gap-2">
          {results.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/room/${doc.folderSlug}/${doc.id}`}
                className="namu-card namu-card-interactive flex items-start gap-4 p-4 sm:p-5"
              >
                <span className="mt-0.5 flex-none" style={{ color: 'var(--text-muted)' }}>
                  <DocumentIcon kind={doc.kind} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {doc.title}
                  </h2>
                  {doc.description && (
                    <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      {doc.description}
                    </p>
                  )}
                  <p className="mt-2 text-[11.5px] tnum" style={{ color: 'var(--text-muted)' }}>
                    {displayFolderName(doc.folderName)} · {kindLabel(doc.kind)}
                    {doc.sizeBytes > 0 && ` · ${formatBytes(doc.sizeBytes)}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
