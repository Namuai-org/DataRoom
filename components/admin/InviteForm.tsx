'use client'

import { useActionState, useState } from 'react'
import { Send, TerminalSquare } from 'lucide-react'
import { createInvite } from '@/app/admin/_actions/invites'
import { INVITE_IDLE, type InviteState } from '@/app/admin/_lib/action-state'
import { EXPIRY_CHOICES } from '@/app/admin/_lib/expiry'
import { TIERS, TIER_LABELS, TIER_DESCRIPTIONS, type Tier } from '@/lib/db/schema'
import type { FolderOption } from '@/app/admin/_lib/view-types'
import { displayFolderName, folderIndex } from '@/lib/brand'
import { ActionMessage } from './ActionMessage'
import { OneTimeLink } from './OneTimeLink'
import { SubmitButton } from './SubmitButton'
import { Card, Field, fieldClass, Note, SectionTitle } from './ui'

/**
 * Creating an invite. The link is returned by the action and rendered once, in
 * <OneTimeLink /> — this is the only moment it exists in the console, because
 * only its hash is stored.
 */
export function InviteForm({
  folders,
  mailConfigured,
  defaultCanDownload,
  appUrlConfigured,
}: {
  folders: FolderOption[]
  mailConfigured: boolean
  defaultCanDownload: boolean
  appUrlConfigured: boolean
}) {
  const [state, action] = useActionState<InviteState, FormData>(createInvite, INVITE_IDLE)
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  // Widest by default, so an invite never silently withholds a folder you
  // meant to share. Narrow it deliberately for a first conversation.
  const [tier, setTier] = useState<Tier>('confirmatory')

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle>Invite someone</SectionTitle>

        <form action={action} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Email"
              htmlFor="invite-email"
              hint="This is their identity in the room. Inviting an address that already exists issues them an additional link."
            >
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="partner@fund.com"
                className={fieldClass()}
              />
            </Field>

            <Field label="Name" htmlFor="invite-name">
              <input
                id="invite-name"
                name="name"
                maxLength={120}
                placeholder="Amina Diallo"
                className={fieldClass()}
              />
            </Field>

            <Field label="Organisation" htmlFor="invite-org">
              <input
                id="invite-org"
                name="organization"
                maxLength={160}
                placeholder="Sahel Ventures"
                className={fieldClass()}
              />
            </Field>

            <Field label="Role" htmlFor="invite-role" hint="Free text — how you think of them.">
              <input
                id="invite-role"
                name="role"
                maxLength={80}
                placeholder="Seed investor"
                className={fieldClass()}
              />
            </Field>

            <Field
              label="Expiry"
              htmlFor="invite-expiry"
              hint="After this the link stops working. It can be re-issued at any time."
            >
              <select
                id="invite-expiry"
                name="expiry"
                defaultValue="30d"
                className={fieldClass()}
              >
                {EXPIRY_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Disclosure stage"
              htmlFor="invite-tier"
              hint={TIER_DESCRIPTIONS[tier]}
            >
              <select
                id="invite-tier"
                name="tier"
                value={tier}
                onChange={(event) => setTier(event.target.value as Tier)}
                className={fieldClass()}
              >
                {TIERS.map((value) => (
                  <option key={value} value={value}>
                    {TIER_LABELS[value]}
                    {value === 'confirmatory' ? ' — everything' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Internal label"
              htmlFor="invite-label"
              hint="Only you see this. Useful when one person holds several links."
            >
              <input
                id="invite-label"
                name="label"
                maxLength={120}
                placeholder="Series A — first round"
                className={fieldClass()}
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="label mb-1">Folder access</legend>

            <label className="flex items-start gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
              <input
                type="radio"
                name="folderAccess"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-[3px] h-4 w-4 accent-[var(--color-sahel)]"
              />
              <span>
                Everything in the room
                <span className="block text-[0.78rem] text-[var(--text-muted)]">
                  Including folders added later.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
              <input
                type="radio"
                name="folderAccess"
                value="selected"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
                className="mt-[3px] h-4 w-4 accent-[var(--color-sahel)]"
              />
              <span>
                Only the folders I choose
                <span className="block text-[0.78rem] text-[var(--text-muted)]">
                  Anything not ticked is invisible to them, not merely locked.
                </span>
              </span>
            </label>

            {scope === 'selected' ? (
              folders.length === 0 ? (
                <Note className="pl-7">
                  There are no folders yet, so there is nothing to choose. Add folders on the
                  documents page first.
                </Note>
              ) : (
                <div className="ml-7 grid gap-2 rounded-[10px] bg-[var(--surface-sunken)] p-4 sm:grid-cols-2">
                  {folders.map((folder) => (
                    <label
                      key={folder.id}
                      className="flex items-center gap-2.5 text-[0.85rem] text-[var(--text-secondary)]"
                    >
                      <input
                        type="checkbox"
                        name="folderIds"
                        value={folder.id}
                        className="h-4 w-4 accent-[var(--color-sahel)]"
                      />
                      <span className="min-w-0 truncate">
                        {folderIndex(folder.name) ? (
                          <span className="tnum mr-1.5 text-[var(--text-muted)]">
                            {folderIndex(folder.name)}
                          </span>
                        ) : null}
                        {displayFolderName(folder.name)}
                        <span className="tnum ml-1.5 text-[0.75rem] text-[var(--text-muted)]">
                          {folder.documentCount}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                name="canDownload"
                defaultChecked={defaultCanDownload}
                className="h-4 w-4 accent-[var(--color-sahel)]"
              />
              Allow downloads
            </label>

            <label className="flex items-center gap-2.5 text-[0.875rem] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                name="sendEmail"
                defaultChecked={mailConfigured}
                disabled={!mailConfigured}
                className="h-4 w-4 accent-[var(--color-sahel)] disabled:opacity-40"
              />
              Email the link to them
            </label>
          </div>

          <ActionMessage state={state} />

          <div>
            <SubmitButton pendingLabel="Creating…">
              <Send size={14} aria-hidden />
              Create invite
            </SubmitButton>
          </div>

          {!mailConfigured ? (
            <div className="flex items-start gap-2.5 rounded-[9px] bg-[var(--surface-sunken)] px-3.5 py-3">
              <TerminalSquare
                size={15}
                aria-hidden
                className="mt-[2px] shrink-0 text-[var(--text-muted)]"
              />
              <p className="text-[0.8rem] leading-relaxed text-[var(--text-secondary)]">
                Email is not configured, so the link cannot be sent from here. The invite still
                works — it appears below with a copy button, and you can send it however you like.
                Set <span className="font-mono text-[0.75rem]">RESEND_API_KEY</span> and{' '}
                <span className="font-mono text-[0.75rem]">EMAIL_FROM</span> to enable sending.
              </p>
            </div>
          ) : null}

          {!appUrlConfigured ? (
            <Note>
              <span className="font-mono text-[0.72rem]">NEXT_PUBLIC_APP_URL</span> is not set, so
              links are built from the address you are browsing right now. Set it before sending an
              invite from a preview deployment, or the link will die with that deployment.
            </Note>
          ) : null}
        </form>
      </Card>

      <OneTimeLink state={state} />
    </div>
  )
}
