import 'server-only'
import { Resend } from 'resend'
import { brand, colors } from '@/lib/brand'

/**
 * Outbound email.
 *
 * Every function here degrades quietly: if RESEND_API_KEY is unset the message
 * is logged to the server console and the caller carries on. The room must be
 * fully usable before any mail provider is configured — invite links can always
 * be copied by hand from the admin console.
 */

const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

const FROM = process.env.EMAIL_FROM ?? 'Namu Data Room <onboarding@resend.dev>'
const OWNER = process.env.OWNER_EMAIL ?? 'mouhamad@namuai.org'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

/**
 * Where activity alerts go.
 *
 * The console's "alert email" setting wins when it is set, so notifications can
 * be pointed at a shared address without redeploying. It falls back to
 * OWNER_EMAIL. A failure to read the setting must never swallow the alert, so
 * the fallback is also the error path.
 */
async function alertRecipient(): Promise<string> {
  try {
    const { readSettings } = await import('@/app/admin/_lib/settings')
    const settings = await readSettings()
    const configured = settings.alertEmail?.trim()
    return configured && configured.includes('@') ? configured : OWNER
  } catch (error) {
    console.error('[mail] could not read alert address; falling back to OWNER_EMAIL', error)
    return OWNER
  }
}

export type MailResult = { sent: boolean; reason?: string }

async function send(input: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<MailResult> {
  if (!resend) {
    console.warn(
      `\n[mail not configured] would send to ${input.to}\n  subject: ${input.subject}\n  ${input.text.replace(/\n/g, '\n  ')}\n`,
    )
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    })
    if (error) {
      console.error('[mail] send failed', error)
      return { sent: false, reason: error.message }
    }
    return { sent: true }
  } catch (error) {
    console.error('[mail] send threw', error)
    return { sent: false, reason: error instanceof Error ? error.message : 'unknown' }
  }
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                  */
/* -------------------------------------------------------------------------- */

/** Shared shell so every message looks like Namu rather than a default Resend email. */
function shell(body: string, preheader: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${brand.name}</title></head>
<body style="margin:0;padding:0;background:${colors.harmattan};">
  <span style="display:none;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.harmattan};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border:1px solid rgba(28,20,16,0.10);border-radius:14px;overflow:hidden;">
        <tr><td style="padding:32px 36px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <div style="width:8px;height:8px;border-radius:99px;background:${colors.sahel};"></div>
            </td>
            <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${colors.ink};letter-spacing:1px;">namu</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${colors.ink};font-size:15px;line-height:1.62;">
          ${body}
        </td></tr>
        <tr><td style="padding:18px 36px 26px;border-top:1px solid rgba(28,20,16,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:rgba(28,20,16,0.48);">
          ${brand.legalName} · ${brand.site}<br>
          This message concerns confidential material. If it reached you in error, please delete it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${colors.ink};color:${colors.harmattan};text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:500;">${label}</a>`
}

/* -------------------------------------------------------------------------- */
/*  Visitor invitation                                                         */
/* -------------------------------------------------------------------------- */

