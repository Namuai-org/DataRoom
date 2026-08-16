import { desc, eq } from 'drizzle-orm'
import { formatDistanceToNow } from 'date-fns'
import { db } from '@/lib/db'
import { questions, visitors, documents } from '@/lib/db/schema'
import { requireAdminPage } from '@/app/admin/_lib/guard'
import { AnswerForm } from './AnswerForm'

export const dynamic = 'force-dynamic'

/**
 * Every question an investor has asked from inside the room.
 *
 * Open threads come first: an unanswered diligence question is the cheapest
 * thing in a raise to lose track of, and the most expensive.
 */
export default async function AdminQuestions() {
  await requireAdminPage()

  const rows = await db
    .select({
      question: questions,
      visitorEmail: visitors.email,
      visitorName: visitors.name,
      visitorOrg: visitors.organization,
      documentTitle: documents.title,
    })
    .from(questions)
    .innerJoin(visitors, eq(questions.visitorId, visitors.id))
    .leftJoin(documents, eq(questions.documentId, documents.id))
    .orderBy(desc(questions.createdAt))
    .limit(200)

  const open = rows.filter((r) => r.question.status === 'open')
  const resolved = rows.filter((r) => r.question.status !== 'open')

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-9">
        <p className="label mb-3 flex items-center gap-2.5">
          <span className="sahel-dot" />
          Questions
        </p>
        <h1 className="font-display text-[1.9rem] leading-tight" style={{ color: 'var(--text-primary)' }}>
          What investors are asking
        </h1>
        <p className="mt-3 text-[14.5px]" style={{ color: 'var(--text-secondary)' }}>
          {open.length === 0
            ? 'Nothing waiting on you.'
            : `${open.length} ${open.length === 1 ? 'thread is' : 'threads are'} waiting on you.`}
        </p>
      </header>

      {rows.length === 0 && (
        <div className="namu-card p-10 text-center" style={{ boxShadow: 'none' }}>
          <p className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
            No questions yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
            When a reader asks something from inside the room, it lands here and you get an email.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <h2 className="label mb-4">Open</h2>
          <ul className="flex flex-col gap-3">
            {open.map((row) => (
              <Thread key={row.question.id} row={row} />
            ))}
          </ul>
        </section>
      )}

      {resolved.length > 0 && (
        <section className="mt-12">
          <h2 className="label mb-4">Answered</h2>
          <ul className="flex flex-col gap-3">
            {resolved.map((row) => (
              <Thread key={row.question.id} row={row} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

type Row = {
  question: typeof questions.$inferSelect
  visitorEmail: string
  visitorName: string | null
  visitorOrg: string | null
  documentTitle: string | null
}

function Thread({ row }: { row: Row }) {
  const { question } = row
  const who = row.visitorName ?? row.visitorEmail

  return (
    <li className="namu-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {who}
          {row.visitorOrg && (
            <span style={{ color: 'var(--text-muted)' }}> · {row.visitorOrg}</span>
          )}
        </p>
        <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          {formatDistanceToNow(question.createdAt, { addSuffix: true })}
        </p>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {question.body}
      </p>

      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        <span>{question.kind === 'document_request' ? 'Document request' : 'Question'}</span>
        {row.documentTitle && (
          <>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span>on {row.documentTitle}</span>
          </>
        )}
        {question.isPublic && (
          <>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: 'var(--accent)' }}>Published to the room</span>
          </>
        )}
      </p>

      <AnswerForm
        questionId={question.id}
        existingAnswer={question.answer}
        isPublic={question.isPublic}
      />
    </li>
  )
}
