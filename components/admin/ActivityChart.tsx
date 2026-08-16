'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { useThemeTone } from './ThemeToggle'

export type ActivityPoint = {
  date: string
  sessions: number
  documentOpens: number
  activeMinutes: number
}

/**
 * Thirty days of room activity.
 *
 * Colour follows the brand board rather than recharts' defaults: Ink for the
 * structural line, Dry Clay for the fill underneath it, and Sahel for exactly
 * one series — visits, the number the rest of the page is about.
 *
 * The palette is resolved to concrete hex values rather than CSS variables
 * because SVG presentation attributes do not accept `var()`. `useThemeTone`
 * watches `data-theme` on <html>, so the chart repaints when the theme flips.
 */
const PALETTE = {
  light: {
    accent: '#E8935A',
    line: '#3B2E25',
    fill: '#EDD9B0',
    fillOpacity: 0.55,
    grid: 'rgba(28, 20, 16, 0.09)',
    axis: '#8F7D71',
    surface: '#FFFDF8',
    border: 'rgba(28, 20, 16, 0.14)',
    text: '#1C1410',
    subtext: '#6F5C50',
  },
  dark: {
    accent: '#E8935A',
    line: '#B3A396',
    fill: '#6B3E1E',
    fillOpacity: 0.42,
    grid: 'rgba(247, 240, 227, 0.09)',
    axis: 'rgba(247, 240, 227, 0.45)',
    surface: '#241B15',
    border: 'rgba(247, 240, 227, 0.16)',
    text: '#F7F0E3',
    subtext: 'rgba(247, 240, 227, 0.72)',
  },
} as const

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
] as const

function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

/** Props recharts clones onto a `content` element. Everything is optional. */
type TooltipShape = {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; payload?: unknown }>
}

function ChartTooltip({ active, label, payload }: TooltipShape) {
  if (!active || !payload || payload.length === 0) return null

  const point = payload[0]?.payload as ActivityPoint | undefined
  if (!point) return null

  return (
    <div
      className="rounded-[10px] border px-3.5 py-2.5 text-[0.8rem]"
      style={{
        background: 'var(--surface-raised)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <p className="mb-1.5 font-medium text-[var(--text-primary)]">
        {shortDate(String(label ?? point.date))}
      </p>
      <dl className="tnum flex flex-col gap-0.5 text-[var(--text-secondary)]">
        <div className="flex items-center justify-between gap-6">
          <dt className="flex items-center gap-1.5">
            <span className="sahel-dot" aria-hidden />
            Visits
          </dt>
          <dd>{point.sessions}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt>Documents opened</dt>
          <dd>{point.documentOpens}</dd>
        </div>
        <div className="flex items-center justify-between gap-6">
          <dt>Reading time</dt>
          <dd>{point.activeMinutes} min</dd>
        </div>
      </dl>
    </div>
  )
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const { theme, mounted } = useThemeTone()
  const [days, setDays] = useState<number>(30)

  const rows = useMemo(() => data.slice(Math.max(0, data.length - days)), [data, days])
  const colors = PALETTE[theme]

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          sessions: acc.sessions + row.sessions,
          opens: acc.opens + row.documentOpens,
          minutes: acc.minutes + row.activeMinutes,
        }),
        { sessions: 0, opens: 0, minutes: 0 },
      ),
    [rows],
  )

  return (
    <section className="namu-card p-6 sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.35rem] leading-tight text-[var(--text-primary)]">
            Activity
          </h2>
          <p className="tnum mt-1.5 text-[0.85rem] text-[var(--text-secondary)]">
            {totals.sessions} visit{totals.sessions === 1 ? '' : 's'} · {totals.opens} document
            open{totals.opens === 1 ? '' : 's'} · {totals.minutes} minute
            {totals.minutes === 1 ? '' : 's'} of reading
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart range"
          className="flex items-center gap-0.5 rounded-[9px] bg-[var(--surface-sunken)] p-0.5"
        >
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDays(range.days)}
              aria-pressed={days === range.days}
              className={cn(
                'rounded-[7px] px-2.5 py-1.5 text-[0.75rem] transition-colors duration-200',
                days === range.days
                  ? 'bg-[var(--surface-raised)] font-medium text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        Recharts measures its container, so it cannot render meaningfully during
        SSR. Holding a same-height skeleton until mount keeps the card from
        collapsing and reflowing the page underneath it.
      */}
      {!mounted ? (
        <div className="skeleton h-[260px] w-full rounded-[10px]" aria-hidden />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="namu-activity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.fill} stopOpacity={colors.fillOpacity} />
                  <stop offset="100%" stopColor={colors.fill} stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="0" />

              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                tick={{ fill: colors.axis, fontSize: 11 }}
                minTickGap={26}
                dy={6}
              />
              <YAxis
                allowDecimals={false}
                width={46}
                tickLine={false}
                axisLine={false}
                tick={{ fill: colors.axis, fontSize: 11 }}
              />

              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: colors.grid, strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="documentOpens"
                name="Documents opened"
                stroke={colors.line}
                strokeWidth={1.25}
                fill="url(#namu-activity-fill)"
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                name="Visits"
                stroke={colors.accent}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3.5, fill: colors.accent, stroke: colors.surface, strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.78rem] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="sahel-dot" aria-hidden />
          Visits — one per arrival in the room
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-[6px] w-[14px] rounded-[2px]"
            style={{ background: colors.fill, opacity: colors.fillOpacity }}
          />
          Documents opened
        </span>
      </p>
    </section>
  )
}
