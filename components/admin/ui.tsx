import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Presentational primitives for the console. Server-safe on purpose — none of
 * these take a hook, so they can be rendered straight from a page without
 * pulling anything extra into the client bundle.
 *
 * Colour discipline: Sahel is a precision accent. Nothing in this file reaches
 * for it by default. A caller asks for it explicitly, once per view.
 */

/* -------------------------------------------------------------------------- */
/*  Page furniture                                                             */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <p className="label mb-3">{eyebrow}</p> : null}
        <h1 className="font-display text-[2rem] leading-[1.1] text-[var(--text-primary)] sm:text-[2.6rem]">
          {title}
        </h1>
        {lede ? (
          <p className="text-pretty mt-4 max-w-xl text-[0.95rem] leading-relaxed text-[var(--text-secondary)]">
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  )
}

export function SectionTitle({
  children,
  aside,
  className,
}: {
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex items-baseline justify-between gap-4', className)}>
      <h2 className="font-display text-[1.35rem] leading-tight text-[var(--text-primary)]">
        {children}
      </h2>
      {aside ? <div className="shrink-0 text-sm text-[var(--text-muted)]">{aside}</div> : null}
    </div>
  )
}

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <Tag className={cn('namu-card p-6 sm:p-7', className)}>{children}</Tag>
}

export function Hairline({ className }: { className?: string }) {
  return <div className={cn('hairline my-8', className)} role="presentation" />
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Class strings rather than a component, so a server-rendered <form> button and
 * a client SubmitButton can look identical without either importing the other.
 *
 * Note what is missing: there is no Sahel button. The brand board is explicit
 * that Sahel marks one thing per view, and a button colour repeated down a page
 * is decoration. Primary actions are Ink on Harmattan.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90 border border-transparent',
  secondary:
    'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:border-[var(--text-secondary)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
  danger:
    'bg-transparent text-[var(--color-kola)] border border-[color-mix(in_oklab,var(--color-kola)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-kola)_10%,transparent)]',
}

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: 'sm' | 'md' = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[9px] font-medium whitespace-nowrap',
    'transition-[opacity,background-color,border-color,transform] duration-200 [transition-timing-function:var(--ease-namu)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'px-3 py-1.5 text-[0.8rem]' : 'px-4 py-2.5 text-[0.875rem]',
    BUTTON_VARIANTS[variant],
    className,
  )
}

/** Shared field styling for inputs, selects and textareas. */
export function fieldClass(className?: string): string {
  return cn(
    'w-full rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5',
    'text-[0.9rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'transition-[border-color] duration-200 [transition-timing-function:var(--ease-namu)]',
    'hover:border-[var(--text-muted)] disabled:opacity-60',
    className,
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint ? <Note>{hint}</Note> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Numbers                                                                    */
/* -------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** Marks this as the view's single focal number. Use at most once. */
  accent?: boolean
}) {
  return (
    <div className="namu-card flex flex-col justify-between gap-3 p-5">
      <div className="flex items-center gap-2">
        {accent ? <span className="sahel-dot" aria-hidden /> : null}
        <p className="label">{label}</p>
      </div>
      <p className="tnum font-display text-[1.9rem] leading-none text-[var(--text-primary)]">
        {value}
      </p>
      {sub ? <p className="text-[0.8rem] text-[var(--text-muted)]">{sub}</p> : null}
    </div>
  )
}

/** A quiet horizontal meter. Ink by default; Sahel only when asked. */
export function Meter({
  value,
  max = 100,
  label,
  accent = false,
  className,
}: {
  value: number
  max?: number
  label?: string
  accent?: boolean
  className?: string
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <span className="relative block h-[5px] w-full max-w-[92px] overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${ratio * 100}%`,
            background: accent ? 'var(--color-sahel)' : 'var(--text-secondary)',
          }}
        />
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Chips                                                                      */
/* -------------------------------------------------------------------------- */

export type ChipTone = 'neutral' | 'positive' | 'attention' | 'muted' | 'accent'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-[var(--border-subtle)] text-[var(--text-secondary)]',
  muted: 'border-transparent bg-[var(--surface-sunken)] text-[var(--text-muted)]',
  positive: 'border-transparent text-[var(--color-forest)] bg-[color-mix(in_oklab,var(--color-forest)_12%,transparent)]',
  attention:
    'border-transparent text-[var(--color-kola)] bg-[color-mix(in_oklab,var(--color-sahel)_20%,transparent)]',
  accent: 'border-[var(--color-sahel)] text-[var(--text-primary)]',
}

export function Chip({
  children,
  tone = 'neutral',
  title,
  className,
}: {
  children: ReactNode
  tone?: ChipTone
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[0.7rem] font-medium leading-none',
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  States                                                                     */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="namu-card flex flex-col items-start gap-4 px-7 py-12 sm:px-10 sm:py-16">
      {icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          {icon}
        </span>
      ) : null}
      <h3 className="font-display text-[1.5rem] leading-tight text-[var(--text-primary)]">
        {title}
      </h3>
      {children ? (
        <div className="text-pretty max-w-lg text-[0.95rem] leading-relaxed text-[var(--text-secondary)]">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/**
 * Shown when a query throws. It names what failed and what to do about it —
 * a blank panel teaches the reader nothing.
 */
export function ErrorPanel({
  title = 'This section could not be loaded',
  detail,
  hint,
}: {
  title?: string
  detail?: string
  hint?: string
}) {
  return (
    <div
      className="namu-card border-l-2 p-6"
      style={{ borderLeftColor: 'var(--color-sahel)' }}
      role="alert"
    >
      <h3 className="font-display text-[1.15rem] text-[var(--text-primary)]">{title}</h3>
      {detail ? (
        <p className="mt-2 font-mono text-[0.78rem] leading-relaxed text-[var(--text-secondary)]">
          {detail}
        </p>
      ) : null}
      <p className="mt-3 text-[0.9rem] leading-relaxed text-[var(--text-muted)]">
        {hint ??
          'The rest of the console still works. If this keeps happening, check that DATABASE_URL points at a reachable Neon branch.'}
      </p>
    </div>
  )
}

/** A one-line explanatory note under a control or a number. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[0.8rem] leading-relaxed text-[var(--text-muted)]', className)}>
      {children}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tables                                                                     */
/* -------------------------------------------------------------------------- */

/** Horizontal scroll container so wide tables degrade instead of overflowing. */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="namu-card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Th({
  children,
  className,
  align = 'left',
  scope = 'col',
}: {
  children: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
  scope?: 'col' | 'row'
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'label whitespace-nowrap px-4 py-3 font-medium',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <td
      className={cn(
        'px-4 py-3.5 align-middle text-[0.875rem] text-[var(--text-secondary)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export function Initials({ value, className }: { value: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[0.7rem] font-semibold tracking-wide text-[var(--text-secondary)]',
        className,
      )}
    >
      {value}
    </span>
  )
}
