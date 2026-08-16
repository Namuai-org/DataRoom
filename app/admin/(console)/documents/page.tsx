import { FolderPlus } from 'lucide-react'
import { getDocumentStats } from '@/lib/analytics'
import { DocumentUploader } from '@/components/admin/DocumentUploader'
import {
  DocumentsLegend,
  DocumentsManager,
  NewFolderForm,
  type FolderView,
} from '@/components/admin/DocumentsManager'
import { EmptyState, ErrorPanel, PageHeader } from '@/components/admin/ui'
import { formatBytes } from '@/lib/utils'
import { formatCount } from '../../_lib/format'
import { requireAdminPage } from '../../_lib/guard'
import { getFolderTree } from '../../_lib/queries'
import type { FolderOption } from '../../_lib/view-types'

/**
 * Uploads run through a Server Action on this page, so the segment's execution
 * budget has to cover reading the file, writing it to Blob storage and scanning
 * it for a page count. Sixty seconds is generous for the ~4.5 MB that a
 * serverless request body can actually carry.
 */
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export default async function DocumentsPage() {
  await requireAdminPage()

  let payload: Awaited<ReturnType<typeof load>> | null = null
  let failure: string | null = null

  try {
    payload = await load()
  } catch (error) {
    console.error('[admin] documents page failed to load', error)
    failure = error instanceof Error ? error.message : 'Unknown database error.'
  }

  if (failure || !payload) {
    return (
      <>
        <PageHeader eyebrow="Content" title="Documents" />
        <ErrorPanel detail={failure ?? undefined} />
      </>
    )
  }

  const { folders, options, totals } = payload

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Documents"
        lede={
          totals.documents === 0
            ? 'The room is organised by folder. Create the folders first, then put the material inside in the order you want it read.'
            : `${formatCount(totals.documents)} document${totals.documents === 1 ? '' : 's'} across ${formatCount(folders.length)} folder${folders.length === 1 ? '' : 's'} — ${formatBytes(totals.bytes)} in total. The order here is the order visitors see.`
        }
      />

      <div className="flex flex-col gap-5">
        <NewFolderForm showSeed={folders.length === 0} />
        <DocumentUploader folders={options} />
      </div>

      <div className="mt-10">
        {folders.length === 0 ? (
          <EmptyState icon={<FolderPlus size={18} aria-hidden />} title="No folders yet">
            <p>
              Every document belongs to exactly one folder, and a folder’s slug never changes — so
              renaming a folder later never breaks a link or loses its reading history. Create the
              first one above, or take the ten-folder structure and edit it.
            </p>
          </EmptyState>
        ) : (
          <>
            <DocumentsManager folders={folders} />
            <DocumentsLegend />
          </>
        )}
      </div>
    </>
  )
}

async function load() {
  const [tree, stats] = await Promise.all([getFolderTree(), getDocumentStats()])
  const statsById = new Map(stats.map((stat) => [stat.documentId, stat]))

  const folders: FolderView[] = tree.map((folder) => ({
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    description: folder.description,
    isHidden: folder.isHidden,
    tier: folder.tier,
    documents: folder.documents.map((doc) => {
      const stat = statsById.get(doc.id)
      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        fileName: doc.fileName,
        kind: doc.kind,
        sizeBytes: doc.sizeBytes,
        pageCount: doc.pageCount,
        isHidden: doc.isHidden,
        downloadPolicy: doc.downloadPolicy,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt.toISOString(),
        stats: {
          uniqueViewers: stat?.uniqueViewers ?? 0,
          opens: stat?.opens ?? 0,
          totalActiveMs: stat?.totalActiveMs ?? 0,
          avgActiveMs: stat?.avgActiveMs ?? 0,
          avgCompletion: stat?.avgCompletion ?? 0,
          downloads: stat?.downloads ?? 0,
          lastOpenedAt: stat?.lastOpenedAt ? stat.lastOpenedAt.toISOString() : null,
        },
      }
    }),
  }))

  const options: FolderOption[] = tree.map((folder) => ({
    id: folder.id,
    name: folder.name,
    slug: folder.slug,
    documentCount: folder.documents.length,
  }))

  const totals = {
    documents: tree.reduce((sum, folder) => sum + folder.documents.length, 0),
    bytes: tree.reduce(
      (sum, folder) => sum + folder.documents.reduce((inner, doc) => inner + doc.sizeBytes, 0),
      0,
    ),
  }

  return { folders, options, totals }
}
