import { Send } from 'lucide-react'
import { InviteForm } from '@/components/admin/InviteForm'
import { InvitesTable, type InviteRowView } from '@/components/admin/InvitesTable'
import { EmptyState, ErrorPanel, PageHeader, SectionTitle } from '@/components/admin/ui'
import { formatCount, toISO } from '../../_lib/format'
import { requireAdminPage } from '../../_lib/guard'
import { appUrlIsConfigured } from '../../_lib/links'
import { isMailConfigured } from '../../_lib/mail'
import { getFolderTree, getInviteRows, inviteStatus } from '../../_lib/queries'
import { readSettings } from '../../_lib/settings'
import type { FolderOption } from '../../_lib/view-types'

export const dynamic = 'force-dynamic'

export default async function InvitesPage() {
  await requireAdminPage()

  const mailConfigured = isMailConfigured()
  const appUrlConfigured = appUrlIsConfigured()

  let payload: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    payload = await load()
  } catch (error) {
    console.error('[admin] invites page failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (failure || !payload) {
    return (
      <>
        <PageHeader eyebrow="Access" title="Invites" />
        <ErrorPanel detail={failure ?? undefined} />
      </>
    )
  }

  const { folders, rows, defaultCanDownload } = payload
  const live = rows.filter((row) => row.status === 'active' || row.status === 'unopened').length

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Invites"
        lede={
          rows.length === 0
            ? 'An invite is one unguessable link belonging to one person. Everything they do under it is attributed to them.'
            : `${formatCount(live)} live link${live === 1 ? '' : 's'} out of ${formatCount(rows.length)} ever issued. A link is bound to the first device that opens it; later devices still work but are recorded.`
        }
      />

      <InviteForm
        folders={folders}
        mailConfigured={mailConfigured}
        defaultCanDownload={defaultCanDownload}
        appUrlConfigured={appUrlConfigured}
      />

      <section className="mt-10">
        <SectionTitle
          aside={
            rows.length > 0 ? (
              <span className="tnum">
                {formatCount(rows.length)} link{rows.length === 1 ? '' : 's'}
              </span>
            ) : null
          }
        >
          Issued links
        </SectionTitle>

        {rows.length === 0 ? (
          <EmptyState icon={<Send size={18} aria-hidden />} title="No links have been issued yet">
            <p>
              Use the form above. The link appears once, with a copy button — it is stored only as a
              hash, so this console can never show it to you again. If you lose it, mint a new one;
              that retires the old.
            </p>
          </EmptyState>
        ) : (
          <InvitesTable rows={rows} mailConfigured={mailConfigured} />
        )}
      </section>
    </>
  )
}

async function load() {
  const [invites, tree, settings] = await Promise.all([
    getInviteRows(),
    getFolderTree(),
    readSettings(),
  ])

  const folders: FolderOption[] = tree.map((folder) => ({
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    documentCount: folder.documents.length,
  }))

  const rows: InviteRowView[] = invites.map(({ link, visitor, sessionCount }) => ({
    linkId: link.id,
    visitorId: link.visitorId,
    email: visitor.email,
    name: visitor.name,
    organization: visitor.organization,
    label: link.label,
    tokenPreview: link.tokenPreview,
    status: inviteStatus(link),
    createdAt: toISO(link.createdAt) ?? '',
    sentAt: toISO(link.sentAt) ?? null,
    firstOpenedAt: toISO(link.firstOpenedAt) ?? null,
    expiresAt: toISO(link.expiresAt) ?? null,
    openCount: link.openCount,
    sessionCount,
    canDownload: link.canDownload,
    invitedBy: link.invitedBy,
  }))

  return { folders, rows, defaultCanDownload: settings.defaultCanDownload }
}
