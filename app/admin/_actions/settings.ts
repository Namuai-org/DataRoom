'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, admins } from '@/lib/db'
import { recordEvent } from '@/lib/analytics'
import { requireAdminAction, requireOwnerAction } from '../_lib/guard'
import { writeSettings, type RoomSettings } from '../_lib/settings'
import { fail, fromError, type ActionState } from '../_lib/action-state'

/* -------------------------------------------------------------------------- */
/*  Room settings                                                              */
/* -------------------------------------------------------------------------- */

const settingsSchema = z.object({
  roomTitle: z.string().trim().min(1, 'The room needs a title.').max(120),
  welcomeMessage: z.string().trim().max(2000),
  ndaEnabled: z.boolean(),
  ndaVersion: z
    .string()
    .trim()
    .min(1, 'Give the NDA a version string — it is written into every signature record.')
    .max(40),
  ndaText: z.string().trim().max(20000),
  watermarkEnabled: z.boolean(),
  defaultCanDownload: z.boolean(),
  alertEmail: z.union([z.email('That alert address is not a valid email.'), z.literal('')]),
  qaEnabled: z.boolean(),
})

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name)
  return value === 'on' || value === 'true' || value === '1'
}

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()

    const parsed = settingsSchema.safeParse({
      roomTitle: String(formData.get('roomTitle') ?? ''),
      welcomeMessage: String(formData.get('welcomeMessage') ?? ''),
      ndaEnabled: checkbox(formData, 'ndaEnabled'),
      ndaVersion: String(formData.get('ndaVersion') ?? ''),
      ndaText: String(formData.get('ndaText') ?? ''),
      watermarkEnabled: checkbox(formData, 'watermarkEnabled'),
      defaultCanDownload: checkbox(formData, 'defaultCanDownload'),
      alertEmail: String(formData.get('alertEmail') ?? '').trim(),
      qaEnabled: checkbox(formData, 'qaEnabled'),
    })

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Check the settings and try again.')
    }

    if (parsed.data.ndaEnabled && parsed.data.ndaText.trim().length < 40) {
      return fail('The NDA gate is on but the NDA text is empty. Write the terms, or turn the gate off.')
    }

    const patch: RoomSettings = parsed.data
    await writeSettings(patch)

    await recordEvent({
      type: 'settings_changed',
      actor: 'admin',
      label: 'Room settings',
      metadata: {
        ndaEnabled: patch.ndaEnabled,
        ndaVersion: patch.ndaVersion,
        watermarkEnabled: patch.watermarkEnabled,
        defaultCanDownload: patch.defaultCanDownload,
        by: admin.email,
      },
    })

    revalidatePath('/admin/settings')
    revalidatePath('/admin')
    return { status: 'success', message: 'Settings saved.' }
  } catch (error) {
    console.error('[admin] saveSettings failed', error)
    return fromError(error, 'Could not save those settings.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Other admins — owner only                                                  */
/* -------------------------------------------------------------------------- */

const newAdminSchema = z.object({
  email: z.email('Enter a valid email address.'),
  name: z.string().trim().max(120).nullable(),
})

export async function addAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwnerAction()

    const name = String(formData.get('name') ?? '').trim()
    const parsed = newAdminSchema.safeParse({
      email: String(formData.get('email') ?? '')
        .trim()
        .toLowerCase(),
      name: name === '' ? null : name,
    })

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Enter a valid email address.')
    }

    const [existing] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(sql`LOWER(${admins.email}) = ${parsed.data.email}`)
      .limit(1)

    if (existing) return fail(`${parsed.data.email} can already sign in.`)

    await db.insert(admins).values({
      email: parsed.data.email,
      name: parsed.data.name,
      isOwner: false,
    })

    await recordEvent({
      type: 'settings_changed',
      actor: 'admin',
      label: `Admin added: ${parsed.data.email}`,
      metadata: { by: owner.email },
    })

    revalidatePath('/admin/settings')
    return {
      status: 'success',
      message: `${parsed.data.email} can now sign in with a one-time code. There is no password to send.`,
    }
  } catch (error) {
    console.error('[admin] addAdmin failed', error)
    return fromError(error, 'Could not add that administrator.')
  }
}

export async function removeAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const owner = await requireOwnerAction()
    const adminId = z.uuid().parse(String(formData.get('adminId') ?? ''))

    if (adminId === owner.adminId) {
      return fail('You cannot remove yourself. Hand the room over first.')
    }

    const [target] = await db.select().from(admins).where(eq(admins.id, adminId)).limit(1)
    if (!target) return fail('That administrator no longer exists.')
    if (target.isOwner) return fail('The room owner cannot be removed.')

    await db.delete(admins).where(eq(admins.id, adminId))

    await recordEvent({
      type: 'settings_changed',
      actor: 'admin',
      label: `Admin removed: ${target.email}`,
      metadata: { by: owner.email },
    })

    revalidatePath('/admin/settings')
    return {
      status: 'success',
      message: `${target.email} removed. Their next request signs them out.`,
    }
  } catch (error) {
    console.error('[admin] removeAdmin failed', error)
    return fromError(error, 'Could not remove that administrator.')
  }
}
