'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, max, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { del, put } from '@vercel/blob'
import { db, documents, folders } from '@/lib/db'
import { TIERS } from '@/lib/db/schema'
import { recordEvent } from '@/lib/analytics'
import { detectKind, mimeFromFileName, titleFromFileName } from '@/lib/utils'
import { FOLDER_BLUEPRINT } from '@/lib/brand'
import { requireAdminAction } from '../_lib/guard'
import { bestEffortPdfPageCount } from '../_lib/pdf'
import { registerUploadedBlob } from '@/app/api/blob/_register'
import {
  MAX_UPLOAD_BYTES,
  PRACTICAL_LIMIT_BYTES,
  extensionOf,
  isAllowedFile,
  safePathSegment,
} from '../_lib/upload-policy'
import { fail, fromError, type ActionState } from '../_lib/action-state'

/*
 * A file marked `'use server'` may only export async functions, so the upload
 * limits and the extension allow-list live in ../_lib/upload-policy.ts — where
 * the uploader UI can read the same numbers this action enforces.
 */

/* -------------------------------------------------------------------------- */
/*  Upload                                                                     */
/* -------------------------------------------------------------------------- */

const registerSchema = z.object({
  folderId: z.uuid(),
  blobUrl: z.url(),
  pathname: z.string().min(1).max(1024),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(200).optional(),
  sizeBytes: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES).optional(),
})

/**
 * Records a browser-uploaded file, called once `upload()` resolves.
 *
 * In production Vercel Blob also fires an `onUploadCompleted` webhook that does
 * the same work; that webhook cannot reach a laptop, so this is the path local
 * development uses, and the safety net if the webhook is ever lost. Both share
 * `registerUploadedBlob`, which is idempotent on the blob pathname, so the two
 * firing together produces one document rather than two.
 */
export async function registerClientUpload(
  input: z.input<typeof registerSchema>,
): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()

    const parsed = registerSchema.safeParse(input)
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'That upload could not be recorded.')
    }

    // A blob URL is attacker-supplied text until proven otherwise. Requiring
    // the Vercel Blob host stops an admin session being used to point a
    // document row at an arbitrary URL the room would then stream.
    const host = new URL(parsed.data.blobUrl).hostname
    if (!host.endsWith('.blob.vercel-storage.com')) {
      return fail('That file was not uploaded to this room’s storage.')
    }

    const result = await registerUploadedBlob({
      folderId: parsed.data.folderId,
      blobUrl: parsed.data.blobUrl,
      pathname: parsed.data.pathname,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType ?? null,
      sizeBytes: parsed.data.sizeBytes ?? null,
      uploadedBy: admin.email,
    })

    if (result.status === 'error') return fail(result.message)

    revalidatePath('/admin/documents')
    revalidatePath('/admin/diligence')
    return {
      status: 'success',
      message:
        result.status === 'created'
          ? `${result.title} added.`
          : `${result.title} was already filed.`,
    }
  } catch (error) {
    console.error('[admin] registerClientUpload failed', error)
    return fromError(error, 'Could not record that upload.')
  }
}

