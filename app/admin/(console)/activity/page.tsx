import Link from 'next/link'
import { Activity, MapPin } from 'lucide-react'
import { getGeoBreakdown } from '@/lib/analytics'
import { countryFlag, countryName } from '@/lib/utils'
import { ActivityFilters } from '@/components/admin/ActivityFilters'
import { EventFeed, type FeedEvent } from '@/components/admin/EventFeed'
import {
  buttonClass,
  Card,
  EmptyState,
  ErrorPanel,
  Meter,
  Note,
  PageHeader,
  SectionTitle,
} from '@/components/admin/ui'
import { formatCount } from '../../_lib/format'
import { requireAdminPage } from '../../_lib/guard'
import { EVENT_TYPE_LABELS } from '../../_lib/phrasing'
import { getEventPage, getEventTypeCounts } from '../../_lib/queries'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * The full audit trail.
 *
 * Pagination and the type filter are pushed into SQL rather than applied to a
 * fixed head of the list, so the trail stays usable once the events table is
 * long. The dashboard feed still uses `getRecentEvents()` — that one only ever
 * wants the newest handful.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; actor?: string }>
}) {
  await requireAdminPage()
  const query = await searchParams

  const requestedPage = Number.parseInt(query.page ?? '1', 10)
  const type = query.type?.trim() || null
  const actor = query.actor?.trim() || null

  let payload: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    payload = await load({
      page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      type,
      actor,
    })
  } catch (error) {
    console.error('[admin] activity page failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (failure || !payload) {
    return (
      <>
        <PageHeader eyebrow="Record" title="Activity" />
        <ErrorPanel detail={failure ?? undefined} />
      </>
    )
  }

  const { events, meta, counts, geo } = payload
  const filterLabel = type ? (EVENT_TYPE_LABELS[type] ?? type) : null

  function href(page: number): string {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (actor) params.set('actor', actor)
    if (page > 1) params.set('page', String(page))
    const search = params.toString()
    return search ? `/admin/activity?${search}` : '/admin/activity'
  }

  return (
    <>
      <PageHeader
        eyebrow="Record"
        title="Activity"
        lede={
          meta.total === 0
            ? 'Every notable thing that happens in the room is appended here — link opens, NDA signatures, document reads, downloads, print attempts, and every administrative change.'
            : `${formatCount(meta.total)} ${filterLabel ? `“${filterLabel}” ` : ''}entr${meta.total === 1 ? 'y' : 'ies'}${actor ? ` by ${actor === 'admin' ? 'administrators' : actor === 'system' ? 'the room' : 'visitors'}` : ''}. Newest first.`
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ActivityFilters type={type} actor={actor} counts={counts} />

          {events.length === 0 ? (
            <EmptyState
              icon={<Activity size={18} aria-hidden />}
              title={
                type || actor ? 'Nothing matches that filter' : 'Nothing has happened yet'
              }
              action={
                type || actor ? (
                  <Link href="/admin/activity" className={buttonClass('secondary')}>
                    Clear the filter
                  </Link>
                ) : (
                  <Link href="/admin/invites" className={buttonClass('primary')}>
                    Send the first invite
                  </Link>
                )
              }
            >
              <p>
                {type || actor
                  ? 'The trail is complete — no event of that kind has been recorded. Try a wider filter.'
                  : 'The trail fills itself. The first entry will be the first invite you create; after that, every open, read and download lands here in order.'}
              </p>
            </EmptyState>
          ) : (
            <>
              <Card>
                <EventFeed events={events} showLocation />
              </Card>

              {meta.pageCount > 1 ? (
                <nav
                  aria-label="Activity pages"
                  className="flex items-center justify-between gap-3"
                >
                  {meta.page > 1 ? (
                    <Link href={href(meta.page - 1)} className={buttonClass('secondary', 'sm')}>
                      Newer
                    </Link>
                  ) : (
                    <span />
                  )}

                  <p className="tnum text-[0.8rem] text-[var(--text-muted)]">
                    Page {meta.page} of {meta.pageCount} · {formatCount(meta.total)} entries
                  </p>

                  {meta.page < meta.pageCount ? (
                    <Link href={href(meta.page + 1)} className={buttonClass('secondary', 'sm')}>
                      Older
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </div>

        <aside className="min-w-0">
          <Card>
            <SectionTitle>Where from</SectionTitle>

            {geo.length === 0 ? (
              <Note>
                Location comes from the edge on each visit. Nothing has been recorded yet — and
                locally, where those headers are absent, it stays empty.
              </Note>
            ) : (
              <>
                <ol className="flex flex-col">
                  {geo.map((place, index) => (
                    <li
                      key={`${place.country ?? 'unknown'}-${place.city ?? index}`}
                      className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <span aria-hidden className="text-[1rem]">
                        {countryFlag(place.country)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.85rem] text-[var(--text-primary)]">
                          {place.city ?? countryName(place.country)}
                        </span>
                        <span className="tnum block text-[0.72rem] text-[var(--text-muted)]">
                          {place.city ? `${countryName(place.country)} · ` : ''}
                          {place.visitors} {place.visitors === 1 ? 'person' : 'people'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Meter
                          value={place.sessions}
                          max={geo[0]?.sessions ?? 1}
                          label={`${place.sessions} visits`}
                          className="hidden sm:flex lg:hidden xl:flex"
                        />
                        <span className="tnum w-6 text-right text-[0.8rem] text-[var(--text-secondary)]">
                          {place.sessions}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>

                <Note className="mt-4 flex items-start gap-1.5">
                  <MapPin size={12} aria-hidden className="mt-[3px] shrink-0" />
                  City and country are read from the edge network on each visit. They locate the
                  connection, not the person — a VPN moves the pin.
                </Note>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}

async function load(input: { page: number; type: string | null; actor: string | null }) {
  const [page, counts, geo] = await Promise.all([
    getEventPage({ page: input.page, pageSize: PAGE_SIZE, type: input.type, actor: input.actor }),
    getEventTypeCounts(),
    getGeoBreakdown(),
  ])

  const events: FeedEvent[] = page.rows.map((row) => ({
    id: row.id,
    type: row.type,
    actor: row.actor,
    label: row.label,
    metadata: row.metadata,
    createdAt: row.createdAt,
    country: row.country,
    ip: row.ip,
    visitorId: row.visitorId,
    visitorEmail: row.visitorEmail,
    visitorName: row.visitorName,
    documentTitle: row.documentTitle,
  }))

  return {
    events,
    counts,
    geo,
    meta: { page: page.page, pageCount: page.pageCount, total: page.total },
  }
}