export async function sendInvite(input: {
  to: string
  name?: string | null
  accessUrl: string
  message?: string | null
  expiresAt?: Date | null
}): Promise<MailResult> {
  const greeting = input.name ? `Hello ${input.name},` : 'Hello,'
  const expiry = input.expiresAt
    ? `<p style="margin:0 0 18px;color:rgba(28,20,16,0.62);font-size:14px;">This link stops working on ${input.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`
    : ''

  const custom = input.message
    ? `<p style="margin:0 0 18px;">${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`
    : ''

  const html = shell(
    `<p style="margin:0 0 18px;">${greeting}</p>
     ${custom || `<p style="margin:0 0 18px;">You have been given access to Namu's data room. It holds the material behind ${brand.descriptor.toLowerCase().replace(/^namu is /, '')} — company overview, financials, market research, team, and product.</p>`}
     <p style="margin:0 0 24px;">${button(input.accessUrl, 'Open the data room')}</p>
     ${expiry}
     <p style="margin:0;color:rgba(28,20,16,0.62);font-size:13px;">This link is personal to you. Please do not forward it — access is logged per person.</p>`,
    'Your access to the Namu data room',
  )

  const text = `${greeting}

You have been given access to Namu's data room.

${input.accessUrl}

This link is personal to you. Please do not forward it — access is logged per person.

${brand.legalName} · ${brand.site}`

  return send({ to: input.to, subject: 'Access to the Namu data room', html, text, replyTo: OWNER })
}

/* -------------------------------------------------------------------------- */
/*  Owner alerts                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fired when someone opens the room. During a raise this is the most valuable
 * message the system sends — it tells you who is reading, so you can follow up
 * while their attention is still on you.
 */
export async function notifyRoomEntered(input: {
  visitorName: string | null
  visitorEmail: string
  organization: string | null
  city: string | null
  country: string | null
  isNewDevice: boolean
  isFirstOpen: boolean
}): Promise<MailResult> {
  const who = input.visitorName ?? input.visitorEmail
  const org = input.organization ? ` (${input.organization})` : ''
  const place = [input.city, input.country].filter(Boolean).join(', ')

  const headline = input.isFirstOpen
    ? `${who} opened the data room for the first time`
    : `${who} is back in the data room`

  const warning = input.isNewDevice
    ? `<p style="margin:0 0 18px;padding:12px 14px;background:rgba(232,147,90,0.12);border-left:2px solid ${colors.sahel};border-radius:6px;font-size:14px;">Opened from a device that has not used this link before. The invite may have been forwarded.</p>`
    : ''

  const html = shell(
    `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(28,20,16,0.45);">Data room activity</p>
     <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:22px;line-height:1.3;">${escapeHtml(headline)}</p>
     ${warning}
     <p style="margin:0 0 6px;font-size:14px;color:rgba(28,20,16,0.62);">${escapeHtml(input.visitorEmail)}${escapeHtml(org)}</p>
     ${place ? `<p style="margin:0 0 22px;font-size:14px;color:rgba(28,20,16,0.62);">${escapeHtml(place)}</p>` : ''}
     <p style="margin:0;">${button(`${APP_URL}/admin/visitors`, 'See what they read')}</p>`,
    headline,
  )

  const text = `${headline}\n${input.visitorEmail}${org}\n${place}\n${input.isNewDevice ? '\nOpened from a new device — the invite may have been forwarded.\n' : ''}\n${APP_URL}/admin/visitors`

  return send({
    to: await alertRecipient(),
    subject: `${who} opened the Namu data room`,
    html,
    text,
  })
}

/** Fired when an investor asks a question inside the room. */
export async function notifyQuestion(input: {
  visitorName: string | null
  visitorEmail: string
  body: string
  documentTitle?: string | null
}): Promise<MailResult> {
  const who = input.visitorName ?? input.visitorEmail
  const context = input.documentTitle ? ` about ${input.documentTitle}` : ''

  const html = shell(
    `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(28,20,16,0.45);">New question</p>
     <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:22px;line-height:1.3;">${escapeHtml(who)} asked a question${escapeHtml(context)}</p>
     <blockquote style="margin:0 0 22px;padding:14px 16px;background:${colors.harmattan};border-left:2px solid ${colors.sahel};border-radius:6px;font-size:15px;">${escapeHtml(input.body).replace(/\n/g, '<br>')}</blockquote>
     <p style="margin:0;">${button(`${APP_URL}/admin/questions`, 'Answer it')}</p>`,
    `${who} asked a question`,
  )

  return send({
    to: await alertRecipient(),
    subject: `Question from ${who}`,
    html,
    text: `${who} asked${context}:\n\n${input.body}\n\n${APP_URL}/admin/questions`,
    replyTo: input.visitorEmail,
  })
}

/** Tells an investor their question has been answered. */
export async function notifyAnswer(input: {
  to: string
  name: string | null
  question: string
  answer: string
}): Promise<MailResult> {
  const html = shell(
    `<p style="margin:0 0 18px;">${input.name ? `Hello ${escapeHtml(input.name)},` : 'Hello,'}</p>
     <p style="margin:0 0 8px;font-size:13px;color:rgba(28,20,16,0.55);">You asked:</p>
     <blockquote style="margin:0 0 18px;padding:12px 14px;background:${colors.harmattan};border-radius:6px;font-size:14px;color:rgba(28,20,16,0.72);">${escapeHtml(input.question).replace(/\n/g, '<br>')}</blockquote>
     <p style="margin:0 0 18px;">${escapeHtml(input.answer).replace(/\n/g, '<br>')}</p>
     <p style="margin:0;">${button(`${APP_URL}/room`, 'Back to the data room')}</p>`,
    'Your question has been answered',
  )

  return send({
    to: input.to,
    subject: 'Your question about Namu',
    html,
    text: `You asked:\n${input.question}\n\n${input.answer}\n\n${APP_URL}/room`,
    replyTo: OWNER,
  })
}

/** One-time sign-in code for the admin console. */
export async function sendAdminCode(input: { to: string; code: string }): Promise<MailResult> {
  const html = shell(
    `<p style="margin:0 0 18px;">Your sign-in code for the Namu data room console:</p>
     <p style="margin:0 0 22px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:0.18em;color:${colors.ink};">${input.code}</p>
     <p style="margin:0;color:rgba(28,20,16,0.62);font-size:13px;">It expires in 10 minutes. If you did not request it, ignore this message.</p>`,
    `Your code is ${input.code}`,
  )

  return send({
    to: input.to,
    subject: `${input.code} — Namu data room sign-in`,
    html,
    text: `Your sign-in code is ${input.code}. It expires in 10 minutes.`,
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const mailConfigured = Boolean(resend)
