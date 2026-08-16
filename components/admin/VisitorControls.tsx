'use client'

import { useActionState } from 'react'
import { Ban, Download, KeyRound, Save, Trash2 } from 'lucide-react'
import {
  deleteVisitor,
  issueLinkForVisitor,
  updateVisitor,
} from '@/app/admin/_actions/visitors'
import { revokeAllLinksForVisitor, setLinkDownload } from '@/app/admin/_actions/invites'
import { EXPIRY_CHOICES } from '@/app/admin/_lib/expiry'
import {
  IDLE,
  INVITE_IDLE,
  type ActionState,
  type InviteState,
} from '@/app/admin/_lib/action-state'
import { STATUS_COPY, type AccessLinkView, type FolderOption } from '@/app/admin/_lib/view-types'
import { displayFolderName } from '@/lib/brand'
import { ActionMessage } from './ActionMessage'
import { OneTimeLink } from './OneTimeLink'
import { RelativeTime } from './RelativeTime'
import { ConfirmSubmit, SubmitButton } from './SubmitButton'
import { Card, Chip, Field, fieldClass, Note, SectionTitle } from './ui'

/* -------------------------------------------------------------------------- */
/*  Access                                                                     */
/* -------------------------------------------------------------------------- */

function LinkDownloadToggle({ link }: { link: AccessLinkView }) {
  const [state, action] = useActionState<ActionState, FormData>(setLinkDownload, IDLE)

  return (
    <form action={action} className="contents">
      <input type="hidden" name="linkId" value={link.id} />
      <input type="hidden" name="canDownload" value={link.canDownload ? 'false' : 'true'} />
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingLabel="Saving…"
        aria-label={
          link.canDownload
            ? 'Block downloads on this link'
            : 'Allow downloads on this link'
        }
      >
        <Download size={13} aria-hidden />
        {link.canDownload ? 'Downloads on' : 'Downloads off'}
      </SubmitButton>
      <ActionMessage state={state} className="sr-only" />
    </form>
  )
}

