import Link from 'next/link'
import { Users } from 'lucide-react'
import { getVisitorSummaries } from '@/lib/analytics'
import {
  VisitorsTable,
  type LinkState,
  type VisitorRow,
} from '@/components/admin/VisitorsTable'
import { buttonClass, EmptyState, ErrorPanel, PageHeader } from '@/components/admin/ui'
import { toISO } from '../../_lib/format'
import { requireAdminPage } from '../../_lib/guard'
import { getInviteRows, inviteStatus } from '../../_lib/queries'

export const dynamic = 'force-dynamic'

/**
 * `getVisitorSummaries()` reports whether *some* link is revoked or expired,
 * which is not enough to say what state a person is actually in — someone can
 * hold a revoked link and a live replacement. The invite ledger is read
 * alongside it so the status column tells the truth.
 */
function resolveLinkState(links: { revokedAt: Date | null; expiresAt: Date | null; firstOpenedAt: Date | null }[]): LinkState {
  if (links.length === 0) return 'none'
  const states = links.map((link) => inviteStatus(link))
  if (states.includes('active') || states.includes('unopened')) return 'active'
  if (states.includes('expired')) return 'expired'
  return 'revoked'
}

export default async function VisitorsPage() {
  await requireAdminPage()

  let rows: VisitorRow[] | null = null
  let failure: string | null = null

  try {
    const [summaries, invites] = await Promise.all([getVisitorSummaries(), getInviteRows()])

    const linksByVisitor = new Map<string, typeof invites>()
    for (const invite of invites) {
      const list = linksByVisitor.get(invite.link.visitorId)
      if (list) list.push(invite)
      else linksByVisitor.set(invite.link.visitorId, [invite])
    }

    rows = summaries.map((summary) => ({
      visitorId: summary.visitorId,
      email: summary.email,
      name: summary.name,
      organization: summary.organization,
      role: summary.role,
      sessionCount: summary.sessionCount,
      totalActiveMs: summary.totalActiveMs,
      documentsOpened: summary.documentsOpened,
      downloads: summary.downloads,
      lastSeenAt: toISO(summary.lastSeenAt) ?? null,
      country: summary.country,
      city: summary.city,
      ndaSignedAt: toISO(summary.ndaSignedAt) ?? null,
      canDownload: summary.canDownload,
      flagged: summary.flagged,
      engagementScore: summary.engagementScore,
      linkState: resolveLinkState(
        (linksByVisitor.get(summary.visitorId) ?? []).map((invite) => invite.link),
      ),
    }))
  } catch (error) {
    console.error('[admin] visitors page failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Visitors"
        lede="Everyone who has been given a link, what they read, and how long they stayed. Open a row for the full record."
        actions={
          <Link href="/admin/invites" className={buttonClass('primary')}>
            Invite someone
          </Link>
        }
      />

      {failure ? (
        <ErrorPanel detail={failure} />
      ) : rows && rows.length === 0 ? (
        <EmptyState
          icon={<Users size={18} aria-hidden />}
          title="Nobody has been invited yet"
          action={
            <Link href="/admin/invites" className={buttonClass('primary')}>
              Create the first invite
            </Link>
          }
        >
          <p>
            An invite creates a link that belongs to one person. Everything that happens under that
            link — every document, every page, every minute — is attributed to them and appears
            here.
          </p>
        </EmptyState>
      ) : rows ? (
        <VisitorsTable rows={rows} />
      ) : null}
    </>
  )
}
