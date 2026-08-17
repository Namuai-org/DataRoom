import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { format } from 'date-fns'
import { requireVisitor, canDownload } from '@/lib/auth'
import {
  getFolderWithDocuments,
  getVisitorProgress,
  getVisibleFolders,
  getRoomSettings,
  type VisibleDocument,
} from '@/lib/room'
import { displayFolderName, folderIndex, brand } from '@/lib/brand'
import { readState } from '@/lib/reading'
import { Colophon } from '@/components/room/Colophon'
import { RunningHead } from '@/components/room/RunningHead'
import { SectionFeet } from '@/components/room/SectionFeet'
import { Register, buildEntries, chooseRailUnit } from '@/components/room/Register'
import { Accession, ReadMark } from '@/components/room/Folio'
import { readFraction, readLabel } from '@/lib/reading'

export const dynamic = 'force-dynamic'

/**
 * A section of the dossier.
 *
 * Running head, opener with the section numeral hanging in the margin, a
 * colophon band carrying the section's facts and its one action, a lead item at
 * larger scale, then the ruled register. A pure Server Component — nothing on
 * this page hydrates.
 */
export default async function FolderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const [result, progress, folders, settings] = await Promise.all([
    getFolderWithDocuments(auth.link, slug),
    getVisitorProgress(auth.visitor.id),
    getVisibleFolders(auth.link),
    getRoomSettings(),
  ])
  if (!result) notFound()

  const { folder, documents, withheldCount } = result

  const sectionIndex = folderIndex(folder.name) ?? '00'
  const states = documents.map((d) => readState(d, progress.get(d.id)))
  const nextIndex = states.findIndex((s) => s === 'unread')
  const unread = states.filter((s) => s === 'unread').length
  const finished = documents.length > 0 && unread === 0
  const railUnit = chooseRailUnit(documents)

  // Three or more documents earn a lead item; below that a section reads as
  // composed rather than half-finished if it goes straight into the register.
  const lead = documents.length >= 3 ? documents[0]! : null
  const body = lead ? documents.slice(1) : documents

  const entries = buildEntries({
    documents: body,
    sectionIndex,
    folderTier: folder.tier,
    folderSlug: folder.slug,
    progress,
    canDownload: (doc) => canDownload(auth.link, doc),
  })

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <RunningHead
        sectionIndex={sectionIndex}
        sectionTotal={folders.length}
        sectionName={displayFolderName(folder.name)}
        itemCount={documents.length}
      />

      <div className="max-w-[54rem]">
        {/* ---- Section opener ---- */}
        <header className="pt-12 lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-x-8">
          <span
            aria-hidden
            className="font-display tnum block text-[1.5rem] leading-[0.85] lg:pt-[0.06em] lg:text-[clamp(2.5rem,5vw,3.5rem)]"
            style={{ color: 'var(--rule-ghost)' }}
          >
            {sectionIndex}
          </span>

          <div className="mt-2 lg:mt-0">
            <div className="flex items-baseline gap-4">
              <p className="label shrink-0">
                Section {sectionIndex} of {folders.length}
              </p>
              <span aria-hidden className="hairline flex-1" />
            </div>

            <h1
              className="font-display mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.02] tracking-[-0.025em]"
              style={{ color: 'var(--text-primary)' }}
            >
              {displayFolderName(folder.name)}
            </h1>

            {folder.description && (
              <p
                className="mt-4 max-w-[34rem] text-[1.0625rem] leading-[1.65]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {folder.description}
              </p>
            )}
          </div>
        </header>

        {/* ---- Colophon band ---- */}
        <section
          className="-mx-4 mt-8 border-y px-4 py-3.5 sm:mx-0 sm:px-5"
          style={{
            background: 'var(--field-warm)',
            borderColor: 'var(--border-subtle)',
            borderRadius: 'var(--radius-sheet)',
          }}
        >
          <Colophon
            segments={[
              `${documents.length} ${documents.length === 1 ? 'item' : 'items'}`,
              kindSummary(documents),
              lastUpdated(documents),
              documents.length === 0 ? (
                'Nothing released to you yet'
              ) : unread === 0 ? (
                <span style={{ color: 'var(--complete)' }}>All read</span>
              ) : (
                `${unread} unread`
              ),
            ]}
          />

          {documents.length > 0 && (
            <p className="mt-2.5">
              <Link
                href={nextAction(documents, states, nextIndex, folder.slug, folders, slug).href}
                className="max-w-full truncate text-[0.875rem] underline decoration-1 underline-offset-[0.22em]"
                style={{
                  color: 'var(--text-primary)',
                  textDecorationColor: 'var(--border-strong)',
                }}
              >
                {nextAction(documents, states, nextIndex, folder.slug, folders, slug).label}
              </Link>
            </p>
          )}
        </section>

        {/* ---- Lead item ---- */}
        {lead && (
          <>
            <article className="group relative mt-10 lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] lg:gap-x-8">
              <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
                <Accession value={`${sectionIndex}.${String(lead.sortOrder).padStart(2, '0')}`} />
                <ReadMark
                  state={
                    states[0] === 'unread' && nextIndex === 0 ? 'next' : states[0]!
                  }
                  fraction={readFraction(lead, states[0]!, progress.get(lead.id))}
                  label={readLabel(states[0]!, nextIndex === 0, progress.get(lead.id)?.activeMs)}
                />
              </div>

              <div className="mt-3 min-w-0 lg:mt-0">
                <h2
                  className="link-ed font-display text-[clamp(1.5rem,3vw,2rem)] leading-[1.1]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {lead.title}
                </h2>

                {lead.description && (
                  <p
                    className="mt-3 max-w-[34rem] text-[1rem] leading-[1.75]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {lead.description}
                  </p>
                )}

                <Colophon
                  className="mt-3"
                  segments={[
                    lead.fileName.split('.').pop()?.toUpperCase() ?? 'File',
                    lead.pageCount ? `${lead.pageCount} pp` : null,
                    lead.sizeBytes > 0 ? formatBytesShort(lead.sizeBytes) : null,
                    `Filed ${format(lead.contentUpdatedAt ?? lead.createdAt, 'd MMM yyyy')}`,
                  ]}
                />
              </div>

              <Link
                href={`/room/${folder.slug}/${lead.id}`}
                className="after:absolute after:inset-0"
                aria-label={`${sectionIndex}.${String(lead.sortOrder).padStart(2, '0')}. ${lead.title}. ${readLabel(states[0]!, nextIndex === 0, progress.get(lead.id)?.activeMs)}`}
              >
                <span className="sr-only">Open document</span>
              </Link>
            </article>

            <div className="my-10 h-px" style={{ background: 'var(--border-strong)' }} />
          </>
        )}

        {/* ---- Register ---- */}
        {documents.length === 0 ? (
          <EmptySection />
        ) : (
          <Register
            entries={entries}
            railUnit={railUnit}
            collapseAfter={body.length > 6 ? 3 : 0}
            sealedCount={settings.showSealedCount ? withheldCount : 0}
            contactEmail={brand.contact}
          />
        )}

        <SectionFeet folders={folders} currentSlug={slug} finished={finished} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section facts                                                              */
