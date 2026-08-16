'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Ban, Mail, RefreshCw } from 'lucide-react'
import { regenerateInvite, revokeInvite } from '@/app/admin/_actions/invites'
import { IDLE, INVITE_IDLE, type ActionState, type InviteState } from '@/app/admin/_lib/action-state'
import { STATUS_COPY, type InviteStatus } from '@/app/admin/_lib/view-types'
import { formatCount } from '@/app/admin/_lib/format'
import { initials } from '@/lib/utils'
import { ActionMessage } from './ActionMessage'
import { OneTimeLink } from './OneTimeLink'
import { RelativeTime } from './RelativeTime'
import { ConfirmSubmit, SubmitButton } from './SubmitButton'
import { Chip, Initials, Note, Td, Th } from './ui'

export type InviteRowView = {
  linkId: string
  visitorId: string
  email: string
  name: string | null
  organization: string | null
  label: string | null
  tokenPreview: string
  status: InviteStatus
  createdAt: string
  sentAt: string | null
  firstOpenedAt: string | null
  expiresAt: string | null
  openCount: number
  sessionCount: number
  canDownload: boolean
  invitedBy: string | null
}

/**
 * The invite ledger.
 *
 * There is no "copy" button on an old row, and that is not an omission: the raw
 * token was never stored, so there is nothing to copy. The honest replacement
 * is to mint a new link, which revokes the old one — the action says so in
 * those words rather than pretending to resend the original.
 */
export function InvitesTable({
  rows,
  mailConfigured,
}: {
  rows: InviteRowView[]
  mailConfigured: boolean
}) {
  // One action state shared by every row: only one link can be minted at a
  // time, and the result panel belongs to the page, not to a row.
  const [regenState, regenAction] = useActionState<InviteState, FormData>(
    regenerateInvite,
    INVITE_IDLE,
  )
  const [revokeState, revokeAction] = useActionState<ActionState, FormData>(revokeInvite, IDLE)

  return (
    <div className="flex flex-col gap-4">
      <OneTimeLink state={regenState} />
      <ActionMessage state={revokeState} />
      {regenState.status === 'error' ? <ActionMessage state={regenState} /> : null}

      <div className="namu-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <Th>Visitor</Th>
                <Th>Link</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Created</Th>
                <Th className="hidden xl:table-cell">Emailed</Th>
                <Th className="hidden lg:table-cell">First opened</Th>
                <Th align="right" className="hidden md:table-cell">
                  Opens
                </Th>
                <Th className="hidden md:table-cell">Expires</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const copy = STATUS_COPY[row.status]
                const dead = row.status === 'revoked' || row.status === 'expired'

                return (
                  <tr
                    key={row.linkId}
                    className="border-b border-[var(--border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--surface-sunken)]"
                  >
                    <Td className="max-w-[240px]">
                      <Link
                        href={`/admin/visitors/${row.visitorId}`}
                        className="flex items-center gap-3"
                      >
                        <Initials value={initials(row.name ?? row.email)} />
                        <span className="min-w-0">
                          <span className="block truncate text-[var(--text-primary)]">
                            {row.name ?? row.email}
                          </span>
                          <span className="block truncate text-[0.75rem] text-[var(--text-muted)]">
                            {row.name ? row.email : (row.organization ?? '')}
                          </span>
                        </span>
                      </Link>
                    </Td>

                    <Td>
                      <span className="flex flex-col gap-1">
                        <code className="w-fit rounded-[6px] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[0.72rem]">
                          {row.tokenPreview}…
                        </code>
                        {row.label ? (
                          <span className="text-[0.72rem] text-[var(--text-muted)]">
                            {row.label}
                          </span>
                        ) : null}
                      </span>
                    </Td>

                    <Td>
                      <span className="flex flex-col items-start gap-1">
                        <Chip tone={copy.tone} title={copy.explain}>
                          {copy.label}
                        </Chip>
                        {row.canDownload ? (
                          <span className="text-[0.7rem] text-[var(--text-muted)]">
                            downloads on
                          </span>
                        ) : null}
                      </span>
                    </Td>

                    <Td className="hidden whitespace-nowrap lg:table-cell">
                      <RelativeTime value={row.createdAt} />
                    </Td>

                    <Td className="hidden whitespace-nowrap xl:table-cell">
                      {row.sentAt ? (
                        <RelativeTime value={row.sentAt} />
                      ) : (
                        <span className="text-[var(--text-muted)]">Not emailed</span>
                      )}
                    </Td>

                    <Td className="hidden whitespace-nowrap lg:table-cell">
                      {row.firstOpenedAt ? (
                        <RelativeTime value={row.firstOpenedAt} />
                      ) : (
                        <span className="text-[var(--text-muted)]">Never</span>
                      )}
                    </Td>

                    <Td align="right" className="tnum hidden md:table-cell">
                      {formatCount(row.openCount)}
                    </Td>

                    <Td className="hidden whitespace-nowrap md:table-cell">
                      {row.expiresAt ? (
                        <RelativeTime value={row.expiresAt} />
                      ) : (
                        <span className="text-[var(--text-muted)]">Never</span>
                      )}
                    </Td>

                    <Td align="right">
                      <span className="flex items-center justify-end gap-1.5">
                        <form action={regenAction}>
                          <input type="hidden" name="linkId" value={row.linkId} />
                          <SubmitButton
                            variant="ghost"
                            size="sm"
                            pendingLabel="…"
                            aria-label={`Mint a replacement link for ${row.email}`}
                          >
                            <RefreshCw size={13} aria-hidden />
                            New link
                          </SubmitButton>
                        </form>

                        {mailConfigured ? (
                          <form action={regenAction}>
                            <input type="hidden" name="linkId" value={row.linkId} />
                            <input type="hidden" name="sendEmail" value="true" />
                            <SubmitButton
                              variant="ghost"
                              size="sm"
                              pendingLabel="…"
                              aria-label={`Email a replacement link to ${row.email}`}
                            >
                              <Mail size={13} aria-hidden />
                              Resend
                            </SubmitButton>
                          </form>
                        ) : null}

                        {!dead ? (
                          <form action={revokeAction}>
                            <input type="hidden" name="linkId" value={row.linkId} />
                            <ConfirmSubmit
                              confirmMessage={`Revoke this link for ${row.email}? They lose access immediately.`}
                              aria-label={`Revoke the link for ${row.email}`}
                            >
                              <Ban size={13} aria-hidden />
                              Revoke
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Note>
        “New link” and “Resend” both mint a fresh token and revoke the one on that row — the
        original was never stored, only its hash, so it cannot be shown again. Revoking takes effect
        on the visitor’s next request, not when their session happens to expire.
      </Note>
    </div>
  )
}
