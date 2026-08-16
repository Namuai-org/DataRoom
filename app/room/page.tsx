import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Sparkle, MessageCircleQuestion } from 'lucide-react'
import { requireVisitor } from '@/lib/auth'
import { getVisibleFolders, getRoomSettings, getWhatsNew, getVisitorProgress } from '@/lib/room'
import { displayFolderName, folderIndex, brand } from '@/lib/brand'
import { formatDistanceToNow } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function RoomIndex() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const [folders, settings, whatsNew, progress] = await Promise.all([
    getVisibleFolders(auth.link),
    getRoomSettings(),
    getWhatsNew(auth.link, auth.visitor.id),
    getVisitorProgress(auth.visitor.id),
  ])

  const returning = progress.size > 0
  const firstName = auth.visitor.name?.split(' ')[0] ?? null

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
      {/* ---- Opening ---- */}
      <section className="animate-fade-up mx-auto max-w-2xl text-center">
        <p className="label mb-5 flex items-center justify-center gap-2.5">
          <span className="sahel-dot" />
          {returning && firstName ? `Welcome back, ${firstName}` : 'Confidential'}
        </p>

        <h1
          className="font-display text-balance text-[2.1rem] leading-[1.14] sm:text-[2.75rem]"
          style={{ color: 'var(--text-primary)' }}
        >
          {brand.tagline}
        </h1>

        <p
          className="text-pretty mx-auto mt-6 max-w-xl text-[15px] leading-relaxed sm:text-base"
          style={{ color: 'var(--text-secondary)' }}
        >
          {settings.welcomeMessage}
        </p>
      </section>

      {/* ---- What changed since last visit ---- */}
      {whatsNew.documents.length > 0 && (
        <section
          className="namu-card animate-fade-up mt-12 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          style={{ animationDelay: '0.08s' }}
        >
          <div className="flex items-start gap-3.5">
            <Sparkle size={17} className="mt-0.5 flex-none" style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {whatsNew.documents.length} new{' '}
                {whatsNew.documents.length === 1 ? 'document' : 'documents'} since your last visit
              </p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                {whatsNew.documents
                  .slice(0, 3)
                  .map((d) => d.title)
                  .join(' · ')}
                {whatsNew.documents.length > 3 && ` and ${whatsNew.documents.length - 3} more`}
              </p>
            </div>
          </div>
          <Link
            href="/room/new"
            className="flex-none self-start text-[13px] font-medium underline-offset-4 hover:underline sm:self-auto"
            style={{ color: 'var(--accent)' }}
          >
            See what changed
          </Link>
        </section>
      )}

      {/* ---- The ten folders ---- */}
      <section className="mt-14">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="label">Contents</h2>
          <p className="text-xs tnum" style={{ color: 'var(--text-muted)' }}>
            {folders.reduce((sum, f) => sum + f.documentCount, 0)} documents
          </p>
        </div>

        {folders.length === 0 ? (
          <EmptyRoom />
        ) : (
          <div className="stagger grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Link
                key={folder.id}
                href={`/room/${folder.slug}`}
                className="namu-card namu-card-interactive group flex flex-col p-5"
              >
                <div className="mb-3.5 flex items-center justify-between">
                  <span
                    className="font-display text-[13px] tnum"
                    style={{ color: 'var(--accent)' }}
                  >
                    {folderIndex(folder.name) ?? '—'}
                  </span>
                  <ArrowUpRight
                    size={15}
                    className="opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden
                  />
                </div>

                <h3
                  className="font-display text-[17px] leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {displayFolderName(folder.name)}
                </h3>

                {folder.description && (
                  <p
                    className="text-pretty mt-2 flex-1 text-[13px] leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {folder.description}
                  </p>
                )}

                <p
                  className="mt-4 border-t pt-3 text-[11.5px] tnum"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  {folder.documentCount === 0
                    ? 'Nothing filed yet'
                    : `${folder.documentCount} ${folder.documentCount === 1 ? 'document' : 'documents'}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Ask ---- */}
      {settings.qaEnabled && (
        <section
          className="namu-card mt-12 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: 'var(--surface-sunken)', boxShadow: 'none' }}
        >
          <div className="flex items-start gap-3.5">
            <MessageCircleQuestion
              size={18}
              className="mt-0.5 flex-none"
              style={{ color: 'var(--text-secondary)' }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Something you cannot find?
              </p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Ask here and we will answer inside the room, so the thread stays with the document.
              </p>
            </div>
          </div>
          <Link
            href="/room/questions"
            className="flex-none self-start rounded-full px-4 py-2 text-[13px] font-medium transition-transform duration-300 hover:-translate-y-0.5 sm:self-auto"
            style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
          >
            Ask a question
          </Link>
        </section>
      )}

      {whatsNew.since && (
        <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
          You were last here {formatDistanceToNow(whatsNew.since, { addSuffix: true })}.
        </p>
      )}
    </div>
  )
}

function EmptyRoom() {
  return (
    <div
      className="namu-card grid place-items-center px-6 py-16 text-center"
      style={{ boxShadow: 'none' }}
    >
      <p className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
        Nothing has been shared with you yet
      </p>
      <p className="mt-2 max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
        Your access is active, but no folders have been released to it. Contact {brand.contact} and
        we will open the right sections.
      </p>
    </div>
  )
}
