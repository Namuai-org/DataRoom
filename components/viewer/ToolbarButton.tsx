'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The shared control vocabulary for every renderer's toolbar. */

export type ToolbarButtonProps = {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}

export function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        'flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors duration-300',
        disabled
          ? 'cursor-default text-[var(--text-muted)] opacity-40'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
        active && !disabled && 'bg-[var(--surface-sunken)] text-[var(--text-primary)]',
      )}
      style={{ transitionTimingFunction: 'var(--ease-namu)' }}
    >
      <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
    </button>
  )
}

export function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-4 w-px flex-none bg-[var(--border-subtle)]"
    />
  )
}

export function ToolbarShell({ children }: { children: ReactNode }) {
  return (
    <div
      // Deliberately a group, not role="toolbar": that role promises arrow-key
      // roving focus, and in this viewer the arrow keys move the document.
      role="group"
      aria-label="Document controls"
      className="flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-1.5 py-1"
    >
      {children}
    </div>
  )
}
