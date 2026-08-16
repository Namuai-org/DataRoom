import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { registerUploadedBlob, folderExists } from '@/app/api/blob/_register'
// One source of truth for the ceiling: the uploader checks it before starting,
// and the token below enforces it, so the two can never disagree.
import { MAX_UPLOAD_BYTES, isAllowedFile } from '@/app/admin/_lib/upload-policy'

export const runtime = 'nodejs'

/**
 * Issues short-lived tokens so the browser uploads straight to Blob storage.
 *
 * A Server Action cannot carry these files: Next caps an action body at 1 MB
 * and Vercel caps any serverless request at 4.5 MB, while the investor deck
 * alone is 13 MB. Uploading direct from the browser removes the ceiling
 * entirely and never routes the bytes through our own function.
 *
 * The security shape is worth being explicit about, because the two callbacks
 * run in different worlds:
 *
 *   onBeforeGenerateToken — the admin's own request, cookies present. This is
 *     where authorisation happens, and the only place it can happen. The token
 *     it returns is scoped to one pathname and expires.
 *
 *   onUploadCompleted — a webhook from Vercel's servers. No cookies, no admin.
 *     It is signed by Blob and verified inside handleUpload, but it must not be
 *     trusted to say who is uploading: everything it needs is read back out of
 *     the tokenPayload minted above.
 */

const payloadSchema = z.object({
  folderId: z.uuid(),
  uploadedBy: z.string().email(),
})

/**
 * Mirrors ALLOWED_EXTENSIONS in `_lib/upload-policy.ts`. Deliberately excludes
 * `text/html` and `image/svg+xml`: both are active content a browser will
 * execute, and the extension allow-list already refuses them, so accepting them
 * here would only let the two gates disagree.
 */
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/rtf',
  'text/rtf',
  'text/csv',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/zip',
  'application/octet-stream',
]

export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ error: 'Malformed request.' }, { status: 400 })
  }

  try {
    const result = await handleUpload({
      request,
      body,

      async onBeforeGenerateToken(pathname, clientPayload) {
        // The only authorisation gate. Everything downstream trusts what is
        // sealed into tokenPayload here.
        const admin = await requireAdmin()
        if (!admin) throw new Error('Not signed in.')

        const parsed = payloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null,
        )
        if (!parsed.success) throw new Error('Choose a folder to upload into.')
        if (!(await folderExists(parsed.data.folderId))) {
          throw new Error('That folder no longer exists.')
        }

        // The same extension allow-list the rest of the app enforces. Without
        // this the content-type list below was the only filter, and the two
        // disagreed — an .html or .svg would have been accepted here and
        // refused everywhere else.
        const fileName = pathname.split('/').pop() ?? pathname
        if (!isAllowedFile(fileName)) {
          throw new Error('That file type is not accepted.')
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // A random suffix makes the stored URL unguessable. The bytes are
          // still only ever served through /api/documents/[id]/content, which
          // checks the reader's permissions first — this is defence in depth,
          // not the access control itself.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            folderId: parsed.data.folderId,
            // The admin's own address, not anything the client claimed.
            uploadedBy: admin.email,
            fileName: pathname.split('/').pop() ?? pathname,
          }),
        }
      },

      async onUploadCompleted({ blob, tokenPayload }) {
        // Runs as a webhook, so it cannot reach a laptop. Locally the browser
        // registers the upload instead; both paths are idempotent on pathname.
        if (!tokenPayload) return
        try {
          const claims = JSON.parse(tokenPayload) as {
            folderId: string
            uploadedBy: string
            fileName: string
          }
          await registerUploadedBlob({
            folderId: claims.folderId,
            blobUrl: blob.url,
            pathname: blob.pathname,
            fileName: claims.fileName,
            contentType: blob.contentType,
            sizeBytes: null,
            uploadedBy: claims.uploadedBy,
          })
        } catch (error) {
          console.error('[blob] onUploadCompleted failed', error)
          // Rethrowing would make Blob retry, and the client fallback already
          // covers this. Swallow so a duplicate webhook cannot loop.
        }
      },
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload could not be authorised.'
    return Response.json({ error: message }, { status: 400 })
  }
}
