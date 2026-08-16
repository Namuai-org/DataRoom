'use server'

import { redirect } from 'next/navigation'
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, admins, adminLoginCodes } from '@/lib/db'
import {
  clearAdminSession,
  createAdminSession,
  generateLoginCode,
  getRequestContext,
  hashCode,
  safeEqual,
} from '@/lib/auth'
import { recordEvent } from '@/lib/analytics'
import { isMailConfigured, sendAdminLoginCode } from '../_lib/mail'
import {
  fail,
  type RequestCodeState,
  type VerifyCodeState,
} from '../_lib/action-state'

/* -------------------------------------------------------------------------- */
/*  Policy                                                                     */
/* -------------------------------------------------------------------------- */

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_CODES_PER_WINDOW = 5

/**
 * Step one and step two both return the same shaped, deliberately vague
 * message. Whether an address belongs to an admin is not something an
 * unauthenticated form should be able to discover, so a stranger's request and
 * the owner's request are indistinguishable from the outside: same wording,
 * same success status, same next screen.
 */
const GENERIC_SENT =
  'If that address belongs to an administrator, a six-digit code is on its way. Codes last ten minutes and are limited to five in fifteen minutes.'

const emailSchema = z.email('Enter a valid email address.')
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'The code is six digits.')

function normalise(email: string): string {
  return email.trim().toLowerCase()
}

/* -------------------------------------------------------------------------- */
/*  Step one — request a code                                                  */
/* -------------------------------------------------------------------------- */

