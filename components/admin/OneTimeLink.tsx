'use client'

import { KeyRound } from 'lucide-react'
import type { InviteState } from '@/app/admin/_lib/action-state'
import { CopyField } from './CopyButton'
import { Note } from './ui'

/**
 * The one place a raw access token is ever shown.
 *
 * `accessLinks` stores a SHA-256 hash and the first eight characters, and
 * nothing else, so this panel is the only moment the full link exists outside
 * the invitee's inbox. The warning is blunt on purpose: there is no "show it
 * again" anywhere in this console, because there is nothing left to show.
 */
export function OneTimeLink({ state }: { state: InviteState }) {
  if (state.status !== 'success' || !state.url) return null

  return (
    <div
      className="namu-card border-l-2 p-5"
      style={{ borderLeftColor: 'var(--color-sahel)' }}
      role="status"
      aria-live="polite"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <KeyRound size={16} aria-hidden className="mt-[2px] shrink-0 text-[var(--color-kola)]" />
        <div>
          <p className="text-[0.9rem] font-medium text-[var(--text-primary)]">
            Copy this link now — it cannot be shown again
          </p>
          <Note className="mt-1">
            Only a hash of it is stored. Close this panel and the link is unrecoverable; the only
            way back is to mint a new one, which retires this one.
            {state.emailed
              ? ' A copy has also been emailed.'
              : state.mailConfigured
                ? ''
                : ' Email is not configured, so it was not sent — hand it over yourself.'}
          </Note>
        </div>
      </div>

      <CopyField
        value={state.url}
        label={`Access link${state.visitorLabel ? ` for ${state.visitorLabel}` : ''}`}
      />
    </div>
  )
}
