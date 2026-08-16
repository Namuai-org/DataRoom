import 'server-only'
import { headers } from 'next/headers'

/**
 * Invite URL construction and expiry maths, shared by the invites page and the
 * per-visitor "re-issue link" control.
 */

// Re-exported so server callers can keep importing everything from one place.
// Client components must import these from `_lib/expiry` directly — this module
// is server-only and pulling it into a client bundle fails the build.
export { EXPIRY_CHOICES, expiryFromChoice, type ExpiryChoice } from './expiry'

/**
 * The base URL for invite links.
 *
 * NEXT_PUBLIC_APP_URL is authoritative because an invite outlives the request
 * that created it — a preview deployment host would bake a URL that dies with
 * the deployment. When it is unset we fall back to the request's own host so
 * local development still produces a link that works.
 */
export async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

export async function buildInviteUrl(token: string): Promise<string> {
  return `${await appBaseUrl()}/access/${token}`
}

/** True when the deployment has no configured public URL to build links from. */
export function appUrlIsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim())
}
