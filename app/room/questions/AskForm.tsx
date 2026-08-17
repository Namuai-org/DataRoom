'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { askQuestion, type AskState } from './actions'

export function AskForm({ documentId }: { documentId?: string }) {
  const [state, action] = useActionState<AskState, FormData>(askQuestion, {})
  const [kind, setKind] = useState<'question' | 'document_request'>('question')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form ref={formRef} action={action} className="namu-card flex flex-col gap-4 p-5 sm:p-6">
      <input type="hidden" name="kind" value={kind} />
      {documentId && <input type="hidden" name="documentId" value={documentId} />}

      <div className="flex gap-1.5" role="group" aria-label="What are you sending?">
        {(
          [
            ['question', 'Ask a question'],
            ['document_request', 'Request a document'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-300"
            style={
              kind === value
                ? { background: 'var(--text-primary)', color: 'var(--surface)' }
                : { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        name="body"
        required
        rows={4}
        placeholder={
          kind === 'question'
            ? 'What would you like to know?'
            : 'What document would you like us to add?'
        }
        className="resize-y rounded-xl border px-4 py-3 text-[14.5px] leading-relaxed outline-none transition-colors duration-300 focus:border-[var(--border-strong)]"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
        }}
      />

      {state.error && (
        <p className="text-[13px]" role="alert" style={{ color: 'var(--tag)' }}>
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-[13px]" role="status" style={{ color: 'var(--text-secondary)' }}>
          Sent. We will answer here, and you will get an email when we do.
        </p>
      )}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full px-5 py-2.5 text-[13px] font-medium transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
      style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
    >
      {pending ? 'Sending…' : 'Send'}
    </button>
  )
}