export async function requestAdminCode(
  _prev: RequestCodeState,
  formData: FormData,
): Promise<RequestCodeState> {
  const mailConfigured = isMailConfigured()
  const raw = String(formData.get('email') ?? '')
  const parsed = emailSchema.safeParse(normalise(raw))

  if (!parsed.success) {
    return {
      ...fail(parsed.error.issues[0]?.message ?? 'Enter a valid email address.'),
      email: raw,
      sent: false,
      mailConfigured,
    }
  }

  const email = parsed.data
  const sentState: RequestCodeState = {
    status: 'success',
    message: GENERIC_SENT,
    email,
    sent: true,
    mailConfigured,
  }

  try {
    // First run: the admins table is empty and nobody can sign in yet. The one
    // address named in OWNER_EMAIL becomes the owner. After that this branch
    // can never fire again, because the table is no longer empty.
    const ownerEmail = normalise(process.env.OWNER_EMAIL ?? '')
    const [existingAdminCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(admins)
    const adminCount = Number(existingAdminCount?.n ?? 0)

    if (adminCount === 0 && ownerEmail && email === ownerEmail) {
      await db.insert(admins).values({ email, isOwner: true }).onConflictDoNothing()
      console.warn(`[admin] bootstrapped the owner account for ${email} from OWNER_EMAIL`)
    }

    const [admin] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(sql`LOWER(${admins.email}) = ${email}`)
      .limit(1)

    // Not an admin: stop here, silently. Same response as the happy path.
    if (!admin) return sentState

    const [recent] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(adminLoginCodes)
      .where(
        and(
          eq(adminLoginCodes.email, email),
          gte(adminLoginCodes.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
        ),
      )

    if (Number(recent?.n ?? 0) >= MAX_CODES_PER_WINDOW) {
      console.warn(`[admin] rate limit reached for ${email}; no code issued`)
      return sentState
    }

    const ctx = await getRequestContext()
    const code = generateLoginCode()

    // Retire anything still outstanding for this address first. Verification
    // only ever considers the newest unconsumed code, so without this an older
    // one stays a live row and becomes valid again the moment the newest is
    // burned — several codes usable inside the same ten-minute window.
    await db
      .update(adminLoginCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(adminLoginCodes.email, email), isNull(adminLoginCodes.consumedAt)))

    await db.insert(adminLoginCodes).values({
      email,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      requestIp: ctx.ip,
    })

    await sendAdminLoginCode(email, code)
    return sentState
  } catch (error) {
    console.error('[admin] requestAdminCode failed', error)
    return {
      ...fail('Something went wrong issuing a code. Try again in a moment.'),
      email,
      sent: false,
      mailConfigured,
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Step two — verify a code                                                   */
/* -------------------------------------------------------------------------- */

export async function verifyAdminCode(
  _prev: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = normalise(String(formData.get('email') ?? ''))
  const codeInput = String(formData.get('code') ?? '')

  const emailParsed = emailSchema.safeParse(email)
  const codeParsed = codeSchema.safeParse(codeInput)

  if (!emailParsed.success) {
    return { ...fail('Start again — that email address is not valid.'), attemptsLeft: null }
  }
  if (!codeParsed.success) {
    return {
      ...fail(codeParsed.error.issues[0]?.message ?? 'The code is six digits.'),
      attemptsLeft: null,
    }
  }

  const code = codeParsed.data
  let session: { adminId: string; email: string; isOwner: boolean } | null = null

  try {
    const [record] = await db
      .select()
      .from(adminLoginCodes)
      .where(and(eq(adminLoginCodes.email, email), isNull(adminLoginCodes.consumedAt)))
      .orderBy(desc(adminLoginCodes.createdAt))
      .limit(1)

    /*
     * Every failure below answers identically.
     *
     * Step one is already careful not to say whether an address is an admin.
     * Step two used to give it away: a stranger's address has no code row and
     * got "not valid", while a real admin's wrong guess got "4 attempts left".
     * The countdown was a reliable oracle for "this address can reach the
     * console" — so it is gone. The attempt limit, the expiry and the single-use
     * consumption all still apply; they simply are not narrated back.
     *
     * The cost is that a real admin is not warned as they burn attempts. That is
     * cheap to recover from — ask for another code — and worth paying.
     */
    const rejected = {
      ...fail('That code is not valid or has expired. Ask for a new one.'),
      attemptsLeft: null,
    }

    if (!record) {
      await recordEvent({ type: 'admin_login_failed', actor: 'admin', label: email })
      return rejected
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await db
        .update(adminLoginCodes)
        .set({ consumedAt: new Date() })
        .where(eq(adminLoginCodes.id, record.id))
      return rejected
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await db
        .update(adminLoginCodes)
        .set({ consumedAt: new Date() })
        .where(eq(adminLoginCodes.id, record.id))
      return rejected
    }

    if (!safeEqual(hashCode(code), record.codeHash)) {
      const attempts = record.attempts + 1
      const exhausted = attempts >= MAX_ATTEMPTS
      await db
        .update(adminLoginCodes)
        .set({ attempts, ...(exhausted ? { consumedAt: new Date() } : {}) })
        .where(eq(adminLoginCodes.id, record.id))

      await recordEvent({ type: 'admin_login_failed', actor: 'admin', label: email })
      return rejected
    }

    // Correct. Burn the code before anything else, so a replay cannot race us.
    await db
      .update(adminLoginCodes)
      .set({ consumedAt: new Date() })
      .where(eq(adminLoginCodes.id, record.id))

    const [admin] = await db
      .select()
      .from(admins)
      .where(sql`LOWER(${admins.email}) = ${email}`)
      .limit(1)

    if (!admin) {
      return { ...fail('That account no longer has access.'), attemptsLeft: null }
    }

    await createAdminSession({
      adminId: admin.id,
      email: admin.email,
      isOwner: admin.isOwner,
    })

    await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id))

    const ctx = await getRequestContext()
    await recordEvent({
      type: 'admin_login',
      actor: 'admin',
      label: admin.email,
      ip: ctx.ip,
      country: ctx.country,
    })

    session = { adminId: admin.id, email: admin.email, isOwner: admin.isOwner }
  } catch (error) {
    console.error('[admin] verifyAdminCode failed', error)
    return {
      ...fail('Something went wrong checking that code. Try again.'),
      attemptsLeft: null,
    }
  }

  // redirect() works by throwing, so it must sit outside the try block or the
  // catch above would swallow the navigation and report it as an error.
  if (session) redirect('/admin')
  return { ...fail('Sign-in did not complete. Try again.'), attemptsLeft: null }
}

/* -------------------------------------------------------------------------- */
/*  Sign out                                                                   */
/* -------------------------------------------------------------------------- */

export async function signOut(): Promise<void> {
  await clearAdminSession()
  redirect('/admin/login')
}
