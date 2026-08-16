import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { requireVisitor } from '@/lib/auth'
import { getWhatsNew } from '@/lib/room'
import { displayFolderName } from '@/lib/brand'
import { formatBytes } from '@/lib/utils'
import { DocumentIcon, kindLabel } from '@/components/room/DocumentIcon'

export const dynamic = 'force-dynamic'

export default async function WhatsNewPage() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const { since, documents } = await getWhatsNew(auth.link, auth.visitor.id)

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

      <p className="label mb-4 flex items-center gap-2.5">
        <span className="sahel-dot" />
        Since your last visit
      </p>
      <h1 className="font-display text-[1.9rem] leading-tight" style={{ color: 'var(--text-primary)' }}>
        What changed
      </h1>
      {since && (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          You were last here {formatDistanceToNow(since, { addSuffix: true })}.
        </p>
      )}

      {documents.length === 0 ? (
        <div className="namu-card mt-9 p-8 text-center" style={{ boxShadow: 'none' }}>
          <p className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
            Nothing new
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            No documents have been added or updated since you were last here.
          </p>
        </div>
      ) : (
        <ul className="stagger mt-9 flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/room/${doc.folderSlug}/${doc.id}`}
                className="namu-card namu-card-interactive flex items-start gap-4 p-4 sm:p-5"
              >
                <span className="mt-0.5 flex-none" style={{ color: 'var(--accent)' }}>
                  <DocumentIcon kind={doc.kind} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {doc.title}
                  </h2>
                  {doc.description && (
                    <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      {doc.description}
                    </p>
                  )}
                  <p className="mt-2 text-[11.5px] tnum" style={{ color: 'var(--text-muted)' }}>
                    {displayFolderName(doc.folderName)} · {kindLabel(doc.kind)}
                    {doc.sizeBytes > 0 && ` · ${formatBytes(doc.sizeBytes)}`} ·{' '}
                    {doc.contentUpdatedAt ? 'Updated' : 'Added'}{' '}
                    {formatDistanceToNow(doc.contentUpdatedAt ?? doc.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
