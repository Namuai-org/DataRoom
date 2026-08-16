'use client'

import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'
import { buttonClass } from '@/components/admin/ui'

/**
 * Errors inside a console page keep the sidebar, so the reader can walk to a
 * section that still works instead of being dumped on a dead end.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin/console] unhandled error', error)
  }, [error])

  return (
    <div className="max-w-[600px]">
      <p className="label mb-3">This section</p>
      <h1 className="font-display text-[1.9rem] leading-tight text-[var(--text-primary)]">
        This page could not be loaded
      </h1>
      <p className="text-pretty mt-4 text-[0.95rem] leading-relaxed text-[var(--text-secondary)]">
        A query failed on the way in. Everything else in the console still works — the sidebar is
        live.
      </p>

      <pre className="mt-5 overflow-x-auto rounded-[9px] bg-[var(--surface-sunken)] px-4 py-3 font-mono text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
        {error.message || 'No message was attached to the error.'}
        {error.digest ? `\n\ndigest: ${error.digest}` : ''}
      </pre>

      <button type="button" onClick={reset} className={buttonClass('primary', 'md', 'mt-7')}>
        <RotateCw size={15} aria-hidden />
        Try again
      </button>
    </div>
  )
}
