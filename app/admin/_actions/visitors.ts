'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, accessLinks, visitors } from '@/lib/db'
import { generateToken, hashToken } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { requireAdminAction } from '../_lib/guard'
import { buildInviteUrl, expiryFromChoice, EXPIRY_CHOICES } from '../_lib/links'
import { isMailConfigured, sendInviteEmail } from '../_lib/mail'
import { readSettings } from '../_lib/settings'
import { fail, fromError, type ActionState, type InviteState } from '../_lib/action-state'

const expiryValues = EXPIRY_CHOICES.map((c) => c.value)

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name)
  return value === 'on' || value === 'true' || value === '1'
}

function nullable(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim()
  return value === '' ? null : value
}

/* -------------------------------------------------------------------------- */
/*  Edit details                                                               */
/* -------------------------------------------------------------------------- */

const detailsSchema = z.object({
  visitorId: z.uuid(),
  name: z.string().trim().max(120).nullable(),
  organization: z.string().trim().max(160).nullable(),
  role: z.string().trim().max(80).nullable(),
  notes: z.string().trim().max(4000).nullable(),
})

export async function updateVisitor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()

    const parsed = detailsSchema.safeParse({
      visitorId: String(formData.get('visitorId') ?? ''),
      name: nullable(formData, 'name'),
      organization: nullable(formData, 'organization'),
      role: nullable(formData, 'role'),
      notes: nullable(formData, 'notes'),
    })

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Check the details and try again.')
    }

    const { visitorId, ...fields } = parsed.data
    const updated = await db
      .update(visitors)
      .set(fields)
      .where(eq(visitors.id, visitorId))
      .returning({ id: visitors.id })

    if (updated.length === 0) return fail('That visitor no longer exists.')

    revalidatePath('/admin/visitors')
    revalidatePath(`/admin/visitors/${visitorId}`)
    return { status: 'success', message: 'Details saved.' }
  } catch (error) {
    console.error('[admin] updateVisitor failed', error)
    return fromError(error, 'Could not save those details.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Issue a fresh link for an existing visitor                                 */
/* -------------------------------------------------------------------------- */

const issueSchema = z.object({
  visitorId: z.uuid(),
  expiry: z.enum(expiryValues as [string, ...string[]]),
  canDownload: z.boolean(),
  sendEmail: z.boolean(),
})

/**
 * Retires every live link this visitor holds and mints one new one. The raw
 * token is returned here and nowhere else — there is no second chance to read
 * it, because only its hash is stored.
 */
export async function issueLinkForVisitor(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const mailConfigured = isMailConfigured()
  const empty = { url: null, visitorLabel: null, emailed: false, mailConfigured }

  try {
    const admin = await requireAdminAction()

    const parsed = issueSchema.safeParse({
      visitorId: String(formData.get('visitorId') ?? ''),
      expiry: String(formData.get('expiry') ?? 'never'),
      canDownload: checkbox(formData, 'canDownload'),
      sendEmail: checkbox(formData, 'sendEmail'),
    })

    if (!parsed.success) {
      return { ...fail(parsed.error.issues[0]?.message ?? 'Check the form.'), ...empty }
    }

    const { visitorId, expiry, canDownload, sendEmail } = parsed.data

    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId)).limit(1)
    if (!visitor) return { ...fail('That visitor no longer exists.'), ...empty }

    // Carry the previous folder allow-list and disclosure stage forward so
    // re-issuing a link does not silently widen what someone can see. Newest
    // first: an unordered read could pick up a retired link's wider settings.
    const [previous] = await db
      .select({
        allowedFolderIds: accessLinks.allowedFolderIds,
        label: accessLinks.label,
        tier: accessLinks.tier,
      })
      .from(accessLinks)
      .where(eq(accessLinks.visitorId, visitorId))
      .orderBy(desc(accessLinks.createdAt))
      .limit(1)

    await db
      .update(accessLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessLinks.visitorId, visitorId), isNull(accessLinks.revokedAt)))

    const token = generateToken()
    const expiresAt = expiryFromChoice(expiry as (typeof expiryValues)[number])

    await db.insert(accessLinks).values({
      visitorId,
      tokenHash: hashToken(token),
      tokenPreview: token.slice(0, 8),
      label: previous?.label ?? null,
      expiresAt,
      canDownload,
      // Without this the column default ('confirmatory') would apply, quietly
      // promoting a narrowed link to the widest disclosure stage.
      ...(previous?.tier ? { tier: previous.tier } : {}),
      allowedFolderIds: previous?.allowedFolderIds ?? [],
      invitedBy: admin.email,
    })

    const url = await buildInviteUrl(token)
    const who = visitor.name?.trim() || visitor.email

    await recordEvent({
      type: 'invite_created',
      actor: 'admin',
      visitorId,
      label: who,
      metadata: { reissued: true, by: admin.email },
    })

    let emailed = false
    if (sendEmail) {
      const settings = await readSettings()
      const result = await sendInviteEmail({
        to: visitor.email,
        name: visitor.name,
        url,
        roomTitle: settings.roomTitle,
        welcome: settings.welcomeMessage,
        expiresAt,
      })
      emailed = result.delivered
      if (emailed) {
        await db
          .update(accessLinks)
          .set({ sentAt: new Date() })
          .where(eq(accessLinks.tokenHash, hashToken(token)))
        await recordEvent({ type: 'invite_sent', actor: 'admin', visitorId, label: who })
      }
    }

    revalidatePath('/admin/invites')
    revalidatePath('/admin/visitors')
    revalidatePath(`/admin/visitors/${visitorId}`)

    return {
      status: 'success',
      message: emailed
        ? `A new link was emailed to ${visitor.email}. Any earlier link is dead.`
        : 'New link ready. Any earlier link is dead — copy this one now.',
      url,
      visitorLabel: who,
      emailed,
      mailConfigured,
    }
  } catch (error) {
    console.error('[admin] issueLinkForVisitor failed', error)
    return { ...fromError(error, 'Could not issue a link.'), ...empty }
  }
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Removes the visitor and, by cascade, their links, sessions, document views,
 * page dwell records and NDA acceptances. This is destructive and unrecoverable
 * — the analytics history goes with them. Revoking is almost always the better
 * answer, which is why the UI asks for the email address to be typed out.
 */
export async function deleteVisitor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let deleted = false

  try {
    const admin = await requireAdminAction()
    const visitorId = z.uuid().parse(String(formData.get('visitorId') ?? ''))
    const confirmation = String(formData.get('confirm') ?? '')
      .trim()
      .toLowerCase()

    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId)).limit(1)
    if (!visitor) return fail('That visitor no longer exists.')

    if (confirmation !== visitor.email.toLowerCase()) {
      return fail('Type the visitor’s email address exactly to confirm the deletion.')
    }

    await db.delete(visitors).where(eq(visitors.id, visitorId))

    await recordEvent({
      type: 'invite_revoked',
      actor: 'admin',
      label: visitor.email,
      metadata: { reason: 'visitor deleted', by: admin.email },
    })

    revalidatePath('/admin/visitors')
    revalidatePath('/admin/invites')
    revalidatePath('/admin')
    deleted = true
  } catch (error) {
    console.error('[admin] deleteVisitor failed', error)
    return fromError(error, 'Could not delete that visitor.')
  }

  if (deleted) redirect('/admin/visitors')
  return fail('Deletion did not complete.')
}
