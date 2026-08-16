import { AdminsManager, type AdminView } from '@/components/admin/AdminsManager'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { Card, ErrorPanel, Note, PageHeader, SectionTitle } from '@/components/admin/ui'
import { toISO } from '../../_lib/format'
import { requireAdminPage } from '../../_lib/guard'
import { isMailConfigured } from '../../_lib/mail'
import { appUrlIsConfigured } from '../../_lib/links'
import { listAdmins } from '../../_lib/queries'
import { readSettings, SETTINGS_KEYS } from '../../_lib/settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requireAdminPage()

  let payload: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    payload = await load()
  } catch (error) {
    console.error('[admin] settings page failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (failure || !payload) {
    return (
      <>
        <PageHeader eyebrow="Configuration" title="Settings" />
        <ErrorPanel detail={failure ?? undefined} />
      </>
    )
  }

  const { settings, admins } = payload

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        lede="What visitors see when the room opens, what they must agree to first, and who else can look at this console."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <SettingsForm settings={settings} />

        <div className="flex flex-col gap-5">
          <AdminsManager
            admins={admins}
            viewerIsOwner={session.isOwner}
            viewerId={session.adminId}
          />

          <Card>
            <SectionTitle>Environment</SectionTitle>
            <dl className="flex flex-col gap-3 text-[0.85rem]">
              <EnvRow
                label="Email (Resend)"
                ok={isMailConfigured()}
                okText="Configured — codes and invites are sent."
                offText="Not configured. Sign-in codes are printed to the server log and invite links are copied by hand. Everything still works."
              />
              <EnvRow
                label="Public URL"
                ok={appUrlIsConfigured()}
                okText="Set — invite links are built from NEXT_PUBLIC_APP_URL."
                offText="Unset. Links are built from whatever host you are browsing, which will not survive a preview deployment."
              />
              <EnvRow
                label="Blob storage"
                ok={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
                okText="Connected — uploads are stored."
                offText="No BLOB_READ_WRITE_TOKEN. Uploads will be refused with a clear message until a Blob store is connected."
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Where these live</SectionTitle>
            <Note>
              Each setting is one row in the <span className="font-mono text-[0.72rem]">settings</span>{' '}
              table, keyed by name so the room can read them without knowing this console exists:
            </Note>
            <ul className="mt-3 flex flex-col gap-1 font-mono text-[0.72rem] text-[var(--text-muted)]">
              {Object.values(SETTINGS_KEYS).map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}

function EnvRow({
  label,
  ok,
  okText,
  offText,
}: {
  label: string
  ok: boolean
  okText: string
  offText: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ background: ok ? 'var(--color-forest)' : 'var(--color-sahel)' }}
      />
      <div className="min-w-0">
        <dt className="text-[var(--text-primary)]">{label}</dt>
        <dd className="text-pretty mt-0.5 text-[0.78rem] leading-relaxed text-[var(--text-muted)]">
          {ok ? okText : offText}
        </dd>
      </div>
    </div>
  )
}

async function load() {
  const [settings, adminRows] = await Promise.all([readSettings(), listAdmins()])

  const admins: AdminView[] = adminRows.map((admin) => ({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    isOwner: admin.isOwner,
    lastLoginAt: toISO(admin.lastLoginAt) ?? null,
    createdAt: toISO(admin.createdAt) ?? '',
  }))

  return { settings, admins }
}
