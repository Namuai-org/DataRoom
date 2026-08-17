import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { requireVisitor } from '@/lib/auth'
import { getVisibleFolders, getRoomSettings, getWhatsNew, getVisitorProgress } from '@/lib/room'
import { displayFolderName, folderIndex, brand } from '@/lib/brand'
import { Colophon } from '@/components/room/Colophon'
import { Leader } from '@/components/room/Leader'
import { ReadMark } from '@/components/room/Folio'

export const dynamic = 'force-dynamic'

/**
 * The contents page.
 *
 * Set as the front matter of a printed dossier rather than a dashboard: a
 * masthead, a dateline, and ten ruled entries with dotted leaders running out
 * to their extents. No cards, no shadows, no hover lifts — the brand board asks
 * for "quiet fields, generous margins, and left alignment", and this page is
 * that instruction taken literally.
 *
 * Sahel appears exactly once: the read marks in the margin column, measuring
 * how far through each section the reader has got.
 */
export default async function RoomIndex() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const [folders, settings, whatsNew, progress] = await Promise.all([
    getVisibleFolders(auth.link),
    getRoomSettings(),
    getWhatsNew(auth.link, auth.visitor.id),
    getVisitorProgress(auth.visitor.id),
  ])

  const totalDocuments = folders.reduce((sum, f) => sum + f.documentCount, 0)
  const preparedFor = auth.visitor.name ?? auth.visitor.email

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <div className="max-w-[54rem]">
        {/* ---- Masthead ---- */}
        <header>
          <p className="label tnum">
            Confidential{preparedFor ? ` · Prepared for ${preparedFor}` : ''}
          </p>

          <h1
            className="font-display mt-5 max-w-[22ch] text-[clamp(2.1rem,4.6vw,3.25rem)] leading-[0.98] tracking-[-0.025em]"
            style={{ color: 'var(--text-primary)' }}
          >
            {brand.tagline}
          </h1>

          <p
            className="mt-6 max-w-[36rem] text-[1.0625rem] leading-[1.7]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {settings.welcomeMessage}
          </p>

          <div className="rule-masthead mt-10" />
        </header>

        {/* ---- Dateline ---- */}
        <Colophon
          className="mt-3"
          segments={[
            brand.legalName,
            'Seed data room',
            `${folders.length} sections · ${totalDocuments} documents`,
            whatsNew.since
              ? `Last visit ${formatDistanceToNow(whatsNew.since, { addSuffix: false })} ago`
              : null,
          ]}
        />

        {/* ---- What changed ---- */}
        {whatsNew.documents.length > 0 && (
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="sahel-dot self-center" />
            <span
              className="font-display text-[1.0625rem] italic"
              style={{ color: 'var(--text-primary)' }}
            >
              {whatsNew.documents.length === 1
                ? 'One document was added since your last visit'
                : `${whatsNew.documents.length} documents were added since your last visit`}
            </span>
            <span className="text-[0.875rem]" style={{ color: 'var(--text-secondary)' }}>
              {whatsNew.documents
                .slice(0, 3)
                .map((d) => d.title)
                .join(' · ')}
            </span>
            <Link
              href="/room/new"
              className="text-[0.875rem] underline decoration-1 underline-offset-[0.22em]"
              style={{ color: 'var(--text-primary)', textDecorationColor: 'var(--border-strong)' }}
            >
              See what changed
            </Link>
          </p>
        )}

        {/* ---- Contents ---- */}
        {folders.length === 0 ? (
          <EmptyRoom />
        ) : (
          <section className="mt-14">
            <div className="flex items-baseline gap-4">
              <h2 className="label">Contents</h2>
              <span aria-hidden className="hairline flex-1" />
              <span className="label tnum">
                {totalDocuments} {totalDocuments === 1 ? 'document' : 'documents'}
              </span>
            </div>

            <ol className="set-in mt-2">
              {folders.map((folder, index) => {
                const readCount = folder.documentIds.filter((id) => progress.has(id)).length
                const fraction = folder.documentCount
                  ? readCount / folder.documentCount
                  : 0
                const empty = folder.documentCount === 0

                return (
                  <li
                    key={folder.id}
                    className="group relative -mx-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-6 border-t px-3 py-[1.125rem] transition-colors duration-200 last:border-b hover:bg-[var(--field-warm)]"
                    style={{
                      ['--i' as string]: index,
                      borderColor: 'var(--border-subtle)',
                      transitionTimingFunction: 'var(--ease-namu)',
                    }}
                  >
                    {/* Margin column: section numeral over its read mark */}
                    <div className="flex flex-col gap-2">
                      <span
                        className="font-display tnum text-[1.5rem] leading-none"
                        style={{ color: 'var(--text-muted)' }}
                        aria-hidden
                      >
                        {folderIndex(folder.name) ?? '—'}
                      </span>
                      {!empty && (
                        <ReadMark
                          state={readCount === 0 ? 'unread' : readCount === folder.documentCount ? 'read' : 'started'}
                          fraction={fraction}
                          label={
                            readCount === 0
                              ? 'None of this section opened yet.'
                              : `${readCount} of ${folder.documentCount} documents opened.`
                          }
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-baseline">
                        <h3
                          className="link-ed font-display text-[clamp(1.25rem,2vw,1.5rem)] leading-tight"
                          style={{ color: empty ? 'var(--text-muted)' : 'var(--text-primary)' }}
                        >
                          {displayFolderName(folder.name)}
                        </h3>
                        {!empty && <Leader />}
                        <span
                          className="font-display tnum ml-auto w-12 shrink-0 text-right text-[1.125rem] sm:ml-0"
                          style={{ color: empty ? 'var(--text-muted)' : 'var(--text-primary)' }}
                          aria-hidden
                        >
                          {empty ? '—' : folder.documentCount}
                        </span>
                      </div>

                      {folder.description && (
                        <p
                          className="mt-1.5 line-clamp-2 text-[0.875rem] leading-[1.6] lg:line-clamp-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {folder.description}
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/room/${folder.slug}`}
                      className="after:absolute after:inset-0"
                      aria-label={`${displayFolderName(folder.name)}. ${
                        empty
                          ? 'Nothing released to you yet.'
                          : `${folder.documentCount} documents, ${readCount} opened.`
                      }`}
                    >
                      <span className="sr-only">Open section</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* ---- Enquiries ---- */}
        {settings.qaEnabled && folders.length > 0 && (
          <section className="mt-16">
            <div className="h-px" style={{ background: 'var(--border-strong)' }} />
            <div
              className="mt-0 grid gap-4 px-4 py-6 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-5"
              style={{ background: 'var(--field-warm)', borderRadius: 'var(--radius-sheet)' }}
            >
              <p className="label pt-1">Enquiries</p>
              <div>
                <p
                  className="font-display text-[1.0625rem] italic"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Something you cannot find?
                </p>
                <p
                  className="mt-1.5 max-w-[34rem] text-[0.875rem] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Ask here and we will answer inside the room, so the thread stays with the
                  document.
                </p>
                <Link
                  href="/room/questions"
                  className="mt-4 inline-block px-4 py-2 text-[0.8125rem] font-medium"
                  style={{
                    background: 'var(--text-primary)',
                    color: 'var(--surface)',
                    borderRadius: 'var(--radius-sheet)',
                  }}
                >
                  Ask a question
                </Link>
              </div>
            </div>
          </section>
        )}

        {whatsNew.since && (
          <p className="label tnum mt-10">
            You were last here {format(whatsNew.since, 'd MMMM')}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyRoom() {
  return (
    <div className="mt-10">
      <p className="font-display text-[1.25rem] italic" style={{ color: 'var(--text-primary)' }}>
        Nothing has been shared with you yet.
      </p>
      <p
        className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        Your access is active, but no sections have been released to it. Write to{' '}
        <a
          href={`mailto:${brand.contact}`}
          className="underline decoration-1 underline-offset-[0.22em]"
          style={{ textDecorationColor: 'var(--border-strong)' }}
        >
          {brand.contact}
        </a>{' '}
        and we will open the right ones.
      </p>
    </div>
  )
}
