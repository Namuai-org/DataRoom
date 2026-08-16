'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { ArrowLeft, KeyRound, TerminalSquare } from 'lucide-react'
import { requestAdminCode, verifyAdminCode } from '@/app/admin/_actions/auth'
import {
  REQUEST_CODE_IDLE,
  VERIFY_CODE_IDLE,
  type RequestCodeState,
  type VerifyCodeState,
} from '@/app/admin/_lib/action-state'
import { ActionMessage } from './ActionMessage'
import { SubmitButton } from './SubmitButton'
import { buttonClass, fieldClass, Note } from './ui'

/**
 * Two steps, one component.
 *
 * Step one always reports the same thing whether or not the address belongs to
 * an administrator, so the form cannot be used to enumerate who has access.
 * Step two is where a wrong answer is actually a wrong answer.
 */
export function AdminLoginForm({ mailConfigured }: { mailConfigured: boolean }) {
  const [requestState, requestAction] = useActionState<RequestCodeState, FormData>(
    requestAdminCode,
    { ...REQUEST_CODE_IDLE, mailConfigured },
  )
  const [verifyState, verifyAction] = useActionState<VerifyCodeState, FormData>(
    verifyAdminCode,
    VERIFY_CODE_IDLE,
  )

  const [restart, setRestart] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  const onCodeStep = requestState.sent && !restart

  useEffect(() => {
    if (onCodeStep) codeRef.current?.focus()
  }, [onCodeStep])

  if (!onCodeStep) {
    return (
      <form action={requestAction} className="flex flex-col gap-5" key="request">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="admin-email" className="label">
            Email address
          </label>
          <input
            id="admin-email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            spellCheck={false}
            defaultValue={requestState.email}
            placeholder="you@company.com"
            className={fieldClass()}
          />
        </div>

        <ActionMessage state={requestState} />

        <SubmitButton pendingLabel="Sending…" className="w-full">
          Send me a code
        </SubmitButton>

        <Note>
          There is no password. A six-digit code goes to your address and works once, for ten
          minutes.
        </Note>

        {!mailConfigured ? <MailNotConfiguredNote /> : null}
      </form>
    )
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-5" key="verify">
      <input type="hidden" name="email" value={requestState.email} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-code" className="label">
          Six-digit code
        </label>
        <input
          id="admin-code"
          ref={codeRef}
          name="code"
          type="text"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="000000"
          aria-describedby="admin-code-hint"
          className={fieldClass('text-center font-mono text-[1.4rem] tracking-[0.4em]')}
        />
        <p id="admin-code-hint" className="text-[0.8rem] leading-relaxed text-[var(--text-muted)]">
          Sent to <span className="text-[var(--text-secondary)]">{requestState.email}</span>.
        </p>
      </div>

      <ActionMessage state={requestState} />
      <ActionMessage state={verifyState} />

      <SubmitButton pendingLabel="Checking…" className="w-full">
        <KeyRound size={15} aria-hidden />
        Sign in
      </SubmitButton>

      <button
        type="button"
        onClick={() => setRestart(true)}
        className={buttonClass('ghost', 'sm', 'self-start')}
      >
        <ArrowLeft size={14} aria-hidden />
        Use a different address
      </button>

      {!requestState.mailConfigured ? <MailNotConfiguredNote /> : null}
    </form>
  )
}

function MailNotConfiguredNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-[9px] bg-[var(--surface-sunken)] px-3.5 py-3">
      <TerminalSquare size={15} aria-hidden className="mt-[2px] shrink-0 text-[var(--text-muted)]" />
      <p className="text-[0.8rem] leading-relaxed text-[var(--text-secondary)]">
        Email is not configured — <span className="font-mono text-[0.75rem]">RESEND_API_KEY</span>{' '}
        is unset. The code was printed to the server console instead. Look for a line beginning{' '}
        <span className="font-mono text-[0.75rem]">[admin login code for …]</span>.
      </p>
    </div>
  )
}
