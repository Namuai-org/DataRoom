import 'server-only'
import { get } from '@vercel/blob'
import { and, eq, max } from 'drizzle-orm'
import { db, documents, folders } from '@/lib/db'
import { detectKind, mimeFromFileName, titleFromFileName } from '@/lib/utils'
import { bestEffortPdfPageCount } from '@/app/admin/_lib/pdf'
import { recordEvent } from '@/lib/analytics'

/**
 * Records an uploaded blob as a document.
 *
 * Called from two places that can both fire for the same upload: Vercel Blob's
 * `onUploadCompleted` webhook in production, and the browser once `upload()`
 * resolves (the webhook cannot reach a laptop, so local development relies on
 * the second path). It is therefore idempotent — matching on the blob pathname,
 * which is unique per upload because every upload carries a random suffix.
 */

export type RegisterInput = {
  folderId: string
  blobUrl: string
  pathname: string
  fileName: string
  contentType?: string | null
  sizeBytes?: number | null
  uploadedBy: string
}

export type RegisterResult =
  | { status: 'created'; documentId: string; title: string }
  | { status: 'existing'; documentId: string; title: string }
  | { status: 'error'; message: string }

export async function registerUploadedBlob(input: RegisterInput): Promise<RegisterResult> {
  const [folder] = await db.select().from(folders).where(eq(folders.id, input.folderId)).limit(1)
  if (!folder) return { status: 'error', message: 'That folder no longer exists.' }

  const [existing] = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(eq(documents.blobPath, input.pathname))
    .limit(1)

  if (existing) {
    return { status: 'existing', documentId: existing.id, title: existing.title }
  }

  const [orderRow] = await db
    .select({ top: max(documents.sortOrder) })
    .from(documents)
    .where(eq(documents.folderId, input.folderId))
  const sortOrder = Number(orderRow?.top ?? -1) + 1

  const mimeType = input.contentType?.trim() || mimeFromFileName(input.fileName)
  const kind = detectKind(input.fileName, mimeType)

  // Page count needs the bytes. Fetching them back costs one round trip and
  // only happens for PDFs, where the count drives the reading-completion
  // figure in the console. A failure here must not lose the upload.
  let pageCount: number | null = null
  let sizeBytes = Math.max(0, Math.round(input.sizeBytes ?? 0))
  if (kind === 'pdf' || sizeBytes === 0) {
    try {
      // The store is private, so the bytes come back through `get()` with the
      // store token rather than a plain fetch of the URL, which would 401.
      const result = await get(input.pathname, { access: 'private' })
      if (result?.statusCode === 200 && result.stream) {
        const buffer = Buffer.from(await new Response(result.stream).arrayBuffer())
        if (sizeBytes === 0) sizeBytes = buffer.byteLength
        if (kind === 'pdf') pageCount = bestEffortPdfPageCount(buffer)
      }
    } catch (error) {
      console.error('[blob] could not inspect uploaded file', input.pathname, error)
    }
  }

  const now = new Date()
  const [created] = await db
    .insert(documents)
    .values({
      folderId: input.folderId,
      title: titleFromFileName(input.fileName),
      fileName: input.fileName,
      blobPath: input.pathname,
      blobUrl: input.blobUrl,
      mimeType,
      kind,
      sizeBytes,
      pageCount,
      sortOrder,
      uploadedBy: input.uploadedBy,
      contentUpdatedAt: now,
    })
    .returning({ id: documents.id, title: documents.title })

  if (!created) return { status: 'error', message: 'Could not record that upload.' }

  await recordEvent({
    type: 'document_uploaded',
    actor: 'admin',
    documentId: created.id,
    label: created.title,
    metadata: { folder: folder.name, sizeBytes, kind },
  })

  return { status: 'created', documentId: created.id, title: created.title }
}

/** Guards the folder id coming off an untrusted client token payload. */
export async function folderExists(folderId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId)))
    .limit(1)
  return Boolean(row)
}
