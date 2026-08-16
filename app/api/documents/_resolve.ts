import 'server-only'
import { eq } from 'drizzle-orm'
import { db, documents, folders } from '@/lib/db'
import { requireVisitor, canSeeDocument, canSeeFolder } from '@/lib/auth'
import type { AccessLink, Document, Folder, Visitor } from '@/lib/db/schema'
import type { VisitorSession } from '@/lib/auth'
import { mimeFromFileName } from '@/lib/utils'

/**
 * Shared authorisation + lookup for the two document byte routes.
 *
 * Both `/content` and `/download` must answer the same three questions before a
 * single byte moves: is this a real visitor, does the document exist and is it
 * visible, and does this visitor's link admit the folder it lives in. Keeping
 * that in one place means the two routes cannot drift apart.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every response from these routes is private and must never be cached. */
export const NO_STORE = 'private, no-store, max-age=0, must-revalidate'

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { 'Cache-Control': NO_STORE } },
  )
}

export type ResolvedDocument = {
  doc: Document
  folder: Folder
  session: VisitorSession
  link: AccessLink
  visitor: Visitor
}

export type Resolution =
  | { ok: true; value: ResolvedDocument }
  | { ok: false; response: Response }

export async function resolveDocumentForVisitor(id: string): Promise<Resolution> {
  const auth = await requireVisitor()
  if (!auth) {
    return {
      ok: false,
      response: jsonError(401, 'Your session has expired. Open your invitation link again.'),
    }
  }

  // A malformed id would otherwise reach Postgres as an invalid uuid literal
  // and surface as a 500. Treat it as "not found" — which is also what it is.
  if (!UUID_RE.test(id)) {
    return { ok: false, response: jsonError(404, 'Document not found.') }
  }

  const rows = await db
    .select({ doc: documents, folder: folders })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(eq(documents.id, id))
    .limit(1)

  const row = rows[0]
  // Hidden documents and hidden folders are indistinguishable from missing
  // ones, so probing ids reveals nothing about what the room contains.
  if (!row || row.doc.isHidden || row.folder.isHidden) {
    return { ok: false, response: jsonError(404, 'Document not found.') }
  }

  // Two separate gates, deliberately not collapsed. The folder allow-list
  // answers "is this section yours"; the disclosure tier answers "are you far
  // enough along to read it". A link raised to a folder must still clear the
  // tier, and `canSeeDocument` is the same check `lib/room.ts` runs for the
  // pages — so a document that never appears in a listing cannot be streamed by
  // guessing its id either.
  if (!canSeeFolder(auth.link, row.doc.folderId)) {
    return {
      ok: false,
      response: jsonError(403, 'This document is not part of your access.'),
    }
  }

  if (!canSeeDocument(auth.link, row.doc, row.folder)) {
    return {
      ok: false,
      response: jsonError(403, 'This document is not part of your access yet.'),
    }
  }

  return {
    ok: true,
    value: {
      doc: row.doc,
      folder: row.folder,
      session: auth.session,
      link: auth.link,
      visitor: auth.visitor,
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Header helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Strips anything that could split a header, then falls back to the filename. */
export function safeContentType(doc: Pick<Document, 'mimeType' | 'fileName'>): string {
  const raw = (doc.mimeType ?? '').replace(/[\r\n]/g, '').trim()
  if (!raw || !/^[\w.+-]+\/[\w.+-]+/.test(raw)) return mimeFromFileName(doc.fileName)
  return raw
}

/**
 * RFC 5987 / RFC 6266 content disposition. The ASCII form is the compatibility
 * fallback; `filename*` carries the real name for anything non-Latin.
 */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const clean = fileName.replace(/[\r\n"\\]/g, '_').trim() || 'document'
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}
