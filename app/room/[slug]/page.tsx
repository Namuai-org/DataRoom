import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Check } from 'lucide-react'
import { requireVisitor, canDownload } from '@/lib/auth'
import { getFolderWithDocuments, getVisitorProgress } from '@/lib/room'
import { displayFolderName, folderIndex } from '@/lib/brand'
import { formatBytes, formatDuration } from '@/lib/utils'
import { DocumentIcon, kindLabel } from '@/components/room/DocumentIcon'
import { TierBadge } from '@/components/room/TierBadge'

export const dynamic = 'force-dynamic'

export default async function FolderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const result = await getFolderWithDocuments(auth.link, slug)
  if (!result) notFound()

  const { folder, documents } = result
  const progress = await getVisitorProgress(auth.visitor.id)

  return (
    <div className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <Link
        href="/room"
        className="mb-9 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--text-primary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={14} />
        All folders
      </Link>

      <header className="animate-fade-up">
        <p className="label mb-4 flex items-center gap-2.5">
          <span className="sahel-dot" />
          Section {folderIndex(folder.name) ?? ''}
        </p>
        <h1
          className="font-display text-balance text-[2rem] leading-tight sm:text-[2.4rem]"
          style={{ color: 'var(--text-primary)' }}
        >
          {displayFolderName(folder.name)}
        </h1>
        {folder.description && (
          <p
            className="text-pretty mt-4 max-w-2xl text-[15px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {folder.description}
          </p>
        )}
      </header>

      <div className="hairline my-9" />

      {documents.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
            Nothing filed here yet
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            This section is part of the room but has no documents released to your access level.
          </p>
        </div>
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {documents.map((doc) => {
            const read = progress.get(doc.id)
            const downloadable = canDownload(auth.link, doc)

            return (
              <li key={doc.id}>
                <Link
                  href={`/room/${folder.slug}/${doc.id}`}
                  className="namu-card namu-card-interactive group flex items-start gap-4 p-4 sm:p-5"
                >
                  <span
                    className="mt-0.5 flex-none transition-colors duration-300"
                    style={{ color: read ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    <DocumentIcon kind={doc.kind} size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h2
                        className="text-[15px] font-medium leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {doc.title}
                      </h2>
                      <TierBadge tier={doc.tier} folderTier={folder.tier} />
                    </div>

                    {doc.description && (
                      <p
                        className="text-pretty mt-1.5 text-[13px] leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {doc.description}
                      </p>
                    )}

                    <p
                      className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] tnum"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>{kindLabel(doc.kind)}</span>
                      {doc.pageCount ? (
                        <>
                          <Dot />
                          <span>
                            {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                          </span>
                        </>
                      ) : null}
                      {doc.sizeBytes > 0 && (
                        <>
                          <Dot />
                          <span>{formatBytes(doc.sizeBytes)}</span>
                        </>
                      )}
                      {!downloadable && (
                        <>
                          <Dot />
                          <span>View only</span>
                        </>
                      )}
                    </p>
                  </div>

                  {read && (
                    <span
                      className="flex flex-none items-center gap-1.5 text-[11px] tnum"
                      style={{ color: 'var(--text-muted)' }}
                      title={`You have spent ${formatDuration(read.activeMs)} in this document`}
                    >
                      <Check size={12} style={{ color: 'var(--accent)' }} />
                      {formatDuration(read.activeMs)}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Dot() {
  return (
    <span aria-hidden style={{ opacity: 0.4 }}>
      ·
    </span>
  )
}
