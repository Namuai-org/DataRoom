'use server'

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ndaAcceptances } from '@/lib/db/schema'
import { requireVisitor, getRequestContext } from '@/lib/auth'
import { getRoomSettings } from '@/lib/room'
import { recordEvent } from '@/lib/analytics'

const schema = z.object({
  signedName: z.string().trim().min(2, 'Please type your full name.').max(120),
  agreed: z.literal('on', { message: 'You must accept the terms to continue.' }),
})

export type NdaState = { error?: string }

export async function acceptNda(_prev: NdaState, formData: FormData): Promise<NdaState> {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const parsed = schema.safeParse({
    signedName: formData.get('signedName'),
    agreed: formData.get('agreed'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }

  const settings = await getRoomSettings()
  const ctx = await getRequestContext()

  // The exact text shown at the moment of signing is hashed into the record, so
  // the acceptance still proves what was agreed to even after the NDA copy is
  // later revised.
  const textHash = createHash('sha256').update(settings.ndaText).digest('hex')

  await db.insert(ndaAcceptances).values({
    visitorId: auth.visitor.id,
    accessLinkId: auth.link.id,
    ndaVersion: settings.ndaVersion,
    ndaTextHash: textHash,
    signedName: parsed.data.signedName,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    country: ctx.country,
  })

  await recordEvent({
    type: 'nda_accepted',
    sessionId: auth.session.sessionId,
    visitorId: auth.visitor.id,
    label: settings.ndaVersion,
    ip: ctx.ip,
    country: ctx.country,
    metadata: { signedName: parsed.data.signedName, textHash },
  })

  redirect('/room')
}
