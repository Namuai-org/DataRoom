import Link from 'next/link'
import { FileText, Send, TriangleAlert, Users } from 'lucide-react'
import {
  getActivityTimeline,
  getDocumentStats,
  getOverview,
  getRecentEvents,
  getRecentSessions,
  getVisitorSummaries,
} from '@/lib/analytics'
import { countryFlag, countryName, formatDuration, initials } from '@/lib/utils'
import { displayFolderName } from '@/lib/brand'
import { ActivityChart } from '@/components/admin/ActivityChart'
import { EventFeed, type FeedEvent } from '@/components/admin/EventFeed'
import { RelativeTime } from '@/components/admin/RelativeTime'
import {
  buttonClass,
  Card,
  Chip,
  EmptyState,
  ErrorPanel,
  Initials,
  Meter,
  Note,
  PageHeader,
  SectionTitle,
  StatTile,
} from '@/components/admin/ui'
import { formatCount, formatPercent } from '../_lib/format'
import { requireAdminPage } from '../_lib/guard'
import { getRoomShape } from '../_lib/queries'

export const dynamic = 'force-dynamic'

export default async function OverviewPage() {
  await requireAdminPage()

  let data: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    data = await load()
  } catch (error) {
    console.error('[admin] overview failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Namu data room" title="Overview" />
        <ErrorPanel detail={failure ?? undefined} />
      </>
    )
  }

  const { overview, timeline, sessions, events, documents, visitors, shape } = data
  const activated = overview.invitedCount
    ? overview.activatedCount / overview.invitedCount
    : 0

  /* An untouched room. Say what to do next, not "no data". */
  if (shape.documents === 0 && shape.links === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Namu data room"
          title="Overview"
          lede="Nothing has been read yet, because nothing has been shared yet."
        />
        <EmptyState
          icon={<FileText size={18} aria-hidden />}
          title="The room is empty, which is the right place to start"
          action={
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/documents" className={buttonClass('primary')}>
                Add documents
              </Link>
              <Link href="/admin/invites" className={buttonClass('secondary')}>
                Invite someone
              </Link>
            </div>
          }
        >
          <p>
            Two things make this page useful. Put the material in first — folders and files, in the
            order you want them read. Then invite one person. From their first click this page fills
            with what they opened, how long they stayed on each page, and where they were reading
            from.
          </p>
        </EmptyState>
      </>
    )
  }

  const topVisitors = [...visitors].sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 5)
  const topDocuments = documents.filter((d) => d.totalActiveMs > 0).slice(0, 5)

  return (
    <>
      <PageHeader
        eyebrow="Namu data room"
        title="Overview"
        lede={
          overview.totalSessions === 0
            ? 'The room is live and nobody has arrived yet. Every number below starts moving on the first click.'
            : `${formatCount(overview.totalSessions)} visit${overview.totalSessions === 1 ? '' : 's'} recorded, ${formatDuration(overview.totalActiveMs)} of reading in total.`
        }
        actions={
          <Link href="/admin/invites" className={buttonClass('primary')}>
            <Send size={15} aria-hidden />
            New invite
          </Link>
        }
      />

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Invited"
          value={formatCount(overview.invitedCount)}
          sub={`${formatCount(overview.totalVisitors)} ${overview.totalVisitors === 1 ? 'person' : 'people'} on the list`}
        />
        <StatTile
          label="Opened their link"
          value={formatCount(overview.activatedCount)}
          sub={
            overview.invitedCount
              ? `${formatPercent(activated)} of invites`
              : 'No invites sent yet'
          }
        />
        <StatTile
          label="Visits"
          value={formatCount(overview.totalSessions)}
          sub={`${formatCount(overview.last7dSessions)} in the last 7 days`}
        />
        <StatTile
          label="Median visit"
          value={formatDuration(overview.medianSessionMs)}
          sub="Half of visits ran longer"
        />
        <StatTile
          label="Reading time"
          value={formatDuration(overview.totalActiveMs)}
          sub="Tab open and in focus"
        />
        <StatTile
          label="Documents opened"
          value={formatCount(overview.documentOpens)}
          sub={`Across ${formatCount(shape.documents)} document${shape.documents === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Downloads"
          value={formatCount(overview.downloads)}
          sub={overview.downloads === 0 ? 'Nothing has left the room' : 'Files taken off the room'}
        />
        <StatTile
          label="NDAs signed"
          value={formatCount(overview.ndaSigned)}
          sub={
            overview.invitedCount
              ? `${formatCount(overview.invitedCount - overview.ndaSigned)} outstanding`
              : '—'
          }
        />
      </div>

      {overview.newDeviceFlags > 0 ? (
        <div
          className="namu-card mt-5 flex items-start gap-3 border-l-2 p-5"
          style={{ borderLeftColor: 'var(--color-sahel)' }}
        >
          <TriangleAlert size={17} aria-hidden className="mt-[2px] shrink-0 text-[var(--color-kola)]" />
          <div>
            <p className="text-[0.9rem] font-medium text-[var(--text-primary)]">
              {formatCount(overview.newDeviceFlags)} visit
              {overview.newDeviceFlags === 1 ? ' was' : 's were'} opened from an unfamiliar device
            </p>
            <Note className="mt-1">
              An invite link is bound to the first device that opens it. A later visit from a
              different device or country still works, but it is recorded — usually it means the
              link was forwarded.{' '}
              <Link
                href="/admin/visitors"
                className="underline decoration-[var(--border-strong)] underline-offset-[3px]"
              >
                See which visitors
              </Link>
              .
            </Note>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <ActivityChart data={timeline} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle aside={<Link href="/admin/visitors" className="hover:underline">All visitors</Link>}>
            Most engaged
          </SectionTitle>

          {topVisitors.length === 0 || topVisitors[0]?.engagementScore === 0 ? (
            <Note>
              Engagement is weighted toward depth: reading one document all the way through counts
              for more than opening ten. Nothing has been read yet, so nothing is ranked.
            </Note>
          ) : (
            <ol className="flex flex-col">
              {topVisitors.map((visitor) => (
                <li
                  key={visitor.visitorId}
                  className="border-b border-[var(--border-subtle)] py-3 last:border-b-0 last:pb-0 first:pt-0"
                >
                  <Link
                    href={`/admin/visitors/${visitor.visitorId}`}
                    className="flex items-center gap-3 rounded-[9px] transition-opacity hover:opacity-75"
                  >
                    <Initials value={initials(visitor.name ?? visitor.email)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] text-[var(--text-primary)]">
                        {visitor.name ?? visitor.email}
                      </span>
                      <span className="tnum block truncate text-[0.75rem] text-[var(--text-muted)]">
                        {visitor.organization ? `${visitor.organization} · ` : ''}
                        {formatDuration(visitor.totalActiveMs)} · {visitor.documentsOpened} doc
                        {visitor.documentsOpened === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Meter
                        value={visitor.engagementScore}
                        label={`Engagement ${visitor.engagementScore} out of 100`}
                        className="hidden sm:flex"
                      />
                      <span className="tnum w-7 text-right text-[0.8rem] text-[var(--text-secondary)]">
                        {visitor.engagementScore}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <SectionTitle aside={<Link href="/admin/documents" className="hover:underline">All documents</Link>}>
            Most read
          </SectionTitle>

          {topDocuments.length === 0 ? (
            <Note>
              No document has been opened yet. Once one is, this ranks by total time spent reading —
              not by clicks.
            </Note>
          ) : (
            <ol className="flex flex-col">
              {topDocuments.map((doc) => (
                <li
                  key={doc.documentId}
                  className="flex items-center gap-4 border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-[var(--text-primary)]">
                      {doc.title}
                    </span>
                    <span className="tnum block truncate text-[0.75rem] text-[var(--text-muted)]">
                      {displayFolderName(doc.folderName)} · {doc.uniqueViewers} reader
                      {doc.uniqueViewers === 1 ? '' : 's'} · {formatDuration(doc.avgActiveMs)} average
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tnum text-[0.8rem] text-[var(--text-secondary)]">
                      {formatPercent(doc.avgCompletion)}
                    </span>
                    <Meter
                      value={doc.avgCompletion * 100}
                      label={`Average completion ${formatPercent(doc.avgCompletion)}`}
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
          {topDocuments.length > 0 ? (
            <Note className="mt-4">
              Completion is the share of a document’s pages actually dwelt on, averaged across
              everyone who opened it.
            </Note>
          ) : null}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <SectionTitle aside={<Link href="/admin/activity" className="hover:underline">Full trail</Link>}>
            Recent activity
          </SectionTitle>
          {events.length === 0 ? (
            <Note>Nothing has happened in the room yet. The first invite you send lands here.</Note>
          ) : (
            <EventFeed events={events} />
          )}
        </Card>

        <Card>
          <SectionTitle>Latest visits</SectionTitle>
          {sessions.length === 0 ? (
            <Note>
              No one has entered yet. A visit is recorded the moment an invite link is opened.
            </Note>
          ) : (
            <ol className="flex flex-col">
              {sessions.map((session) => (
                <li
                  key={session.sessionId}
                  className="border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/admin/visitors/${session.visitorId}`}
                      className="truncate text-[0.875rem] text-[var(--text-primary)] hover:underline"
                    >
                      {session.name ?? session.email}
                    </Link>
                    <span className="tnum shrink-0 text-[0.8rem] text-[var(--text-secondary)]">
                      {formatDuration(session.activeMs)}
                    </span>
                  </div>
                  <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
                    <RelativeTime value={session.startedAt} />
                    <span aria-hidden>·</span>
                    <span>
                      <span aria-hidden>{countryFlag(session.country)}</span>{' '}
                      {session.city ?? countryName(session.country)}
                    </span>
                    {session.browser ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {session.browser}
                          {session.os ? ` on ${session.os}` : ''}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden>·</span>
                    <span>
                      {session.documentsOpened} doc{session.documentsOpened === 1 ? '' : 's'}
                    </span>
                    {session.isNewDevice ? (
                      <Chip tone="attention" title="This visit came from a device the link was not first opened on.">
                        New device
                      </Chip>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <p className="mt-8 flex items-center gap-2 text-[0.78rem] text-[var(--text-muted)]">
        <Users size={13} aria-hidden />
        Times are measured while the tab was open and in focus, so they reflect attention rather
        than a window left running.
      </p>
    </>
  )
}

async function load() {
  const [overview, timeline, sessions, rawEvents, documents, visitors, shape] = await Promise.all([
    getOverview(),
    getActivityTimeline(30),
    getRecentSessions(10),
    getRecentEvents(15),
    getDocumentStats(),
    getVisitorSummaries(),
    getRoomShape(),
  ])

  const events: FeedEvent[] = rawEvents.map((row) => ({
    id: row.event.id,
    type: row.event.type,
    actor: row.event.actor,
    label: row.event.label,
    metadata: row.event.metadata,
    createdAt: row.event.createdAt,
    country: row.event.country,
    visitorId: row.event.visitorId,
    visitorEmail: row.visitorEmail,
    visitorName: row.visitorName,
    documentTitle: row.documentTitle,
  }))

  return { overview, timeline, sessions, events, documents, visitors, shape }
}
