import { CircleCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActionState } from '@/app/admin/_lib/action-state'

/**
 * The result of a server action, said plainly.
 *
 * `role="status"` rather than `role="alert"` for successes: an alert interrupts
 * a screen reader mid-sentence, which is the wrong weight for "Settings saved".
 * Failures do interrupt, because they mean the thing the reader asked for did
 * not happen.
 */
export function ActionMessage({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === 'idle' || !state.message) return null

  const failed = state.status === 'error'

  return (
    <p
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-2 rounded-[9px] px-3.5 py-2.5 text-[0.85rem] leading-relaxed',
        failed
          ? 'bg-[color-mix(in_oklab,var(--color-sahel)_16%,transparent)] text-[var(--color-kola)]'
          : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
        className,
      )}
    >
      {failed ? (
        <TriangleAlert size={15} aria-hidden className="mt-[2px] shrink-0" />
      ) : (
        <CircleCheck size={15} aria-hidden className="mt-[2px] shrink-0" />
      )}
      <span>{state.message}</span>
    </p>
  )
}