export async function uploadDocuments(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()

    const folderId = z
      .uuid('Choose a folder to upload into.')
      .parse(String(formData.get('folderId') ?? ''))

    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1)
    if (!folder) return fail('That folder no longer exists.')

    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return fail('Choose at least one file.')

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return fail(
        'Blob storage is not connected. Create a Blob store in the Vercel dashboard, then pull the env vars with `vercel env pull .env.local`.',
      )
    }

    const [orderRow] = await db
      .select({ top: max(documents.sortOrder) })
      .from(documents)
      .where(eq(documents.folderId, folderId))
    let nextOrder = Number(orderRow?.top ?? -1) + 1

    const uploaded: string[] = []
    const refused: string[] = []

    for (const file of files) {
      const extension = extensionOf(file.name)

      if (!isAllowedFile(file.name)) {
        refused.push(`${file.name} — ${extension ? `.${extension}` : 'no extension'} is not accepted`)
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        refused.push(`${file.name} — larger than 50 MB`)
        continue
      }

      // Buffer rather than Uint8Array: @vercel/blob's PutBody accepts
      // Blob | Buffer | File | Readable | ReadableStream, and Buffer is also a
      // Uint8Array so the page-count scan can read the same bytes.
      const bytes = Buffer.from(await file.arrayBuffer())
      const mimeType = file.type?.trim() || mimeFromFileName(file.name)
      const kind = detectKind(file.name, mimeType)
      const pathname = `documents/${folder.slug}/${safePathSegment(file.name)}`

      // access: 'public' with a random suffix. The pathname is unguessable and
      // is never handed to the browser — documents are streamed through an
      // authorised route that checks the visitor's link first. A private blob
      // would also work but would require every reader of `blobUrl` to hold the
      // store token, which is a wider contract than this table implies.
      const blob = await put(pathname, bytes, {
        access: 'public',
        addRandomSuffix: true,
        contentType: mimeType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })

      const pageCount = kind === 'pdf' ? bestEffortPdfPageCount(bytes) : null

      const [row] = await db
        .insert(documents)
        .values({
          folderId,
          title: titleFromFileName(file.name),
          fileName: file.name,
          blobPath: blob.pathname,
          blobUrl: blob.url,
          mimeType,
          kind,
          sizeBytes: file.size,
          pageCount,
          sortOrder: nextOrder++,
          uploadedBy: admin.email,
        })
        .returning({ id: documents.id, title: documents.title })

      if (row) {
        uploaded.push(row.title)
        await recordEvent({
          type: 'document_uploaded',
          actor: 'admin',
          documentId: row.id,
          label: row.title,
          metadata: { folder: folder.name, sizeBytes: file.size, pageCount, by: admin.email },
        })
      }
    }

    revalidatePath('/admin/documents')
    revalidatePath('/admin')

    if (uploaded.length === 0) {
      return fail(refused.length ? `Nothing uploaded. ${refused.join('; ')}.` : 'Nothing uploaded.')
    }

    const summary = `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} added to ${folder.name}.`
    return {
      status: 'success',
      message: refused.length ? `${summary} Refused: ${refused.join('; ')}.` : summary,
    }
  } catch (error) {
    console.error('[admin] uploadDocuments failed', error)
    const message = error instanceof Error ? error.message : ''
    if (/body.*(exceeded|too large)|413|payload/i.test(message)) {
      return fail(
        `That file is too large for this upload path (about ${Math.round(
          PRACTICAL_LIMIT_BYTES / 1024 / 1024,
        )} MB). Raise experimental.serverActions.bodySizeLimit in next.config.ts, or add a client-upload route.`,
      )
    }
    return fromError(error, 'The upload failed. Nothing was saved.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Document settings                                                          */
/* -------------------------------------------------------------------------- */

const documentSchema = z.object({
  documentId: z.uuid(),
  title: z.string().trim().min(1, 'A document needs a title.').max(200),
  description: z.string().trim().max(1000).nullable(),
  downloadPolicy: z.enum(['inherit', 'never', 'allow']),
  isHidden: z.boolean(),
})

export async function updateDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()

    const description = String(formData.get('description') ?? '').trim()
    const parsed = documentSchema.safeParse({
      documentId: String(formData.get('documentId') ?? ''),
      title: String(formData.get('title') ?? ''),
      description: description === '' ? null : description,
      downloadPolicy: String(formData.get('downloadPolicy') ?? 'inherit'),
      isHidden: formData.get('isHidden') === 'on' || formData.get('isHidden') === 'true',
    })

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Check the document details.')
    }

    const { documentId, ...fields } = parsed.data
    const updated = await db
      .update(documents)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id })

    if (updated.length === 0) return fail('That document no longer exists.')

    revalidatePath('/admin/documents')
    return { status: 'success', message: 'Document updated.' }
  } catch (error) {
    console.error('[admin] updateDocument failed', error)
    return fromError(error, 'Could not update that document.')
  }
}

export async function setDocumentVisibility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAction()
    const documentId = z.uuid().parse(String(formData.get('documentId') ?? ''))
    const isHidden = formData.get('isHidden') === 'true'

    const updated = await db
      .update(documents)
      .set({ isHidden, updatedAt: new Date() })
      .where(eq(documents.id, documentId))
      .returning({ title: documents.title })

    if (updated.length === 0) return fail('That document no longer exists.')

    revalidatePath('/admin/documents')
    return {
      status: 'success',
      message: isHidden
        ? `${updated[0]!.title} is hidden from visitors.`
        : `${updated[0]!.title} is visible to visitors.`,
    }
  } catch (error) {
    console.error('[admin] setDocumentVisibility failed', error)
    return fromError(error, 'Could not change visibility.')
  }
}

