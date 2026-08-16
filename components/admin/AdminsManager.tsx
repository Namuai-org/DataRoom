'use client'

import { useActionState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { addAdmin, removeAdmin } from '@/app/admin/_actions/settings'
import { IDLE, type ActionState } from '@/app/admin/_lib/action-state'
import { initials } from '@/lib/utils'
import { ActionMessage } from './ActionMessage'
import { RelativeTime } from './RelativeTime'
import { ConfirmSubmit, SubmitButton } from './SubmitButton'
import { Card, Chip, Field, fieldClass, Initials, Note, SectionTitle } from './ui'

export type AdminView = {
  id: string
  email: string
  name: string | null
  isOwner: boolean
  lastLoginAt: string | null
  createdAt: string
}

/**
 * Who can open the console.
 *
 * Adding an admin sends nothing and creates no password — there is none. The
 * new address can simply request a one-time code from the sign-in page. Removal
 * takes effect on that person's very next request, because `requireAdmin()`
 * re-reads this table on every call.
 */
export function AdminsManager({
  admins,
  viewerIsOwner,
  viewerId,
}: {
  admins: AdminView[]
  viewerIsOwner: boolean
  viewerId: string
}) {
  const [addState, addAction] = useActionState<ActionState, FormData>(addAdmin, IDLE)
  const [removeState, removeAction] = useActionState<ActionState, FormData>(removeAdmin, IDLE)

  return (
    <Card>
      <SectionTitle
        aside={
          <span className="tnum">
            {admins.length} {admins.length === 1 ? 'person' : 'people'}
          </span>
        }
      >
        Administrators
      </SectionTitle>

      <ul className="mb-6 flex flex-col">
        {admins.map((admin) => (
          <li
            key={admin.id}
            className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <Initials value={initials(admin.name ?? admin.email)} />

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[0.875rem] text-[var(--text-primary)]">
                  {admin.name ?? admin.email}
                </span>
                {admin.isOwner ? <Chip tone="neutral">Owner</Chip> : null}
                {admin.id === viewerId ? <Chip tone="muted">You</Chip> : null}
              </p>
              <p className="tnum truncate text-[0.75rem] text-[var(--text-muted)]">
                {admin.name ? `${admin.email} · ` : ''}
                {admin.lastLoginAt ? (
                  <>
                    last signed in <RelativeTime value={admin.lastLoginAt} />
                  </>
                ) : (
                  'never signed in'
                )}
              </p>
            </div>

            {viewerIsOwner && !admin.isOwner && admin.id !== viewerId ? (
              <form action={removeAction} className="shrink-0">
                <input type="hidden" name="adminId" value={admin.id} />
                <ConfirmSubmit
                  confirmMessage={`Remove ${admin.email}? They lose console access on their next request.`}
                  aria-label={`Remove ${admin.email}`}
                >
                  <Trash2 size={13} aria-hidden />
                  Remove
                </ConfirmSubmit>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <ActionMessage state={removeState} className="mb-4" />

      {viewerIsOwner ? (
        <form action={addAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="new-admin-email">
              <input
                id="new-admin-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="colleague@company.com"
                className={fieldClass()}
              />
            </Field>
            <Field label="Name" htmlFor="new-admin-name">
              <input
                id="new-admin-name"
                name="name"
                maxLength={120}
                placeholder="Optional"
                className={fieldClass()}
              />
            </Field>
          </div>

          <ActionMessage state={addState} />

          <div>
            <SubmitButton variant="secondary" pendingLabel="Adding…">
              <UserPlus size={14} aria-hidden />
              Add administrator
            </SubmitButton>
          </div>

          <Note>
            An administrator sees everything this console shows, including every visitor’s reading
            history. Only the owner can add or remove people here, and the owner cannot be removed.
          </Note>
        </form>
      ) : (
        <Note>
          Only the room’s owner can add or remove administrators. Ask them if someone else needs
          access.
        </Note>
      )}
    </Card>
  )
}
