'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronRight, ListFilter, Search, TriangleAlert } from 'lucide-react'
import { cn, countryFlag, countryName, formatDuration, initials } from '@/lib/utils'
import { formatCount } from '@/app/admin/_lib/format'
import { RelativeTime } from './RelativeTime'
import { Chip, fieldClass, Initials, Meter, Note, Td, Th } from './ui'

export type LinkState = 'active' | 'revoked' | 'expired' | 'none'

export type VisitorRow = {
  visitorId: string
  email: string
  name: string | null
  organization: string | null
  role: string | null
  sessionCount: number
  totalActiveMs: number
  documentsOpened: number
  downloads: number
  lastSeenAt: string | null
  country: string | null
  city: string | null
  ndaSignedAt: string | null
  canDownload: boolean
  flagged: boolean
  engagementScore: number
  linkState: LinkState
}

type SortKey =
  | 'name'
  | 'engagementScore'
  | 'sessionCount'
  | 'totalActiveMs'
  | 'documentsOpened'
  | 'downloads'
  | 'lastSeenAt'

const FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'active', label: 'Live access' },
  { value: 'revoked', label: 'Access revoked' },
  { value: 'expired', label: 'Link expired' },
  { value: 'unopened', label: 'Never opened' },
  { value: 'flagged', label: 'New-device flags' },
  { value: 'nda', label: 'NDA signed' },
  { value: 'no-nda', label: 'NDA outstanding' },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

const LINK_CHIP: Record<LinkState, { label: string; tone: 'neutral' | 'muted' | 'attention'; title: string }> = {
  active: { label: 'Live', tone: 'neutral', title: 'This visitor holds a working link.' },
  revoked: { label: 'Revoked', tone: 'attention', title: 'The link was revoked and no longer opens the room.' },
  expired: { label: 'Expired', tone: 'attention', title: 'The link passed its expiry date.' },
  none: { label: 'No link', tone: 'muted', title: 'This person is on the list but has never been issued a link.' },
}

function sortValue(row: VisitorRow, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return (row.name ?? row.email).toLowerCase()
    case 'lastSeenAt':
      return row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0
    default:
      return row[key]
  }
}

/**
 * The visitor ledger.
 *
 * Sorting and filtering happen in the browser on a list the server already
 * scoped. A data room has tens of readers, not millions of rows, so paying for
 * a round trip per sort would be slower and less pleasant than doing it here.
 */