export async function deleteDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()
    const documentId = z.uuid().parse(String(formData.get('documentId') ?? ''))

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
    if (!doc) return fail('That document no longer exists.')

    await db.delete(documents).where(eq(documents.id, documentId))

    // The row is the source of truth for the room, so it goes first. A blob
    // that outlives its row is wasted storage, not a leak — it is unreachable
    // without the row — so a failure here is logged, not surfaced.
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(doc.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
      }
    } catch (blobError) {
      console.error('[admin] blob delete failed for', doc.blobPath, blobError)
    }

    await recordEvent({
      type: 'document_deleted',
      actor: 'admin',
      label: doc.title,
      metadata: { fileName: doc.fileName, by: admin.email },
    })

    revalidatePath('/admin/documents')
    revalidatePath('/admin')
    return { status: 'success', message: `${doc.title} deleted.` }
  } catch (error) {
    console.error('[admin] deleteDocument failed', error)
    return fromError(error, 'Could not delete that document.')
  }
}

/** Swaps a document with its neighbour inside the same folder. */
export async function moveDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()
    const documentId = z.uuid().parse(String(formData.get('documentId') ?? ''))
    const direction = String(formData.get('direction') ?? '') === 'up' ? -1 : 1

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
    if (!doc) return fail('That document no longer exists.')

    const siblings = await db
      .select({ id: documents.id, sortOrder: documents.sortOrder })
      .from(documents)
      .where(eq(documents.folderId, doc.folderId))
      .orderBy(asc(documents.sortOrder), asc(documents.title))

    const index = siblings.findIndex((s) => s.id === documentId)
    const target = siblings[index + direction]
    if (index === -1 || !target) return { status: 'success', message: '' }

    // Rewrite the whole folder's order rather than swapping two values: rows
    // seeded outside the console can share a sortOrder, and a swap between two
    // equal numbers is a no-op the admin would read as a broken button.
    const reordered = [...siblings]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return { status: 'success', message: '' }
    reordered.splice(index + direction, 0, moved)

    for (const [position, row] of reordered.entries()) {
      await db.update(documents).set({ sortOrder: position }).where(eq(documents.id, row.id))
    }

    revalidatePath('/admin/documents')
    return { status: 'success', message: '' }
  } catch (error) {
    console.error('[admin] moveDocument failed', error)
    return fromError(error, 'Could not reorder that document.')
  }
}

/* -------------------------------------------------------------------------- */
/*  Folders                                                                    */
/* -------------------------------------------------------------------------- */

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/^\d+\s*[-–]\s*/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'folder'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = await db.select({ slug: folders.slug }).from(folders)
  const taken = new Set(existing.map((f) => f.slug))
  if (!taken.has(base)) return base
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

const folderSchema = z.object({
  name: z.string().trim().min(1, 'A folder needs a name.').max(120),
  description: z.string().trim().max(500).nullable(),
})

export async function createFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()

    const description = String(formData.get('description') ?? '').trim()
    const parsed = folderSchema.safeParse({
      name: String(formData.get('name') ?? ''),
      description: description === '' ? null : description,
    })

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Give the folder a name.')
    }

    const [orderRow] = await db.select({ top: max(folders.sortOrder) }).from(folders)
    const slug = await uniqueSlug(slugify(parsed.data.name))

    await db.insert(folders).values({
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: Number(orderRow?.top ?? -1) + 1,
    })

    revalidatePath('/admin/documents')
    revalidatePath('/admin/invites')
    return { status: 'success', message: `${parsed.data.name} created.` }
  } catch (error) {
    console.error('[admin] createFolder failed', error)
    return fromError(error, 'Could not create that folder.')
  }
}

