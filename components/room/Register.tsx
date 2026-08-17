import Link from 'next/link'
import { format } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import type { VisibleDocument } from '@/lib/room'
import { resolveTier } from '@/lib/db/schema'
import { readState, readFraction, readLabel, type Progress, type ReadState } from '@/lib/reading'
import { formatBytes } from '@/lib/utils'
import { StageNote } from './StageNote'
import { Accession, ReadMark } from './Folio'

/**
 * The register: a ruled column of documents with hanging accession numbers.
 *
 * Not a table and not a list of cards. Each entry is a ruled row with its
 * address in the margin, its facts on a fixed-order deck line, and its extent
 * in a right-hand rail of aligned figures. Nothing lifts, scales or casts a
 * shadow on hover — four colours change and that is all, which is what makes
 * the room read as a printed object rather than a dashboard.
 *
 * HONEST-MEASUREMENT INVARIANT. The extent rail prints one unit for the whole
 * section, never a mix, and if no document in the set has a measurable extent
 * the rail is not drawn at all. Never substitute a dash for a number the room
 * does not have — an instrument that reads zero is worse than no instrument.
 *
 * ORDER IS EDITORIAL. The register never re-sorts by read state or recency and
 * carries no sort control. A book does not rearrange itself because you read
 * page four. Reading state lives in the margin instead.
 */

export type RailUnit = 'pages' | 'bytes' | 'none'

export type RegisterEntryData = {
  doc: VisibleDocument
  accession: string
  state: ReadState
  fraction: number
  isNext: boolean
  progress?: Progress
  canDownload: boolean
  folderTier: string
  href: string
  /** Shown above the title on /room/new and /room/search, where a row's section is not obvious. */
  kicker?: string
}

/** Decides the section's one extent unit. Exported so pages can pass it down. */
export function chooseRailUnit(documents: VisibleDocument[]): RailUnit {
  if (documents.length === 0) return 'none'
  const paged = documents.filter((d) => (d.pageCount ?? 0) > 0).length
  if (paged / documents.length >= 0.6) return 'pages'
  if (documents.some((d) => d.sizeBytes > 0)) return 'bytes'
  return 'none'
}

/* -------------------------------------------------------------------------- */
/*  Deck line                                                                  */
/* -------------------------------------------------------------------------- */

function extensionOf(fileName: string): string | null {
  const ext = fileName.split('.').pop()
  return ext && ext.length <= 5 && ext !== fileName ? ext.toUpperCase() : null
}

/**
 * The fixed-order fact line. Order never varies, so a column of fourteen
 * near-identical legal templates still scans vertically: format always lands at
 * the same x, extent always second, restriction always fifth.
 */
function Deck({ entry }: { entry: RegisterEntryData }) {
  const { doc } = entry
  const ext = extensionOf(doc.fileName)
  const revised =
    doc.contentUpdatedAt && doc.contentUpdatedAt.getTime() - doc.createdAt.getTime() > 86_400_000

  const segments: React.ReactNode[] = []

  segments.push(
    <span key="format" className="inline-block w-[3.25rem]">
      {ext ?? 'File'}
    </span>,
  )
  if (doc.pageCount) segments.push(<span key="extent">{doc.pageCount} pp</span>)
  if (doc.sizeBytes > 0) segments.push(<span key="weight">{formatBytes(doc.sizeBytes)}</span>)
  segments.push(
    <span key="provenance">
      {revised ? 'Revised' : 'Filed'}{' '}
      {format(doc.contentUpdatedAt ?? doc.createdAt, 'd MMM yyyy')}
    </span>,
  )
  if (!entry.canDownload) segments.push(<span key="restriction">View only</span>)

  // Test the tier, not the element: <StageNote/> is truthy even when it renders
  // null, and pushing it unconditionally left an empty segment behind — which
  // the `* + *::before` separator then drew as a rule with nothing after it.
  if (resolveTier(doc, { tier: entry.folderTier }) === 'confirmatory') {
    segments.push(
      <span key="stage">
        <StageNote tier={doc.tier} folderTier={entry.folderTier} />
      </span>,
    )
  }

  if (entry.state !== 'unread') {
    const spent = entry.progress?.activeMs ?? 0
    segments.push(
      <span key="reading">
        {entry.state === 'read' ? 'Read' : 'Opened'}
        {spent > 0 ? ` · ${coarse(spent)}` : ''}
      </span>,
    )
  }

  return <div className="deck mt-2.5">{segments}</div>
}

