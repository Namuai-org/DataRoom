'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { answerQuestion } from '@/app/admin/_actions/questions'
import { IDLE, type ActionState } from '@/app/admin/_lib/action-state'

export function AnswerForm({
  questionId,
  existingAnswer,
  isPublic,
}: {
  questionId: string
  existingAnswer: string | null
  isPublic: boolean
}) {
  const [state, action] = useActionState<ActionState, FormData>(answerQuestion, IDLE)

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="questionId" value={questionId} />

      <textarea
        name="answer"
        required
        rows={3}
        defaultValue={existingAnswer ?? ''}
        placeholder="Answer plainly. If the answer is a document, say which one and add it."
        className="resize-y rounded-xl border px-3.5 py-2.5 text-[14px] leading-relaxed outline-none transition-colors duration-300 focus:border-[var(--accent)]"
        style={{
          borderColor: 'var(--border-subtle)',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
        }}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={isPublic}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Publish to everyone in the room
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            name="notify"
            defaultChecked
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Email the reader
        </label>

        <Submit hasAnswer={Boolean(existingAnswer)} />
      </div>

      {state.status !== 'idle' && state.message && (
        <p
          className="text-[12.5px]"
          role={state.status === 'error' ? 'alert' : 'status'}
          style={{ color: state.status === 'error' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}

function Submit({ hasAnswer }: { hasAnswer: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="ml-auto rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
      style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
    >
      {pending ? 'Saving…' : hasAnswer ? 'Update answer' : 'Send answer'}
    </button>
  )
}
