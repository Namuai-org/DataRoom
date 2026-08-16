import { AdminShell } from '@/components/admin/AdminShell'
import { requireAdminPage } from '../_lib/guard'

/**
 * The guarded shell. See the long comment in `app/admin/layout.tsx` for why the
 * console lives in a route group rather than being guarded one level up.
 *
 * This check makes an unauthenticated visitor land on the login page instead of
 * an empty frame. It is not the security boundary — each page under here calls
 * `requireAdminPage()` again before it touches the database.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage()

  return (
    <AdminShell email={admin.email} isOwner={admin.isOwner}>
      {children}
    </AdminShell>
  )
}