/* -------------------------------------------------------------------------- */

/** "9 XLSX · 1 PDF" — the extension, not a friendly noun. Grounded voice. */
function kindSummary(documents: VisibleDocument[]): string | null {
  if (documents.length === 0) return null

  const counts = new Map<string, number>()
  for (const doc of documents) {
    const ext = doc.fileName.split('.').pop()
    const key = ext && ext.length <= 5 ? ext.toUpperCase() : 'FILE'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const shown = sorted.slice(0, 3).map(([ext, n]) => `${n} ${ext}`)
  const rest = sorted.slice(3).reduce((sum, [, n]) => sum + n, 0)
  if (rest > 0) shown.push(`+${rest} other`)
  return shown.join(' · ')
}

function lastUpdated(documents: VisibleDocument[]): string | null {
  if (documents.length === 0) return null
  const latest = documents.reduce<Date | null>((best, doc) => {
    const at = doc.contentUpdatedAt ?? doc.createdAt
    return !best || at > best ? at : best
  }, null)
  return latest ? `Updated ${format(latest, 'd MMM')}` : null
}

/** The section's single action: where to start, where to resume, or where next. */
function nextAction(
  documents: VisibleDocument[],
  states: ReturnType<typeof readState>[],
  nextIndex: number,
  slug: string,
  folders: { slug: string; name: string }[],
  currentSlug: string,
): { href: string; label: string } {
  const startedIndex = states.findIndex((s) => s === 'started')

  if (startedIndex > -1) {
    const doc = documents[startedIndex]!
    return { href: `/room/${slug}/${doc.id}`, label: `Continue — ${doc.title} →` }
  }

  if (nextIndex > -1) {
    const doc = documents[nextIndex]!
    const verb = nextIndex === 0 ? 'Start here' : 'Next'
    return { href: `/room/${slug}/${doc.id}`, label: `${verb} — ${doc.title} →` }
  }

  const at = folders.findIndex((f) => f.slug === currentSlug)
  const next = at > -1 && at < folders.length - 1 ? folders[at + 1] : null
  return next
    ? {
        href: `/room/${next.slug}`,
        label: `Next section: ${folderIndex(next.name) ?? ''} ${displayFolderName(next.name)} →`,
      }
    : { href: '/room', label: 'Back to the contents →' }
}

function formatBytesShort(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function EmptySection() {
  return (
    <div className="mt-10">
      <div className="h-px" style={{ background: 'var(--border-strong)' }} />
      <p
        className="font-display mt-8 text-[1.25rem] italic"
        style={{ color: 'var(--text-primary)' }}
      >
        This section is filed but not yet released to your access.
      </p>
      <p
        className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        Sections open as diligence progresses. Write to{' '}
        <a
          href={`mailto:${brand.contact}`}
          className="underline decoration-1 underline-offset-[0.22em]"
          style={{ textDecorationColor: 'var(--border-strong)' }}
        >
          {brand.contact}
        </a>{' '}
        if you need something here now.
      </p>
    </div>
  )
}
