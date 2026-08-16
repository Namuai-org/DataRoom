'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { acceptNda, type NdaState } from './actions'

export function NdaForm({ suggestedName }: { suggestedName: string }) {
  const [state, action] = useActionState<NdaState, FormData>(acceptNda, {})

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="label">Type your full name to sign</span>
        <input
          name="signedName"
          defaultValue={suggestedName}
          required
          autoComplete="name"
          placeholder="Your full name"
          className="rounded-xl border px-4 py-3 text-[15px] outline-none transition-colors duration-300 focus:border-[var(--accent)]"
          style={{
            borderColor: 'var(--border-subtle)',
            background: 'var(--surface-raised)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-playfair)',
          }}
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="agreed"
          required
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
        />
        <span className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          I have read the terms above and accept them on my own behalf and on behalf of the
          organisation I represent.
        </span>
      </label>

      {state.error && (
        <p
          className="rounded-lg px-3 py-2 text-[13px]"
          style={{
            background: 'color-mix(in oklab, var(--accent) 14%, transparent)',
            color: 'var(--text-primary)',
          }}
          role="alert"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Your acceptance is recorded with the date, time, and network address of this device.
      </p>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full px-6 py-3 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
      style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
    >
      {pending ? 'Recording…' : 'Accept and enter the data room'}
    </button>
  )
}