export function VisitorAccess({
  visitorId,
  links,
  folders,
  defaultCanDownload,
}: {
  visitorId: string
  links: AccessLinkView[]
  folders: FolderOption[]
  defaultCanDownload: boolean
}) {
  const [issueState, issueAction] = useActionState<InviteState, FormData>(
    issueLinkForVisitor,
    INVITE_IDLE,
  )
  const [revokeState, revokeAction] = useActionState<ActionState, FormData>(
    revokeAllLinksForVisitor,
    IDLE,
  )

  const live = links.filter((link) => link.status === 'active' || link.status === 'unopened')

  return (
    <Card>
      <SectionTitle
        aside={
          live.length > 0 ? (
            <form action={revokeAction}>
              <input type="hidden" name="visitorId" value={visitorId} />
              <ConfirmSubmit confirmMessage="Revoke every live link for this visitor? They will be locked out immediately.">
                <Ban size={13} aria-hidden />
                Revoke access
              </ConfirmSubmit>
            </form>
          ) : null
        }
      >
        Access
      </SectionTitle>

      <ActionMessage state={revokeState} className="mb-4" />

      {links.length === 0 ? (
        <Note>
          This person is on the list but has never been issued a link. Nothing below will record
          anything until they have one.
        </Note>
      ) : (
        <ul className="mb-6 flex flex-col">
          {links.map((link) => {
            const copy = STATUS_COPY[link.status]
            const allowed = link.allowedFolderIds.length
              ? folders
                  .filter((folder) => link.allowedFolderIds.includes(folder.id))
                  .map((folder) => displayFolderName(folder.name))
              : null

            return (
              <li
                key={link.id}
                className="flex flex-col gap-2 border-b border-[var(--border-subtle)] py-3.5 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <code className="rounded-[6px] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[0.75rem] text-[var(--text-secondary)]">
                    {link.tokenPreview}…
                  </code>
                  <Chip tone={copy.tone} title={copy.explain}>
                    {copy.label}
                  </Chip>
                  {link.label ? <Chip tone="muted">{link.label}</Chip> : null}
                  {link.status === 'active' || link.status === 'unopened' ? (
                    <LinkDownloadToggle link={link} />
                  ) : (
                    <Chip tone="muted">
                      {link.canDownload ? 'Downloads were on' : 'Downloads were off'}
                    </Chip>
                  )}
                </div>

                <p className="tnum flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
                  <span>
                    Created <RelativeTime value={link.createdAt} />
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {link.expiresAt ? (
                      <>
                        Expires <RelativeTime value={link.expiresAt} />
                      </>
                    ) : (
                      'No expiry'
                    )}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {link.openCount} open{link.openCount === 1 ? '' : 's'}
                  </span>
                  {link.firstOpenedAt ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        First opened <RelativeTime value={link.firstOpenedAt} />
                      </span>
                    </>
                  ) : null}
                  {link.invitedBy ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>by {link.invitedBy}</span>
                    </>
                  ) : null}
                </p>

                <p className="text-[0.75rem] text-[var(--text-muted)]">
                  {allowed
                    ? `Folders: ${allowed.join(', ')}`
                    : 'Folders: everything in the room'}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      <form action={issueAction} className="flex flex-col gap-4">
        <input type="hidden" name="visitorId" value={visitorId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expiry" htmlFor="reissue-expiry">
            <select id="reissue-expiry" name="expiry" defaultValue="30d" className={fieldClass()}>
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col justify-end gap-2.5 pb-1">
            <label className="flex items-center gap-2.5 text-[0.85rem] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                name="canDownload"
                defaultChecked={defaultCanDownload}
                className="h-4 w-4 accent-[var(--color-sahel)]"
              />
              Allow downloads
            </label>
            <label className="flex items-center gap-2.5 text-[0.85rem] text-[var(--text-secondary)]">
              <input type="checkbox" name="sendEmail" className="h-4 w-4 accent-[var(--color-sahel)]" />
              Email the link
            </label>
          </div>
        </div>

        <ActionMessage state={issueState} />

        <div className="flex items-center gap-3">
          <SubmitButton variant="secondary" pendingLabel="Minting…">
            <KeyRound size={14} aria-hidden />
            {links.length ? 'Issue a replacement link' : 'Issue a link'}
          </SubmitButton>
        </div>

        <Note>
          Issuing a link retires every live one this person holds. The folder allow-list carries
          over from the previous link, so re-issuing never widens what they can see.
        </Note>
      </form>

      {issueState.url ? (
        <div className="mt-5">
          <OneTimeLink state={issueState} />
        </div>
      ) : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Details                                                                    */
/* -------------------------------------------------------------------------- */

export function VisitorDetailsForm({
  visitor,
}: {
  visitor: {
    id: string
    email: string
    name: string | null
    organization: string | null
    role: string | null
    notes: string | null
  }
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateVisitor, IDLE)

  return (
    <Card>
      <SectionTitle>Details</SectionTitle>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="visitorId" value={visitor.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="visitor-name">
            <input
              id="visitor-name"
              name="name"
              defaultValue={visitor.name ?? ''}
              className={fieldClass()}
              placeholder="Not recorded"
            />
          </Field>

          <Field
            label="Email"
            htmlFor="visitor-email"
            hint="The address is the visitor’s identity in the room and cannot be edited here. Invite the new address instead."
          >
            <input
              id="visitor-email"
              value={visitor.email}
              readOnly
              disabled
              className={fieldClass('opacity-70')}
            />
          </Field>

          <Field label="Organisation" htmlFor="visitor-org">
            <input
              id="visitor-org"
              name="organization"
              defaultValue={visitor.organization ?? ''}
              className={fieldClass()}
              placeholder="Not recorded"
            />
          </Field>

          <Field label="Role" htmlFor="visitor-role" hint="Free text — “Seed investor”, “Advisor”.">
            <input
              id="visitor-role"
              name="role"
              defaultValue={visitor.role ?? ''}
              className={fieldClass()}
              placeholder="Not recorded"
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="visitor-notes" hint="Private to the console. Visitors never see this.">
          <textarea
            id="visitor-notes"
            name="notes"
            rows={3}
            defaultValue={visitor.notes ?? ''}
            className={fieldClass('resize-y')}
            placeholder="Introduced by…, following up on…"
          />
        </Field>

        <ActionMessage state={state} />

        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            <Save size={14} aria-hidden />
            Save details
          </SubmitButton>
        </div>
      </form>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                     */
/* -------------------------------------------------------------------------- */

export function VisitorDangerZone({ visitorId, email }: { visitorId: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(deleteVisitor, IDLE)

  return (
    <Card className="border-[color-mix(in_oklab,var(--color-kola)_30%,transparent)]">
      <SectionTitle>Delete this visitor</SectionTitle>

      <Note className="mb-4">
        Deleting removes the person, their links, every session, every document view, the per-page
        dwell times and the NDA record. The analytics history goes with them and cannot be
        recovered. Revoking access is almost always the better answer — it locks someone out while
        keeping the record of what they read.
      </Note>

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="visitorId" value={visitorId} />

        <Field
          label="Type the email address to confirm"
          htmlFor="delete-confirm"
          className="flex-1"
        >
          <input
            id="delete-confirm"
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            placeholder={email}
            className={fieldClass('font-mono text-[0.8rem]')}
          />
        </Field>

        <ConfirmSubmit
          size="md"
          confirmMessage={`Permanently delete ${email} and everything recorded about their reading?`}
          className="shrink-0"
        >
          <Trash2 size={14} aria-hidden />
          Delete permanently
        </ConfirmSubmit>
      </form>

      <ActionMessage state={state} className="mt-3" />
    </Card>
  )
}
