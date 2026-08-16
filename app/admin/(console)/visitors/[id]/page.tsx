import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileCheck } from 'lucide-react'
import { engagementScore, getVisitorJourney } from '@/lib/analytics'
import { countryFlag, countryName, formatDuration, initials } from '@/lib/utils'
import { EventFeed, type FeedEvent } from '@/components/admin/EventFeed'
import {
  JourneyTimeline,
  type JourneySession,
  type JourneyView,
} from '@/components/admin/JourneyTimeline'
import {
  VisitorAccess,
  VisitorDangerZone,
  VisitorDetailsForm,
} from '@/components/admin/VisitorControls'
import {
  buttonClass,
  Card,
  Chip,
  ErrorPanel,
  Initials,
  Note,
  PageHeader,
  SectionTitle,
  StatTile,
} from '@/components/admin/ui'
import { formatCount, formatDateTime, toISO } from '../../../_lib/format'
import { requireAdminPage } from '../../../_lib/guard'
import { getVisitorRecord, inviteStatus, listFolders } from '../../../_lib/queries'
import type { AccessLinkView, FolderOption } from '../../../_lib/view-types'

export const dynamic = 'force-dynamic'

export default async function VisitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminPage()
  const { id } = await params

  let payload: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    payload = await load(id)
  } catch (error) {
    console.error('[admin] visitor detail failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (failure) {
    return (
      <>
        <BackLink />
        <PageHeader eyebrow="Visitor" title="Record" />
        <ErrorPanel detail={failure} />
      </>
    )
  }

  if (!payload) notFound()

  const { visitor, links, ndas, folders, sessions, events, totals } = payload
  const displayName = visitor.name ?? visitor.email

  return (
    <>
      <BackLink />

      <PageHeader
        eyebrow={visitor.role ?? 'Visitor'}
        title={displayName}
        lede={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{visitor.email}</span>
            {visitor.organization ? (
              <>
                <span aria-hidden>·</span>
                <span>{visitor.organization}</span>
              </>
            ) : null}
            {totals.country ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  <span aria-hidden>{countryFlag(totals.country)}</span>{' '}
                  {countryName(totals.country)}
                </span>
              </>
            ) : null}
          </span>
        }
        actions={<Initials value={initials(displayName)} className="h-11 w-11 text-[0.85rem]" />}
      />

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Engagement"
          value={String(totals.engagement)}
          sub="Out of 100, weighted to depth"
          accent
        />
        <StatTile
          label="Visits"
          value={formatCount(sessions.length)}
          sub={totals.lastSeenAt ? `Last ${formatDateTime(totals.lastSeenAt)}` : 'Never arrived'}
        />
        <StatTile
          label="Reading time"
          value={formatDuration(totals.activeMs)}
          sub="Tab open and in focus"
        />
        <StatTile
          label="Documents"
          value={formatCount(totals.distinctDocuments)}
          sub={`${formatCount(totals.opens)} open${totals.opens === 1 ? '' : 's'} in total`}
        />
        <StatTile
          label="Downloads"
          value={formatCount(totals.downloads)}
          sub={totals.downloads === 0 ? 'Nothing taken off the room' : 'Files taken off the room'}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <VisitorAccess
          visitorId={visitor.id}
          links={links}
          folders={folders}
          defaultCanDownload={links.some((link) => link.canDownload)}
        />

        <div className="flex flex-col gap-5">
          <Card>
            <SectionTitle>NDA</SectionTitle>
            {ndas.length === 0 ? (
              <Note>
                No NDA has been signed by this person. If the NDA gate is on, they will be asked
                before the room opens; the signature is recorded here with its timestamp and IP.
              </Note>
            ) : (
              <ul className="flex flex-col gap-4">
                {ndas.map((nda) => (
                  <li key={nda.id} className="flex items-start gap-3">
                    <FileCheck
                      size={16}
                      aria-hidden
                      className="mt-[3px] shrink-0 text-[var(--color-forest)]"
                    />
                    <div className="min-w-0">
                      <p className="text-[0.9rem] text-[var(--text-primary)]">
                        Signed as “{nda.signedName}”
                      </p>
                      <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
                        <span>{formatDateTime(nda.acceptedAt)}</span>
                        <span aria-hidden>·</span>
                        <Chip tone="muted">{nda.ndaVersion}</Chip>
                        {nda.ip ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-mono text-[0.7rem]">{nda.ip}</span>
                          </>
                        ) : null}
                        {nda.country ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              <span aria-hidden>{countryFlag(nda.country)}</span>{' '}
                              {countryName(nda.country)}
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-2 break-all font-mono text-[0.68rem] text-[var(--text-muted)]">
                        text hash {nda.ndaTextHash.slice(0, 32)}…
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {ndas.length > 0 ? (
              <Note className="mt-4">
                The hash is of the exact text shown at the moment of signing, so the record stays
                self-proving after the NDA is revised.
              </Note>
            ) : null}
          </Card>

          <VisitorDetailsForm visitor={visitor} />
        </div>
      </div>

      <section className="mt-10">
        <SectionTitle
          aside={
            sessions.length > 0 ? (
              <span className="tnum">
                {formatCount(sessions.length)} visit{sessions.length === 1 ? '' : 's'}
              </span>
            ) : null
          }
        >
          What they read
        </SectionTitle>

        {sessions.length === 0 ? (
          <Card>
            <Note>
              This person has never opened their link. Nothing is recorded until they do — the first
              click creates a visit and everything after it is attributed here.
            </Note>
          </Card>
        ) : (
          <JourneyTimeline sessions={sessions} />
        )}
      </section>

      <section className="mt-10">
        <SectionTitle aside={<span className="tnum">{formatCount(events.length)} entries</span>}>
          Event log
        </SectionTitle>
        <Card>
          {events.length === 0 ? (
            <Note>No events have been recorded for this person yet.</Note>
          ) : (
            <EventFeed events={events} showLocation />
          )}
          {events.length >= 200 ? (
            <Note className="mt-4">
              Showing the most recent 200 events. The full trail is on the activity page.
            </Note>
          ) : null}
        </Card>
      </section>

      <section className="mt-10">
        <VisitorDangerZone visitorId={visitor.id} email={visitor.email} />
      </section>
    </>
  )
}

function BackLink() {
  return (
    <Link href="/admin/visitors" className={buttonClass('ghost', 'sm', '-ml-3 mb-6')}>
      <ArrowLeft size={14} aria-hidden />
      All visitors
    </Link>
  )
}

async function load(visitorId: string) {
  const record = await getVisitorRecord(visitorId)
  if (!record) return null

  const [journey, folderRows] = await Promise.all([
    getVisitorJourney(visitorId),
    listFolders(),
  ])

  const viewsBySession = new Map<string, JourneyView[]>()
  for (const row of journey.views) {
    const view: JourneyView = {
      id: row.view.id,
      documentId: row.view.documentId,
      documentTitle: row.documentTitle,
      documentKind: row.documentKind,
      folderName: row.folderName,
      openedAt: toISO(row.view.openedAt) ?? '',
      activeMs: row.view.activeMs,
      maxPageReached: row.view.maxPageReached,
      pagesViewed: row.view.pagesViewed,
      pageCount: row.pageCount,
      completion: row.view.completion,
      downloaded: row.view.downloaded,
      printAttempted: row.view.printAttempted,
    }
    const list = viewsBySession.get(row.view.sessionId)
    if (list) list.push(view)
    else viewsBySession.set(row.view.sessionId, [view])
  }

  const sessions: JourneySession[] = journey.sessions.map((session) => ({
    id: session.id,
    startedAt: toISO(session.startedAt) ?? '',
    lastSeenAt: toISO(session.lastSeenAt) ?? '',
    activeMs: session.activeMs,
    ip: session.ip,
    country: session.country,
    city: session.city,
    timezone: session.timezone,
    browser: session.browser,
    os: session.os,
    deviceType: session.deviceType,
    screen: session.screen,
    referrer: session.referrer,
    isNewDevice: session.isNewDevice,
    suspicious: session.suspicious,
    // Oldest first inside a visit: that is the order they were read in.
    views: (viewsBySession.get(session.id) ?? []).sort((a, b) =>
      a.openedAt.localeCompare(b.openedAt),
    ),
  }))

  const links: AccessLinkView[] = record.links.map((link) => ({
    id: link.id,
    tokenPreview: link.tokenPreview,
    label: link.label,
    status: inviteStatus(link),
    createdAt: toISO(link.createdAt) ?? '',
    expiresAt: toISO(link.expiresAt) ?? null,
    revokedAt: toISO(link.revokedAt) ?? null,
    sentAt: toISO(link.sentAt) ?? null,
    firstOpenedAt: toISO(link.firstOpenedAt) ?? null,
    lastOpenedAt: toISO(link.lastOpenedAt) ?? null,
    openCount: link.openCount,
    canDownload: link.canDownload,
    allowedFolderIds: link.allowedFolderIds ?? [],
    invitedBy: link.invitedBy,
  }))

  const folders: FolderOption[] = folderRows.map((folder) => ({
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    documentCount: 0,
  }))

  const events: FeedEvent[] = journey.events.map((event) => ({
    id: event.id,
    type: event.type,
    actor: event.actor,
    label: event.label,
    metadata: event.metadata,
    createdAt: event.createdAt,
    country: event.country,
    ip: event.ip,
    visitorId: null, // already on this person's page — no self-link
    visitorEmail: record.visitor.email,
    visitorName: record.visitor.name,
    documentTitle: null,
  }))

  const activeMs = journey.sessions.reduce((sum, session) => sum + session.activeMs, 0)
  const distinctDocuments = new Set(journey.views.map((row) => row.view.documentId)).size
  const totalCompletion = journey.views.reduce((sum, row) => sum + row.view.completion, 0)
  const downloads = journey.views.filter((row) => row.view.downloaded).length

  return {
    visitor: record.visitor,
    links,
    ndas: record.ndas,
    folders,
    sessions,
    events,
    totals: {
      activeMs,
      opens: journey.views.length,
      distinctDocuments,
      downloads,
      country: journey.sessions.find((session) => session.country)?.country ?? null,
      lastSeenAt: journey.sessions[0]?.lastSeenAt ?? null,
      engagement: engagementScore({
        activeMs,
        opened: distinctDocuments,
        completion: totalCompletion,
      }),
    },
  }
}