export async function updateFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()
    const folderId = z.uuid().parse(String(formData.get('folderId') ?? ''))

    const description = String(formData.get('description') ?? '').trim()
    const parsed = folderSchema.safeParse({
      name: String(formData.get('name') ?? ''),
      description: description === '' ? null : description,
    })
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Give the folder a name.')

    const isHidden = formData.get('isHidden') === 'on' || formData.get('isHidden') === 'true'

    // The disclosure stage is optional on the form: a caller that does not send
    // it leaves the folder where it is rather than silently resetting it.
    const rawTier = String(formData.get('tier') ?? '')
    const tier = (TIERS as readonly string[]).includes(rawTier) ? rawTier : undefined

    const updated = await db
      .update(folders)
      .set({
        name: parsed.data.name,
        description: parsed.data.description,
        isHidden,
        ...(tier ? { tier } : {}),
      })
      .where(eq(folders.id, folderId))
      .returning({ id: folders.id })

    if (updated.length === 0) return fail('That folder no longer exists.')

    revalidatePath('/admin/documents')
    revalidatePath('/admin/invites')
    return { status: 'success', message: 'Folder updated.' }
  } catch (error) {
    console.error('[admin] updateFolder failed', error)
    return fromError(error, 'Could not update that folder.')
  }
}

export async function deleteFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdminAction()
    const folderId = z.uuid().parse(String(formData.get('folderId') ?? ''))

    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1)
    if (!folder) return fail('That folder no longer exists.')

    const contents = await db
      .select({ id: documents.id, blobUrl: documents.blobUrl, title: documents.title })
      .from(documents)
      .where(eq(documents.folderId, folderId))

    if (contents.length > 0) {
      return fail(
        `${folder.name} still holds ${contents.length} document${
          contents.length === 1 ? '' : 's'
        }. Delete or move them first.`,
      )
    }

    const [child] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.parentId, folderId), ne(folders.id, folderId)))
      .limit(1)
    if (child) return fail(`${folder.name} still has sub-folders.`)

    await db.delete(folders).where(eq(folders.id, folderId))

    await recordEvent({
      type: 'settings_changed',
      actor: 'admin',
      label: `Folder deleted: ${folder.name}`,
      metadata: { by: admin.email },
    })

    revalidatePath('/admin/documents')
    revalidatePath('/admin/invites')
    return { status: 'success', message: `${folder.name} deleted.` }
  } catch (error) {
    console.error('[admin] deleteFolder failed', error)
    return fromError(error, 'Could not delete that folder.')
  }
}

export async function moveFolder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdminAction()
    const folderId = z.uuid().parse(String(formData.get('folderId') ?? ''))
    const direction = String(formData.get('direction') ?? '') === 'up' ? -1 : 1

    const all = await db
      .select({ id: folders.id, sortOrder: folders.sortOrder })
      .from(folders)
      .orderBy(asc(folders.sortOrder), asc(folders.name))

    const index = all.findIndex((f) => f.id === folderId)
    if (index === -1 || !all[index + direction]) return { status: 'success', message: '' }

    const reordered = [...all]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return { status: 'success', message: '' }
    reordered.splice(index + direction, 0, moved)

    for (const [position, row] of reordered.entries()) {
      await db.update(folders).set({ sortOrder: position }).where(eq(folders.id, row.id))
    }

    revalidatePath('/admin/documents')
    return { status: 'success', message: '' }
  } catch (error) {
    console.error('[admin] moveFolder failed', error)
    return fromError(error, 'Could not reorder that folder.')
  }
}

/** Seeds the ten-folder blueprint into an empty room, in one click. */
export async function seedFolderBlueprint(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdminAction()

    const [existing] = await db.select({ n: sql<number>`COUNT(*)` }).from(folders)
    if (Number(existing?.n ?? 0) > 0) {
      return fail('The room already has folders. Add them one at a time instead.')
    }

    await db.insert(folders).values(
      FOLDER_BLUEPRINT.map((folder, index) => ({
        slug: folder.slug,
        name: folder.name,
        description: folder.description,
        sortOrder: index,
      })),
    )

    revalidatePath('/admin/documents')
    revalidatePath('/admin/invites')
    return { status: 'success', message: `${FOLDER_BLUEPRINT.length} folders created.` }
  } catch (error) {
    console.error('[admin] seedFolderBlueprint failed', error)
    return fromError(error, 'Could not create the folders.')
  }
}
