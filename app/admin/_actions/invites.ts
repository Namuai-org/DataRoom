'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, accessLinks, visitors } from '@/lib/db'
import { TIERS } from '@/lib/db/schema'
import { generateToken, hashToken } from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { requireAdminAction } from '../_lib/guard'
import { buildInviteUrl, expiryFromChoice, EXPIRY_CHOICES } from '../_lib/links'
import { isMailConfigured, sendInviteEmail } from '../_lib/mail'
import { readSettings } from '../_lib/settings'
import { fail, fromError, type ActionState, type InviteState } from '../_lib/action-state'

/**
 * Invite lifecycle.
 *
 * The raw token exists exactly once, in the return value of the action that
 * minted it. `accessLinks` stores only a SHA-256 hash plus the first eight
 * characters, so there is no way to re-display a link later — which is why the
 * "resend" control mints a fresh link and retires the old one rather than
 * pretending to recover the original.
 */

const expiryValues = EXPIRY_CHOICES.map((c) => c.value)

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  name: z.string().trim().max(120).optional(),
  organization: z.string().trim().max(160).optional(),
  role: z.string().trim().max(80).optional(),
  label: z.string().trim().max(120).optional(),
  expiry: z.enum(expiryValues as [string, ...string[]]),
  canDownload: z.boolean(),
  // Disclosure stage. Defaults to the widest tier: staging is something you opt
  // an investor into, not something that quietly hides folders from everyone.
  tier: z.enum(TIERS).default('confirmatory'),
  folderAccess: z.enum(['all', 'selected']),
  folderIds: z.array(z.uuid()),
  sendEmail: z.boolean(),
})

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name)
  return value === 'on' || value === 'true' || value === '1'
}

