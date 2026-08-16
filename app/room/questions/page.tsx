import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { requireVisitor } from '@/lib/auth'
import { getVisitorQuestions, getRoomSettings } from '@/lib/room'
import { AskForm } from './AskForm'

export const dynamic = 'force-dynamic'

export default async function QuestionsPage() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const settings = await getRoomSettings()
  if (!settings.qaEnabled) redirect('/room')

  const threads = await getVisitorQuestions(auth.visitor.id)
  const mine = threads.filter((t) => t.visitorId === auth.visitor.id)
  const shared = threads.filter((t) => t.visitorId !== auth.visitor.id)

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <Link
        href="/room"
        className="mb-9 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--text-primary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={14} />
        All folders
      </Link>

      <p className="label mb-4 flex items-center gap-2.5">
        <span className="sahel-dot" />
        Questions
      </p>
      <h1 className="font-display text-[1.9rem] leading-tight" style={{ color: 'var(--text-primary)' }}>
        Ask us directly
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Anything you cannot find, anything that needs context, anything you want added. Threads stay
        attached to the room so nothing gets lost in email.
      </p>

      <div className="mt-8">
        <AskForm />
      </div>

      {mine.length > 0 && (
        <section className="mt-12">
          <h2 className="label mb-4">Your threads</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((thread) => (
              <li key={thread.id} className="namu-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-[14.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {thread.body}
                  </p>
                  <span
                    className="flex-none rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={
                      thread.status === 'answered'
                        ? {
                            background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
                            color: 'var(--accent)',
                          }
                        : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }
                    }
                  >
                    {thread.status === 'answered' ? 'Answered' : 'Open'}
                  </span>
                </div>

                <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {thread.kind === 'document_request' ? 'Document request' : 'Question'} ·{' '}
                  {formatDistanceToNow(thread.createdAt, { addSuffix: true })}
                </p>

                {thread.answer && (
                  <div
                    className="mt-4 border-l-2 pl-4 text-[14px] leading-relaxed"
                    style={{ borderColor: 'var(--accent)', color: 'var(--text-secondary)' }}
                  >
                    {thread.answer}
                    {thread.answeredAt && (
                      <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        Answered {formatDistanceToNow(thread.answeredAt, { addSuffix: true })}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {shared.length > 0 && (
        <section className="mt-12">
          <h2 className="label mb-2">Answered for everyone</h2>
          <p className="mb-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Questions other readers asked that we published.
          </p>
          <ul className="flex flex-col gap-3">
            {shared.map((thread) => (
              <li key={thread.id} className="namu-card p-5" style={{ boxShadow: 'none' }}>
                <p className="text-[14.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {thread.body}
                </p>
                {thread.answer && (
                  <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {thread.answer}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