/** Whole minutes — a reading time to the second is false precision. */
function coarse(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

/* -------------------------------------------------------------------------- */
/*  Entry                                                                      */
/* -------------------------------------------------------------------------- */

export function RegisterEntry({
  entry,
  index,
  railUnit,
}: {
  entry: RegisterEntryData
  index: number
  railUnit: RailUnit
}) {
  const { doc } = entry
  const markState: ReadState | 'next' =
    entry.state === 'unread' && entry.isNext ? 'next' : entry.state

  const label = readLabel(entry.state, entry.isNext, entry.progress?.activeMs)

  return (
    <li
      className="group relative -mx-3 grid grid-cols-1 gap-y-2 border-t px-3 py-5 transition-colors duration-200 last:border-b hover:bg-[var(--field-warm)] lg:grid-cols-[4.5rem_minmax(0,1fr)_5rem] lg:gap-x-8 lg:gap-y-0 lg:py-6"
      style={{
        ['--i' as string]: index,
        borderColor: 'var(--border-subtle)',
        transitionTimingFunction: 'var(--ease-namu)',
      }}
    >
      {/* Margin: the document's address, and how far you got */}
      <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
        <Accession value={entry.accession} />
        <ReadMark state={markState} fraction={entry.fraction} label={label} />
      </div>

      <div className="min-w-0">
        {entry.kicker && <p className="label mb-1.5">{entry.kicker}</p>}

        <h3
          className="link-ed font-display text-[1.0625rem] leading-[1.15] sm:text-[1.25rem]"
          style={{
            // Finished work visibly recedes, so the eye lands on what is left.
            color: entry.state === 'read' ? 'var(--text-secondary)' : 'var(--text-primary)',
          }}
        >
          {doc.title}
        </h3>

        {doc.description && (
          <p
            className="mt-1.5 line-clamp-2 max-w-[34rem] text-[0.9375rem] leading-[1.65]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {doc.description}
          </p>
        )}

        <Deck entry={entry} />
      </div>

      {/* Extent rail: a column of aligned figures down the right edge */}
      <div className="hidden text-right lg:block">
        <Extent doc={doc} railUnit={railUnit} />
      </div>

      <span
        aria-hidden
        className="register-arrow pointer-events-none absolute right-3 top-5 lg:hidden"
        style={{ color: 'var(--text-muted)' }}
      >
        →
      </span>

      <Link
        href={entry.href}
        className="after:absolute after:inset-0"
        aria-label={`${entry.accession}. ${doc.title}. ${label}`}
      >
        <span className="sr-only">Open document</span>
      </Link>
    </li>
  )
}

function Extent({ doc, railUnit }: { doc: VisibleDocument; railUnit: RailUnit }) {
  if (railUnit === 'pages' && doc.pageCount) {
    return (
      <>
        <div
          className="font-display tnum text-[1.375rem] leading-none"
          style={{ color: 'var(--text-primary)' }}
        >
          {doc.pageCount}
        </div>
        <div className="label mt-1">{doc.pageCount === 1 ? 'page' : 'pages'}</div>
      </>
    )
  }

  if (railUnit === 'bytes' && doc.sizeBytes > 0) {
    const [value, unit] = formatBytes(doc.sizeBytes).split(' ')
    return (
      <>
        <div
          className="font-display tnum text-[1.375rem] leading-none"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </div>
        <div className="label mt-1">{unit}</div>
      </>
    )
  }

  // Deliberately empty. If the set has no measurable extent, do not draw the
  // instrument — never a dash.
  return null
}

/* -------------------------------------------------------------------------- */
/*  Register                                                                   */
/* -------------------------------------------------------------------------- */

export function Register({
  entries,
  railUnit,
  /** Entries beyond this many collapse into a native <details>. 0 disables. */
  collapseAfter = 0,
  sealedCount = 0,
  contactEmail,
}: {
  entries: RegisterEntryData[]
  railUnit: RailUnit
  collapseAfter?: number
  sealedCount?: number
  contactEmail?: string
}) {
  const shouldCollapse = collapseAfter > 0 && entries.length > collapseAfter + 3
  const open = shouldCollapse ? entries.slice(0, collapseAfter) : entries
  const rest = shouldCollapse ? entries.slice(collapseAfter) : []
  const restUnread = rest.filter((e) => e.state === 'unread').length
  const restStarted = rest.some((e) => e.state !== 'unread')

  return (
    <>
      <ol className="set-in">
        {open.map((entry, index) => (
          <RegisterEntry key={entry.doc.id} entry={entry} index={index} railUnit={railUnit} />
        ))}
        {!shouldCollapse && sealedCount > 0 && (
          <SealedRow count={sealedCount} contactEmail={contactEmail} />
        )}
      </ol>

      {shouldCollapse && (
        <details open={restStarted}>
          <summary
            className="flex items-baseline gap-3 border-t py-4"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span className="label tnum">
              {rest.length} further {rest.length === 1 ? 'item' : 'items'}
            </span>
            <span aria-hidden className="hairline flex-1" />
            {restUnread > 0 && <span className="label tnum">{restUnread} unread</span>}
            <ChevronDown size={14} className="chev" style={{ color: 'var(--text-muted)' }} aria-hidden />
          </summary>

          <ol className="set-in">
            {rest.map((entry, index) => (
              <RegisterEntry key={entry.doc.id} entry={entry} index={index} railUnit={railUnit} />
            ))}
            {sealedCount > 0 && <SealedRow count={sealedCount} contactEmail={contactEmail} />}
          </ol>
        </details>
      )}
    </>
  )
}

/**
 * Says plainly that material exists here which has not been released yet.
 * Off by default — whether to advertise it is a commercial judgement.
 */
function SealedRow({ count, contactEmail }: { count: number; contactEmail?: string }) {
  return (
    <li
      className="-mx-3 grid grid-cols-1 gap-y-2 border-t px-3 py-5 lg:grid-cols-[4.5rem_minmax(0,1fr)_5rem] lg:gap-x-8"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'color-mix(in oklab, var(--field-warm) 50%, transparent)',
      }}
    >
      <span className="folio" aria-hidden>
        —
      </span>
      <div className="min-w-0">
        <p className="font-display text-[1.0625rem] italic" style={{ color: 'var(--text-muted)' }}>
          {count} {count === 1 ? 'item is' : 'items are'} sealed at the confirmatory stage
        </p>
        <p className="mt-1.5 max-w-[34rem] text-[0.9375rem] leading-[1.65]" style={{ color: 'var(--text-secondary)' }}>
          Released once a term sheet is in place.
          {contactEmail && (
            <>
              {' '}
              Write to{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="underline decoration-1 underline-offset-[0.22em]"
                style={{ textDecorationColor: 'var(--border-strong)' }}
              >
                {contactEmail}
              </a>{' '}
              if you need one sooner.
            </>
          )}
        </p>
      </div>
    </li>
  )
}

