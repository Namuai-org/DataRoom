import 'server-only'
import { redirect } from 'next/navigation'
import { requireAdmin, type AdminSession } from '@/lib/auth'

/**
 * The single gate used by every admin page.
 *
 * `requireAdmin()` re-reads the admins table on every call, so removing an
 * admin logs them out on their next request rather than when their cookie
 * happens to expire. Each page calls this itself: a layout check is convenient
 * but it is not a security boundary, because a nested page can be rendered
 * without its parent layout re-running in some navigation paths.
 */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await requireAdmin()
  if (!session) redirect('/admin/login')
  return session
}

/**
 * The same gate for server actions. Actions throw rather than redirect —
 * a redirect from a mutation the caller was never allowed to make would hide
 * the failure behind a page transition.
 */
export async function requireAdminAction(): Promise<AdminSession> {
  const session = await requireAdmin()
  if (!session) throw new Error('Your session has expired. Sign in again.')
  return session
}

/** Owner-only actions: adding and removing other admins. */
export async function requireOwnerAction(): Promise<AdminSession> {
  const session = await requireAdminAction()
  if (!session.isOwner) throw new Error('Only the room owner can do this.')
  return session
}
