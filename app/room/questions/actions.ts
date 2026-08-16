'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { questions, documents, folders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { canSeeDocument, requireVisitor } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { notifyQuestion } from '@/lib/notify'
import { isUuid } from '@/lib/room'

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(5, 'Please write a little more so we can answer properly.')
    .max(4000, 'That is longer than we can accept — please shorten it.'),
  kind: z.enum(['question', 'document_request']).default('question'),
  documentId: z.string().optional(),
})

export type AskState = { error?: string; success?: boolean }

export async function askQuestion(_prev: AskState, formData: FormData): Promise<AskState> {
  const auth = await requireVisitor()
  if (!auth) return { error: 'Your access has expired. Reopen your invite link.' }

  const parsed = schema.safeParse({
    body: formData.get('body'),
    kind: formData.get('kind') ?? 'question',
    documentId: formData.get('documentId') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check what you wrote.' }
  }

  // A document id arriving from a form is untrusted: confirm it exists *and*
  // that this link may see it before attaching it, so a thread cannot be
  // pinned to material the room has never released to the person asking.
  let documentId: string | null = null
  let documentTitle: string | null = null
  if (parsed.data.documentId && isUuid(parsed.data.documentId)) {
    const [row] = await db
      .select({ doc: documents, folder: folders })
      .from(documents)
      .innerJoin(folders, eq(documents.folderId, folders.id))
      .where(eq(documents.id, parsed.data.documentId))
      .limit(1)
    if (row && canSeeDocument(auth.link, row.doc, row.folder)) {
      documentId = row.doc.id
      documentTitle = row.doc.title
    }
  }

  await db.insert(questions).values({
    visitorId: auth.visitor.id,
    documentId,
    kind: parsed.data.kind,
    body: parsed.data.body,
  })

  await recordEvent({
    type: 'search',
    sessionId: auth.session.sessionId,
    visitorId: auth.visitor.id,
    documentId,
    label: parsed.data.kind === 'document_request' ? 'document requested' : 'question asked',
    metadata: { body: parsed.data.body.slice(0, 500) },
  })

  void notifyQuestion({
    visitorName: auth.visitor.name,
    visitorEmail: auth.visitor.email,
    body: parsed.data.body,
    documentTitle,
  })

  revalidatePath('/room/questions')
  return { success: true }
}