/** Builds the entry list a page hands to the register. */
export function buildEntries(input: {
  documents: VisibleDocument[]
  sectionIndex: string
  folderTier: string
  folderSlug: string
  progress: Map<string, Progress>
  canDownload: (doc: VisibleDocument) => boolean
  hrefFor?: (doc: VisibleDocument) => string
  kickerFor?: (doc: VisibleDocument) => string | undefined
}): RegisterEntryData[] {
  const states = input.documents.map((doc) => readState(doc, input.progress.get(doc.id)))
  const nextIndex = states.findIndex((s) => s === 'unread')

  return input.documents.map((doc, i) => {
    const p = input.progress.get(doc.id)
    const state = states[i]!
    return {
      doc,
      // Derived from the stored sort order, not the render position, so two
      // readers on different disclosure tiers cite the same number for the
      // same file when they are on a call about it.
      accession: `${input.sectionIndex}.${String(doc.sortOrder).padStart(2, '0')}`,
      state,
      fraction: readFraction(doc, state, p),
      isNext: i === nextIndex,
      progress: p,
      canDownload: input.canDownload(doc),
      folderTier: input.folderTier,
      href: input.hrefFor?.(doc) ?? `/room/${input.folderSlug}/${doc.id}`,
      kicker: input.kickerFor?.(doc),
    }
  })
}
