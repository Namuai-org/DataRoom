'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCw } from 'lucide-react'
import { buttonClass } from '@/components/admin/ui'

/**
 * Last line of defence for anything under /admin, including the login page.
 *
 * The most likely cause in a fresh checkout is a missing environment variable —
 * `lib/db` throws at import time without DATABASE_URL, and `lib/auth` throws
 * without SESSION_SECRET — so the copy names both rather than showing a shrug.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] unhandled error', error)
  }, [error])

  const missingEnv = /DATABASE_URL|SESSION_SECRET|BLOB_READ_WRITE_TOKEN/.test(error.message)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)] px-5 py-16">
      <div className="w-full max-w-[520px]">
        <p className="label mb-3">Something broke</p>
        <h1 className="font-display text-[2rem] leading-tight text-[var(--text-primary)]">
          The console could not finish loading
        </h1>

        <p className="text-pretty mt-4 text-[0.95rem] leading-relaxed text-[var(--text-secondary)]">
          {missingEnv
            ? 'This looks like a missing environment variable. The console needs DATABASE_URL and SESSION_SECRET before it can read anything.'
            : 'The page threw before it could render. The error is below, and the same text is in the server log.'}
        </p>

        <pre className="mt-5 overflow-x-auto rounded-[9px] bg-[var(--surface-sunken)] px-4 py-3 font-mono text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
          {error.message || 'No message was attached to the error.'}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button type="button" onClick={reset} className={buttonClass('primary')}>
            <RotateCw size={15} aria-hidden />
            Try again
          </button>
          <Link href="/admin/login" className={buttonClass('secondary')}>
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
