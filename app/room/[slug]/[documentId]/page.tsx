import { notFound, redirect } from 'next/navigation'
import { requireVisitor, canDownload } from '@/lib/auth'
import { getDocumentForVisitor, getRoomSettings } from '@/lib/room'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'

export const dynamic = 'force-dynamic'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ slug: string; documentId: string }>
}) {
  const { slug, documentId } = await params
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  // getDocumentForVisitor already enforces folder access and disclosure tier;
  // matching the slug as well stops a document being reached through the wrong
  // folder's URL, which would otherwise muddle the analytics.
  const result = await getDocumentForVisitor(auth.link, documentId)
  if (!result || result.folder.slug !== slug) notFound()

  const settings = await getRoomSettings()
  const { document, folder } = result

  return (
    <DocumentViewer
      document={{
        id: document.id,
        title: document.title,
        description: document.description,
        fileName: document.fileName,
        mimeType: document.mimeType,
        kind: document.kind,
        sizeBytes: document.sizeBytes,
        pageCount: document.pageCount,
        folderId: folder.id,
        folderName: folder.name,
        folderSlug: folder.slug,
      }}
      folder={{ slug: folder.slug, name: folder.name }}
      // `null` switches the watermark off; leaving it undefined lets the viewer
      // compose the standard "email · timestamp · Confidential" line.
      watermark={settings.watermarkEnabled ? undefined : null}
      viewerEmail={auth.visitor.email}
      canDownload={canDownload(auth.link, document)}
      backHref={`/room/${folder.slug}`}
    />
  )
}
