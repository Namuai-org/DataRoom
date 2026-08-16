/**
 * Expiry choices, shared by the server actions that mint invites and by the
 * client forms that offer them.
 *
 * This is deliberately its own module with no `server-only` marker and no
 * `next/headers` import: `_lib/links.ts` needs the request headers to build an
 * absolute URL, which makes it server-only, and a client form that only wants
 * the list of durations must not be dragged across that boundary.
 */

export const EXPIRY_CHOICES = [
  { value: 'never', label: 'Never expires', days: null },
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
] as const

export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]['value']

export function expiryFromChoice(choice: ExpiryChoice): Date | null {
  const found = EXPIRY_CHOICES.find((c) => c.value === choice)
  if (!found || found.days === null) return null
  return new Date(Date.now() + found.days * 24 * 60 * 60 * 1000)
}
