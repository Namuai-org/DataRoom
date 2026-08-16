import 'server-only'
import { Resend } from 'resend'
import { brand } from '@/lib/brand'

/**
 * Outbound email for the console.
 *
 * Email is optional infrastructure here. Before Resend is configured the room
 * still works end to end: sign-in codes are printed to the server console with
 * a loud banner, and invite links are copied by hand from the invites page.
 * Nothing in this file is allowed to throw — a mail failure must never be the
 * reason an admin cannot sign in or an invite cannot be created.
 */

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** Resend's shared sandbox sender, so the flow works before a domain is verified. */
const FALLBACK_FROM = `${brand.name} <onboarding@resend.dev>`

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || FALLBACK_FROM
}

export type MailResult = {
  delivered: boolean
  /** 'not-configured' | 'send-failed' | null when delivered. */
  reason: 'not-configured' | 'send-failed' | null
  detail?: string
}

async function send(input: {
  to: string
  subject: string
  html: string
  text: string
  /** Printed to the server log when email is not configured. */
  banner: string
}): Promise<MailResult> {
  if (!isMailConfigured()) {
    console.warn(
      `\n${'='.repeat(72)}\n${input.banner}\n${'='.repeat(72)}\n` +
        `RESEND_API_KEY is not set, so this was not emailed.\n`,
    )
    return { delivered: false, reason: 'not-configured' }
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    })

    if (result.error) {
      console.error('[mail] Resend refused the message:', result.error)
      console.warn(`\n${'='.repeat(72)}\n${input.banner}\n${'='.repeat(72)}\n`)
      return {
        delivered: false,
        reason: 'send-failed',
        detail: result.error.message ?? 'Resend returned an error.',
      }
    }

    return { delivered: true, reason: null }
  } catch (error) {
    console.error('[mail] send threw:', error)
    console.warn(`\n${'='.repeat(72)}\n${input.banner}\n${'='.repeat(72)}\n`)
    return {
      delivered: false,
      reason: 'send-failed',
      detail: error instanceof Error ? error.message : 'Unknown mail error.',
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Email clients do not load web fonts reliably, so the display face falls back
 * to Georgia — the closest widely installed relative of Playfair Display.
 */
const SHELL_OPEN = `<div style="margin:0;padding:32px 16px;background:#F7F0E3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1410;">
  <div style="max-width:520px;margin:0 auto;background:#FFFDF8;border:1px solid rgba(28,20,16,0.12);border-radius:14px;padding:36px 32px;">`

const SHELL_CLOSE = `  </div>
  <p style="max-width:520px;margin:20px auto 0;font-size:12px;line-height:1.6;color:#8F7D71;">
    ${brand.legalName} — ${brand.site}. This message was sent because someone asked for access to a
    confidential room. If that was not you, no action is needed.
  </p>
</div>`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;letter-spacing:-0.015em;color:#1C1410;">${escapeHtml(
    text,
  )}</h1>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#55443A;">${text}</p>`
}

/* -------------------------------------------------------------------------- */
/*  Admin sign-in code                                                         */
/* -------------------------------------------------------------------------- */

export async function sendAdminLoginCode(email: string, code: string): Promise<MailResult> {
  const html = `${SHELL_OPEN}
    ${heading('Your sign-in code')}
    ${paragraph('Enter this code in the console to finish signing in. It is valid for ten minutes and can be used once.')}
    <p style="margin:24px 0;padding:18px 20px;background:#F7F0E3;border:1px solid rgba(28,20,16,0.12);border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:0.28em;text-align:center;color:#1C1410;">${code}</p>
    ${paragraph('If you did not ask to sign in, ignore this email. The code expires on its own.')}
  ${SHELL_CLOSE}`

  const text = [
    'Your sign-in code',
    '',
    code,
    '',
    'Valid for ten minutes, single use. If you did not ask to sign in, ignore this email.',
  ].join('\n')

  return send({
    to: email,
    subject: `${code} is your ${brand.name} sign-in code`,
    html,
    text,
    banner: `[admin login code for ${email}] ${code}`,
  })
}

/* -------------------------------------------------------------------------- */
/*  Invite                                                                     */
/* -------------------------------------------------------------------------- */

export async function sendInviteEmail(input: {
  to: string
  name: string | null
  url: string
  roomTitle: string
  welcome: string | null
  expiresAt: Date | null
}): Promise<MailResult> {
  const greeting = input.name?.trim() ? `${escapeHtml(input.name.trim())},` : 'Hello,'
  const expiry = input.expiresAt
    ? `This link stops working on ${input.expiresAt.toISOString().slice(0, 10)}.`
    : 'This link does not expire, but it can be revoked at any time.'

  const html = `${SHELL_OPEN}
    ${heading(input.roomTitle)}
    ${paragraph(greeting)}
    ${paragraph(
      input.welcome?.trim()
        ? escapeHtml(input.welcome.trim())
        : `You have been given access to the ${escapeHtml(brand.name)} data room. The link below is yours alone — please do not forward it.`,
    )}
    <p style="margin:28px 0;">
      <a href="${input.url}" style="display:inline-block;padding:13px 24px;background:#1C1410;color:#F7F0E3;text-decoration:none;border-radius:9px;font-size:15px;font-weight:500;">Open the data room</a>
    </p>
    ${paragraph(escapeHtml(expiry))}
    <p style="margin:0;font-size:12px;line-height:1.6;color:#8F7D71;word-break:break-all;">${input.url}</p>
  ${SHELL_CLOSE}`

  const text = [
    input.roomTitle,
    '',
    input.name?.trim() ? `${input.name.trim()},` : 'Hello,',
    '',
    input.welcome?.trim() ??
      `You have been given access to the ${brand.name} data room. The link below is yours alone — please do not forward it.`,
    '',
    input.url,
    '',
    expiry,
  ].join('\n')

  return send({
    to: input.to,
    subject: `${input.roomTitle} — your access link`,
    html,
    text,
    banner: `[invite link for ${input.to}] ${input.url}`,
  })
}