function optional(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim()
  return value === '' ? undefined : value
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const mailConfigured = isMailConfigured()

  try {
    const admin = await requireAdminAction()

    const parsed = inviteSchema.safeParse({
      email: String(formData.get('email') ?? '')
        .trim()
        .toLowerCase(),
      name: optional(formData, 'name'),
      organization: optional(formData, 'organization'),
      role: optional(formData, 'role'),
      label: optional(formData, 'label'),
      expiry: String(formData.get('expiry') ?? 'never'),
      canDownload: checkbox(formData, 'canDownload'),
      tier: String(formData.get('tier') ?? 'confirmatory'),
      folderAccess: String(formData.get('folderAccess') ?? 'all'),
      folderIds: formData.getAll('folderIds').map((v) => String(v)),
      sendEmail: checkbox(formData, 'sendEmail'),
    })

    if (!parsed.success) {
      return {
        ...fail(parsed.error.issues[0]?.message ?? 'Check the form and try again.'),
        url: null,
        visitorLabel: null,
        emailed: false,
        mailConfigured,
      }
    }

    const input = parsed.data

    if (input.folderAccess === 'selected' && input.folderIds.length === 0) {
      return {
        ...fail('Choose at least one folder, or give access to everything.'),
        url: null,
        visitorLabel: null,
        emailed: false,
        mailConfigured,
      }
    }

    // Upsert the visitor by email. Existing details are only overwritten by
    // values the form actually supplied — an empty field must not erase a name
    // someone typed in earlier.
    const [existing] = await db
      .select()
      .from(visitors)
      .where(sql`LOWER(${visitors.email}) = ${input.email}`)
      .limit(1)

    let visitorId: string
    if (existing) {
      visitorId = existing.id
      await db
        .update(visitors)
        .set({
          name: input.name ?? existing.name,
          organization: input.organization ?? existing.organization,
          role: input.role ?? existing.role,
        })
        .where(eq(visitors.id, existing.id))
    } else {
      const [created] = await db
        .insert(visitors)
        .values({
          email: input.email,
          name: input.name ?? null,
          organization: input.organization ?? null,
          role: input.role ?? null,
        })
        .returning({ id: visitors.id })
      if (!created) throw new Error('Could not create that visitor.')
      visitorId = created.id
    }

    const token = generateToken()
    const expiresAt = expiryFromChoice(input.expiry as (typeof expiryValues)[number])

    await db.insert(accessLinks).values({
      visitorId,
      tokenHash: hashToken(token),
      tokenPreview: token.slice(0, 8),
      label: input.label ?? null,
      expiresAt,
      canDownload: input.canDownload,
      tier: input.tier,
      allowedFolderIds: input.folderAccess === 'all' ? [] : input.folderIds,
      invitedBy: admin.email,
    })

    const url = await buildInviteUrl(token)
    const who = input.name?.trim() || input.email

    await recordEvent({
      type: 'invite_created',
      actor: 'admin',
      visitorId,
      label: who,
      metadata: {
        expiry: input.expiry,
        canDownload: input.canDownload,
        folders: input.folderAccess === 'all' ? 'all' : input.folderIds.length,
        by: admin.email,
      },
    })

    let emailed = false
    if (input.sendEmail) {
      const settings = await readSettings()
      const result = await sendInviteEmail({
        to: input.email,
        name: input.name ?? null,
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
    revalidatePath('/admin')

    return {
      status: 'success',
      message: emailed
        ? `Invite created and emailed to ${input.email}.`
        : `Invite created for ${input.email}.`,
      url,
      visitorLabel: who,
      emailed,
      mailConfigured,
    }
  } catch (error) {
    console.error('[admin] createInvite failed', error)
    return {
      ...fromError(error, 'Could not create that invite.'),
      url: null,
      visitorLabel: null,
      emailed: false,
      mailConfigured,
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Revoke                                                                     */
/* -------------------------------------------------------------------------- */

export async function revokeInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()
    const linkId = z.uuid().parse(String(formData.get('linkId') ?? ''))

    const [link] = await db
      .select({ id: accessLinks.id, visitorId: accessLinks.visitorId, email: visitors.email })
      .from(accessLinks)
      .innerJoin(visitors, eq(accessLinks.visitorId, visitors.id))
      .where(eq(accessLinks.id, linkId))
      .limit(1)

    if (!link) return fail('That invite no longer exists.')

    await db.update(accessLinks).set({ revokedAt: new Date() }).where(eq(accessLinks.id, linkId))

    await recordEvent({
      type: 'invite_revoked',
      actor: 'admin',
      visitorId: link.visitorId,
      label: link.email,
      metadata: { by: admin.email },
    })

    revalidatePath('/admin/invites')
    revalidatePath('/admin/visitors')
    revalidatePath(`/admin/visitors/${link.visitorId}`)

    return { status: 'success', message: `Access revoked for ${link.email}.` }
  } catch (error) {
    console.error('[admin] revokeInvite failed', error)
    return fromError(error, 'Could not revoke that invite.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Regenerate — the only honest form of "resend"                              */
/* -------------------------------------------------------------------------- */

export async function regenerateInvite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const mailConfigured = isMailConfigured()
  const empty = { url: null, visitorLabel: null, emailed: false, mailConfigured }

  try {
    const admin = await requireAdminAction()
    const linkId = z.uuid().parse(String(formData.get('linkId') ?? ''))
    const send = checkbox(formData, 'sendEmail')

    const [row] = await db
      .select({ link: accessLinks, visitor: visitors })
      .from(accessLinks)
      .innerJoin(visitors, eq(accessLinks.visitorId, visitors.id))
      .where(eq(accessLinks.id, linkId))
      .limit(1)

    if (!row) return { ...fail('That invite no longer exists.'), ...empty }

    const token = generateToken()
    const now = new Date()

    await db.update(accessLinks).set({ revokedAt: now }).where(eq(accessLinks.id, linkId))

    await db.insert(accessLinks).values({
      visitorId: row.link.visitorId,
      tokenHash: hashToken(token),
      tokenPreview: token.slice(0, 8),
      label: row.link.label,
      expiresAt: row.link.expiresAt,
      canDownload: row.link.canDownload,
      // Carry the disclosure stage forward as well as the folder allow-list.
      // Omitting it would fall back to the column default — the widest tier —
      // and silently promote a teaser reader to confirmatory material.
      tier: row.link.tier,
      allowedFolderIds: row.link.allowedFolderIds,
      invitedBy: admin.email,
    })

    const url = await buildInviteUrl(token)
    const who = row.visitor.name?.trim() || row.visitor.email

    await recordEvent({
      type: 'invite_revoked',
      actor: 'admin',
      visitorId: row.link.visitorId,
      label: row.visitor.email,
      metadata: { reason: 'replaced by a new link', by: admin.email },
    })
    await recordEvent({
      type: 'invite_created',
      actor: 'admin',
      visitorId: row.link.visitorId,
      label: who,
      metadata: { replaced: row.link.tokenPreview, by: admin.email },
    })

    let emailed = false
    if (send) {
      const settings = await readSettings()
      const result = await sendInviteEmail({
        to: row.visitor.email,
        name: row.visitor.name,
        url,
        roomTitle: settings.roomTitle,
        welcome: settings.welcomeMessage,
        expiresAt: row.link.expiresAt,
      })
      emailed = result.delivered
      if (emailed) {
        await db
          .update(accessLinks)
          .set({ sentAt: new Date() })
          .where(eq(accessLinks.tokenHash, hashToken(token)))
        await recordEvent({
          type: 'invite_sent',
          actor: 'admin',
          visitorId: row.link.visitorId,
          label: who,
        })
      }
    }

    revalidatePath('/admin/invites')
    revalidatePath('/admin/visitors')
    revalidatePath(`/admin/visitors/${row.link.visitorId}`)

    return {
      status: 'success',
      message: emailed
        ? `A new link was emailed to ${row.visitor.email}. The old link no longer works.`
        : `New link minted. The old link no longer works — copy this one now.`,
      url,
      visitorLabel: who,
      emailed,
      mailConfigured,
    }
  } catch (error) {
    console.error('[admin] regenerateInvite failed', error)
    return { ...fromError(error, 'Could not mint a new link.'), ...empty }
  }
}

/* -------------------------------------------------------------------------- */
/*  Download permission on a live link                                         */
/* -------------------------------------------------------------------------- */

export async function setLinkDownload(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAction()
    const linkId = z.uuid().parse(String(formData.get('linkId') ?? ''))
    const canDownload = checkbox(formData, 'canDownload')

    const [link] = await db
      .select({ visitorId: accessLinks.visitorId })
      .from(accessLinks)
      .where(eq(accessLinks.id, linkId))
      .limit(1)
    if (!link) return fail('That invite no longer exists.')

    await db.update(accessLinks).set({ canDownload }).where(eq(accessLinks.id, linkId))

    revalidatePath('/admin/invites')
    revalidatePath(`/admin/visitors/${link.visitorId}`)

    return {
      status: 'success',
      message: canDownload ? 'Downloads allowed on this link.' : 'Downloads blocked on this link.',
    }
  } catch (error) {
    console.error('[admin] setLinkDownload failed', error)
    return fromError(error, 'Could not change that permission.')
  }
}

/** Revokes every live link a visitor holds. Used from the visitor page. */
export async function revokeAllLinksForVisitor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()
    const visitorId = z.uuid().parse(String(formData.get('visitorId') ?? ''))

    const [visitor] = await db
      .select({ email: visitors.email })
      .from(visitors)
      .where(eq(visitors.id, visitorId))
      .limit(1)
    if (!visitor) return fail('That visitor no longer exists.')

    const revoked = await db
      .update(accessLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessLinks.visitorId, visitorId), isNull(accessLinks.revokedAt)))
      .returning({ id: accessLinks.id })

    if (revoked.length === 0) return { status: 'success', message: 'There was nothing to revoke.' }

    await recordEvent({
      type: 'invite_revoked',
      actor: 'admin',
      visitorId,
      label: visitor.email,
      metadata: { links: revoked.length, by: admin.email },
    })

    revalidatePath('/admin/invites')
    revalidatePath('/admin/visitors')
    revalidatePath(`/admin/visitors/${visitorId}`)

    return {
      status: 'success',
      message: `${revoked.length} link${revoked.length === 1 ? '' : 's'} revoked. ${visitor.email} can no longer enter.`,
    }
  } catch (error) {
    console.error('[admin] revokeAllLinksForVisitor failed', error)
    return fromError(error, 'Could not revoke access.')
  }
}
