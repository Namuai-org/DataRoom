import type { Metadata } from 'next'

/**
 * WHY THIS LAYOUT DOES NOTHING
 *
 * The obvious design — put `requireAdmin()` in `app/admin/layout.tsx` — cannot
 * work, because `/admin/login` is itself under `/admin`. Layouts nest: a
 * `login/layout.tsx` would render *inside* this one, not instead of it, so the
 * guard would still run and redirect the login page to itself. There is also no
 * way to read the pathname inside a layout to special-case it.
 *
 * So the tree is split with a route group instead:
 *
 *   app/admin/layout.tsx          ← this file: no guard, no chrome
 *   app/admin/login/page.tsx      ← public; renders its own bare shell
 *   app/admin/(console)/layout.tsx ← the sidebar shell, guarded
 *   app/admin/(console)/page.tsx   ← /admin
 *   app/admin/(console)/visitors/… ← /admin/visitors, and so on
 *
 * `(console)` adds no URL segment, so the console pages keep their addresses
 * while sitting under a layout the login page never touches.
 *
 * The guard in `(console)/layout.tsx` is convenience, not security. Every page
 * and every server action calls `requireAdmin()` for itself, because a layout
 * is not re-rendered on every navigation and therefore cannot be relied on as
 * the gate for the data a page reads.
 */

export const metadata: Metadata = {
  title: 'Console — Namu Data Room',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children
}
