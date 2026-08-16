'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, ListFilter, X } from 'lucide-react'
import { EVENT_TYPE_LABELS } from '@/app/admin/_lib/phrasing'
import { formatCount } from '@/app/admin/_lib/format'
import { buttonClass, fieldClass } from './ui'

/**
 * Filters for the audit trail.
 *
 * The current selection arrives as props rather than through
 * `useSearchParams()`. The page already read the query string on the server —
 * reading it again in the browser would only add a Suspense requirement for no
 * new information.
 */
export function ActivityFilters({
  type,
  actor,
  counts,
}: {
  type: string | null
  actor: string | null
  counts: { type: string; n: number }[]
}) {
  const router = useRouter()

  function go(next: { type?: string | null; actor?: string | null }) {
    const params = new URLSearchParams()
    const nextType = next.type === undefined ? type : next.type
    const nextActor = next.actor === undefined ? actor : next.actor
    if (nextType) params.set('type', nextType)
    if (nextActor) params.set('actor', nextActor)
    const query = params.toString()
    router.push(query ? `/admin/activity?${query}` : '/admin/activity')
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <ListFilter
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <label htmlFor="activity-type" className="sr-only">
          Filter by event type
        </label>
        <select
          id="activity-type"
          value={type ?? ''}
          onChange={(event) => go({ type: event.target.value || null })}
          className={fieldClass('appearance-none pl-10 pr-8')}
        >
          <option value="">Everything that happened</option>
          {counts.map((row) => (
            <option key={row.type} value={row.type}>
              {EVENT_TYPE_LABELS[row.type] ?? row.type} ({formatCount(row.n)})
            </option>
          ))}
        </select>
        <ChevronRight
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[var(--text-muted)]"
        />
      </div>

      <div className="relative sm:w-[190px]">
        <label htmlFor="activity-actor" className="sr-only">
          Filter by who acted
        </label>
        <select
          id="activity-actor"
          value={actor ?? ''}
          onChange={(event) => go({ actor: event.target.value || null })}
          className={fieldClass('appearance-none pr-8')}
        >
          <option value="">Anyone</option>
          <option value="visitor">Visitors</option>
          <option value="admin">Administrators</option>
          <option value="system">The room itself</option>
        </select>
        <ChevronRight
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[var(--text-muted)]"
        />
      </div>

      {type || actor ? (
        <button
          type="button"
          onClick={() => router.push('/admin/activity')}
          className={buttonClass('ghost', 'sm', 'shrink-0')}
        >
          <X size={13} aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  )
}
