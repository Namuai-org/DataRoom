/**
 * Plain, JSON-shaped versions of the database rows the client components
 * render. Dates become ISO strings at the server boundary so a client component
 * never has to guess whether it holds a Date or a string, and so nothing
 * depends on how the RSC payload happens to encode a Date this week.
 *
 * This module carries no `server-only` marker and imports nothing that does:
 * client components read `STATUS_COPY` from here, and a value import into a
 * server-only module would fail the build.
 */

export type InviteStatus = 'active' | 'revoked' | 'expired' | 'unopened'

/** Room configuration. Values live in the `settings` table, one row per key. */
export type RoomSettings = {
  roomTitle: string
  welcomeMessage: string
  ndaEnabled: boolean
  ndaVersion: string
  ndaText: string
  watermarkEnabled: boolean
  defaultCanDownload: boolean
  alertEmail: string
  /** The in-room question and document-request thread. */
  qaEnabled: boolean
}

export type AccessLinkView = {
  id: string
  tokenPreview: string
  label: string | null
  status: InviteStatus
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  sentAt: string | null
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  openCount: number
  canDownload: boolean
  allowedFolderIds: string[]
  invitedBy: string | null
}

export type FolderOption = {
  id: string
  name: string
  slug: string
  documentCount: number
}

export const STATUS_COPY: Record<
  InviteStatus,
  { label: string; tone: 'neutral' | 'positive' | 'attention' | 'muted'; explain: string }
> = {
  active: {
    label: 'Live',
    tone: 'positive',
    explain: 'Opened at least once and still working.',
  },
  unopened: {
    label: 'Not opened',
    tone: 'neutral',
    explain: 'The link works but has never been used.',
  },
  expired: {
    label: 'Expired',
    tone: 'attention',
    explain: 'Past its expiry date. It no longer opens the room.',
  },
  revoked: {
    label: 'Revoked',
    tone: 'attention',
    explain: 'Switched off by hand. It no longer opens the room.',
  },
}
