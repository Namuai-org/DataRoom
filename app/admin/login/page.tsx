import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { brand } from '@/lib/brand'
import { NamuLogoAuto } from '@/components/brand/Logo'
import { AdminLoginForm } from '@/components/admin/AdminLoginForm'
import { ThemeToggle } from '@/components/admin/ThemeToggle'
import { isMailConfigured } from '../_lib/mail'

/**
 * The one page under /admin that is not guarded. It sits outside the
 * `(console)` route group so the console shell never wraps it — see the comment
 * in app/admin/layout.tsx.
 */

export const metadata: Metadata = {
  title: 'Sign in — Namu Data Room',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  // Already signed in? Nobody needs to look at a login form twice.
  const session = await requireAdmin()
  if (session) redirect('/admin')

  return (
    <div className="relative flex min-h-dvh flex-col bg-[var(--surface)]">
      <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="animate-fade-up w-full max-w-[420px]">
          <div className="mb-9 flex flex-col gap-6">
            {/* Centred over the column, while the heading below stays left
                aligned — the brand board asks for left alignment in body
                copy, so only the mark itself is centred. */}
            <div className="flex justify-center">
              <NamuLogoAuto height={30} />
            </div>
            <div>
              <p className="label mb-3">Data room</p>
              <h1 className="font-display text-[2.1rem] leading-[1.12] text-[var(--text-primary)]">
                The control room
              </h1>
              <p className="text-pretty mt-3 text-[0.95rem] leading-relaxed text-[var(--text-secondary)]">
                Everything the room records — who read what, for how long, and from where — lives
                behind this form.
              </p>
            </div>
          </div>

          <div className="namu-card p-6 sm:p-7">
            <AdminLoginForm mailConfigured={isMailConfigured()} />
          </div>

          <p className="mt-8 text-[0.78rem] leading-relaxed text-[var(--text-muted)]">
            {brand.legalName} — {brand.site}. This console is for the room’s administrators. If you
            were sent a link to read documents, use that link instead; it does not come through
            here.
          </p>
        </div>
      </main>
    </div>
  )
}
