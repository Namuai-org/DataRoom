import { Download, Globe, Monitor, Printer, Smartphone, Tablet } from 'lucide-react'
import { countryFlag, countryName, formatDuration } from '@/lib/utils'
import { displayFolderName } from '@/lib/brand'
import { formatDateTime, formatPercent } from '@/app/admin/_lib/format'
import { kindLabel } from '@/app/admin/_lib/phrasing'
import { RelativeTime } from './RelativeTime'
import { Chip, Meter, Note } from './ui'

export type JourneyView = {
  id: string
  documentId: string
  documentTitle: string
  documentKind: string
  folderName: string
  openedAt: string
  activeMs: number
  maxPageReached: number
  pagesViewed: number
  pageCount: number | null
  completion: number
  downloaded: boolean
  printAttempted: boolean
}

export type JourneySession = {
  id: string
  startedAt: string
  lastSeenAt: string
  activeMs: number
  ip: string | null
  country: string | null
  city: string | null
  timezone: string | null
  browser: string | null
  os: string | null
  deviceType: string | null
  screen: string | null
  referrer: string | null
  isNewDevice: boolean
  suspicious: boolean
  views: JourneyView[]
}

function DeviceIcon({ deviceType }: { deviceType: string | null }) {
  const type = deviceType?.toLowerCase() ?? ''
  if (type.includes('mobile') || type.includes('phone')) return <Smartphone size={13} aria-hidden />
  if (type.includes('tablet')) return <Tablet size={13} aria-hidden />
  return <Monitor size={13} aria-hidden />
}

/** "12 of 34 pages" or "12 pages" when the document's length is unknown. */
function pagesRead(view: JourneyView): string {
  if (view.pageCount && view.pageCount > 0) {
    return `${view.pagesViewed || view.maxPageReached} of ${view.pageCount} page${view.pageCount === 1 ? '' : 's'}`
  }
  if (view.maxPageReached > 1) return `reached page ${view.maxPageReached}`
  return 'page count unknown'
}

/**
 * One visitor's history, session by session, with the documents opened inside
 * each. This is the page that answers "what exactly did this investor look at,
 * and for how long".
 */
export function JourneyTimeline({ sessions }: { sessions: JourneySession[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {sessions.map((session) => (
        <li key={session.id} className="namu-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h3 className="font-display text-[1.1rem] leading-tight text-[var(--text-primary)]">
                <RelativeTime value={session.startedAt} />
              </h3>
              <p className="tnum mt-1 text-[0.78rem] text-[var(--text-muted)]">
                {formatDateTime(session.startedAt)} — {formatDuration(session.activeMs)} of reading
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session.isNewDevice ? (
                <Chip
                  tone="attention"
                  title="This visit came from a device or country the link was not first opened on. Usually it means the invite was forwarded."
                >
                  New device
                </Chip>
              ) : null}
              {session.suspicious ? <Chip tone="attention">Flagged</Chip> : null}
              <Chip tone="muted">
                {session.views.length} document{session.views.length === 1 ? '' : 's'}
              </Chip>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.78rem] sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="label mb-1">Where</dt>
              <dd className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span aria-hidden>{countryFlag(session.country)}</span>
                {session.city ? `${session.city}, ` : ''}
                {countryName(session.country)}
              </dd>
            </div>
            <div>
              <dt className="label mb-1">Device</dt>
              <dd className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <DeviceIcon deviceType={session.deviceType} />
                {session.browser ?? 'Unknown browser'}
                {session.os ? ` · ${session.os}` : ''}
              </dd>
            </div>
            <div>
              <dt className="label mb-1">IP address</dt>
              <dd className="font-mono text-[0.72rem] text-[var(--text-secondary)]">
                {session.ip ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="label mb-1">Came from</dt>
              <dd className="flex items-center gap-1.5 truncate text-[var(--text-secondary)]">
                {session.referrer ? (
                  <>
                    <Globe size={12} aria-hidden className="shrink-0" />
                    <span className="truncate" title={session.referrer}>
                      {session.referrer}
                    </span>
                  </>
                ) : (
                  'Direct — the link itself'
                )}
              </dd>
            </div>
          </dl>

          {session.views.length === 0 ? (
            <Note className="mt-5">
              They entered the room but did not open a document in this visit.
            </Note>
          ) : (
            <ul className="mt-5 flex flex-col border-t border-[var(--border-subtle)]">
              {session.views.map((view) => (
                <li
                  key={view.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] text-[var(--text-primary)]">
                      {view.documentTitle}
                    </p>
                    <p className="tnum truncate text-[0.75rem] text-[var(--text-muted)]">
                      {displayFolderName(view.folderName)} · {kindLabel(view.documentKind)} ·{' '}
                      {pagesRead(view)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {view.downloaded ? (
                      <Chip tone="attention" title="This document was downloaded during the visit.">
                        <Download size={10} aria-hidden />
                        Downloaded
                      </Chip>
                    ) : null}
                    {view.printAttempted ? (
                      <Chip tone="attention" title="A print was attempted and blocked.">
                        <Printer size={10} aria-hidden />
                        Print attempt
                      </Chip>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="tnum text-[0.75rem] text-[var(--text-muted)]">
                        {formatPercent(view.completion)} read
                      </span>
                      <Meter
                        value={view.completion * 100}
                        label={`${formatPercent(view.completion)} of ${view.documentTitle} read`}
                      />
                    </div>
                    <span className="tnum w-[62px] text-right text-[0.85rem] text-[var(--text-secondary)]">
                      {formatDuration(view.activeMs)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