export function VisitorsTable({ rows }: { rows: VisitorRow[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterValue>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'lastSeenAt',
    dir: 'desc',
  })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = rows.filter((row) => {
      if (needle) {
        const haystack = [row.name, row.email, row.organization, row.role, row.city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }

      switch (filter) {
        case 'active':
          return row.linkState === 'active'
        case 'revoked':
          return row.linkState === 'revoked'
        case 'expired':
          return row.linkState === 'expired'
        case 'unopened':
          return row.sessionCount === 0
        case 'flagged':
          return row.flagged
        case 'nda':
          return Boolean(row.ndaSignedAt)
        case 'no-nda':
          return !row.ndaSignedAt
        default:
          return true
      }
    })

    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sort.key)
      const right = sortValue(b, sort.key)
      const comparison =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right)
      return sort.dir === 'asc' ? comparison : -comparison
    })
  }, [rows, query, filter, sort])

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    )
  }

  function SortableTh({
    label,
    sortKey,
    align = 'left',
    className,
  }: {
    label: string
    sortKey: SortKey
    align?: 'left' | 'right'
    className?: string
  }) {
    const active = sort.key === sortKey
    return (
      <Th align={align} className={className}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          aria-label={`Sort by ${label}`}
          className={cn(
            'inline-flex items-center gap-1 transition-colors hover:text-[var(--text-primary)]',
            active && 'text-[var(--text-primary)]',
            align === 'right' && 'flex-row-reverse',
          )}
        >
          {label}
          {active ? (
            sort.dir === 'asc' ? (
              <ArrowUp size={11} aria-hidden />
            ) : (
              <ArrowDown size={11} aria-hidden />
            )
          ) : null}
        </button>
      </Th>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <label htmlFor="visitor-search" className="sr-only">
            Search visitors
          </label>
          <input
            id="visitor-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, email, organisation, city"
            className={fieldClass('pl-10')}
          />
        </div>

        <div className="relative sm:w-[210px]">
          <ListFilter
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <label htmlFor="visitor-filter" className="sr-only">
            Filter visitors
          </label>
          <select
            id="visitor-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterValue)}
            className={fieldClass('appearance-none pl-10 pr-8')}
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronRight
            size={14}
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[var(--text-muted)]"
          />
        </div>
      </div>

      <div className="namu-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <SortableTh label="Visitor" sortKey="name" />
                <SortableTh label="Engagement" sortKey="engagementScore" />
                <SortableTh label="Visits" sortKey="sessionCount" align="right" />
                <SortableTh label="Time" sortKey="totalActiveMs" align="right" />
                <SortableTh
                  label="Docs"
                  sortKey="documentsOpened"
                  align="right"
                  className="hidden lg:table-cell"
                />
                <SortableTh
                  label="Downloads"
                  sortKey="downloads"
                  align="right"
                  className="hidden xl:table-cell"
                />
                <Th className="hidden lg:table-cell">Location</Th>
                <Th className="hidden md:table-cell">NDA</Th>
                <SortableTh label="Last seen" sortKey="lastSeenAt" />
                <Th>Link</Th>
              </tr>
            </thead>

            <tbody>
              {visible.map((row) => {
                const chip = LINK_CHIP[row.linkState]
                return (
                  <tr
                    key={row.visitorId}
                    className="border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--surface-sunken)]"
                  >
                    <Td className="max-w-[280px]">
                      <Link
                        href={`/admin/visitors/${row.visitorId}`}
                        className="flex items-center gap-3"
                      >
                        <Initials value={initials(row.name ?? row.email)} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[var(--text-primary)]">
                              {row.name ?? row.email}
                            </span>
                            {row.flagged ? (
                              <Chip
                                tone="attention"
                                title="A visit came from a device or country this link was not first opened on. The invite may have been forwarded."
                              >
                                <TriangleAlert size={10} aria-hidden />
                                Opened from a new device
                              </Chip>
                            ) : null}
                          </span>
                          <span className="block truncate text-[0.78rem] text-[var(--text-muted)]">
                            {row.name ? `${row.email}` : ''}
                            {row.name && row.organization ? ' · ' : ''}
                            {row.organization ?? ''}
                          </span>
                        </span>
                      </Link>
                    </Td>

                    <Td>
                      <span className="flex items-center gap-2">
                        <Meter
                          value={row.engagementScore}
                          label={`Engagement ${row.engagementScore} out of 100`}
                        />
                        <span className="tnum w-7 text-right text-[0.8rem]">
                          {row.engagementScore}
                        </span>
                      </span>
                    </Td>

                    <Td align="right" className="tnum">
                      {formatCount(row.sessionCount)}
                    </Td>
                    <Td align="right" className="tnum whitespace-nowrap">
                      {formatDuration(row.totalActiveMs)}
                    </Td>
                    <Td align="right" className="tnum hidden lg:table-cell">
                      {formatCount(row.documentsOpened)}
                    </Td>
                    <Td align="right" className="tnum hidden xl:table-cell">
                      {formatCount(row.downloads)}
                    </Td>

                    <Td className="hidden whitespace-nowrap lg:table-cell">
                      {row.country ? (
                        <span title={countryName(row.country)}>
                          <span aria-hidden>{countryFlag(row.country)}</span>{' '}
                          {row.city ?? countryName(row.country)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>

                    <Td className="hidden md:table-cell">
                      {row.ndaSignedAt ? (
                        <Chip tone="positive">Signed</Chip>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>

                    <Td className="whitespace-nowrap">
                      {row.lastSeenAt ? (
                        <RelativeTime value={row.lastSeenAt} />
                      ) : (
                        <span className="text-[var(--text-muted)]">Never</span>
                      )}
                    </Td>

                    <Td>
                      <Chip tone={chip.tone} title={chip.title}>
                        {chip.label}
                      </Chip>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-10">
            <p className="text-[0.9rem] text-[var(--text-primary)]">
              Nobody matches that.
            </p>
            <Note className="mt-1">
              {query
                ? `No visitor’s name, email, organisation or city contains “${query.trim()}”.`
                : 'No visitor is in that state right now.'}
            </Note>
          </div>
        ) : null}
      </div>

      <Note>
        Showing {formatCount(visible.length)} of {formatCount(rows.length)}{' '}
        {rows.length === 1 ? 'person' : 'people'}. Engagement is scored out of 100 and weighted
        toward depth of reading — finishing one document beats opening ten.
      </Note>
    </div>
  )
}
