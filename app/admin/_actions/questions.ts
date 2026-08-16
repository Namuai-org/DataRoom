'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { questions, visitors } from '@/lib/db/schema'
import { requireAdminAction } from '@/app/admin/_lib/guard'
import { recordEvent } from '@/lib/analytics'
import { notifyAnswer } from '@/lib/notify'
import { fail, ok, fromError, type ActionState } from '@/app/admin/_lib/action-state'

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(2, 'Write an answer before sending it.').max(8000),
  isPublic: z.boolean(),
  notify: z.boolean(),
})

/** Answers a thread and, unless told otherwise, emails the person who asked. */
export async function answerQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()

    const parsed = answerSchema.safeParse({
      questionId: formData.get('questionId'),
      answer: formData.get('answer'),
      isPublic: formData.get('isPublic') === 'on',
      notify: formData.get('notify') === 'on',
    })
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Check the answer and try again.')
    }

    const rows = await db
      .select({ question: questions, visitor: visitors })
      .from(questions)
      .innerJoin(visitors, eq(questions.visitorId, visitors.id))
      .where(eq(questions.id, parsed.data.questionId))
      .limit(1)

    const row = rows[0]
    if (!row) return fail('That question no longer exists.')

    await db
      .update(questions)
      .set({
        answer: parsed.data.answer,
        answeredBy: admin.email,
        answeredAt: new Date(),
        status: 'answered',
        isPublic: parsed.data.isPublic,
      })
      .where(eq(questions.id, parsed.data.questionId))

    await recordEvent({
      type: 'settings_changed',
      actor: 'admin',
      visitorId: row.visitor.id,
      documentId: row.question.documentId,
      label: 'question answered',
      metadata: { questionId: parsed.data.questionId, published: parsed.data.isPublic },
    })

    if (parsed.data.notify) {
      void notifyAnswer({
        to: row.visitor.email,
        name: row.visitor.name,
        question: row.question.body,
        answer: parsed.data.answer,
      })
    }

    revalidatePath('/admin/questions')
    revalidatePath('/room/questions')
    return ok(
      parsed.data.notify
        ? 'Answered. The reader has been emailed.'
        : 'Answered. No email was sent.',
    )
  } catch (error) {
    return fromError(error, 'Could not save that answer.')
  }
}

/** Closes a thread without answering it. */
export async function closeQuestion(questionId: string): Promise<void> {
  await requireAdminAction()
  if (!z.string().uuid().safeParse(questionId).success) return

  await db.update(questions).set({ status: 'closed' }).where(eq(questions.id, questionId))
  revalidatePath('/admin/questions')
  revalidatePath('/room/questions')
}

/** Publishes or unpublishes an answer to every reader in the room. */
export async function toggleQuestionVisibility(
  questionId: string,
  isPublic: boolean,
): Promise<void> {
  await requireAdminAction()
  if (!z.string().uuid().safeParse(questionId).success) return

  await db.update(questions).set({ isPublic }).where(eq(questions.id, questionId))
  revalidatePath('/admin/questions')
  revalidatePath('/room/questions')
}
