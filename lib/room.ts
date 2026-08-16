import 'server-only'
import { db } from '@/lib/db'
import { folders, documents, documentViews, questions } from '@/lib/db/schema'
import { eq, and, asc, desc, inArray, sql } from 'drizzle-orm'
import { canSeeFolder, canSeeDocument } from '@/lib/auth'
import { resolveTier, tierVisible, type AccessLink } from '@/lib/db/schema'
import { readSettings } from '@/app/admin/_lib/settings'

/**
 * Every read a visitor performs goes through here, so folder permissions and
 * disclosure tiers are enforced in one place rather than re-implemented per
 * page. Nothing in this module trusts a client-supplied id without checking it
 * against the caller's access link.
 */

export type VisibleDocument = {
  id: string
  title: string
  description: string | null
  fileName: string
  kind: string
  mimeType: string
  sizeBytes: number
  pageCount: number | null
  tier: string
  sortOrder: number
  contentUpdatedAt: Date | null
  createdAt: Date
  downloadPolicy: string
}

export type VisibleFolder = {
  id: string
  slug: string
  name: string
  description: string | null
  sortOrder: number
  tier: string
  documentCount: number
}

/** Folders this link may see, with a count of the documents it may see inside. */
export async function getVisibleFolders(link: AccessLink): Promise<VisibleFolder[]> {
  const folderRows = await db
    .select()
    .from(folders)
    .where(eq(folders.isHidden, false))
    .orderBy(asc(folders.sortOrder), asc(folders.name))

  const permitted = folderRows.filter((f) => canSeeFolder(link, f.id))
  if (permitted.length === 0) return []

  const docRows = await db
    .select({
      folderId: documents.folderId,
      tier: documents.tier,
      folderTier: folders.tier,
    })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(
      and(
        eq(documents.isHidden, false),
        inArray(
          documents.folderId,
          permitted.map((f) => f.id),
        ),
      ),
    )

  const counts = new Map<string, number>()
  for (const doc of docRows) {
    if (!tierVisible(link.tier, resolveTier(doc, { tier: doc.folderTier }))) continue
    counts.set(doc.folderId, (counts.get(doc.folderId) ?? 0) + 1)
  }

  return permitted.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    description: f.description,
    sortOrder: f.sortOrder,
    tier: f.tier,
    documentCount: counts.get(f.id) ?? 0,
  }))
}

/** One folder plus the documents inside it this link may see. */
export async function getFolderWithDocuments(
  link: AccessLink,
  slug: string,
): Promise<{ folder: VisibleFolder; documents: VisibleDocument[] } | null> {
  const [folder] = await db.select().from(folders).where(eq(folders.slug, slug)).limit(1)
  if (!folder || folder.isHidden) return null
  if (!canSeeFolder(link, folder.id)) return null

  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.folderId, folder.id), eq(documents.isHidden, false)))
    .orderBy(asc(documents.sortOrder), asc(documents.title))

  const visible = docRows
    .filter((d) => tierVisible(link.tier, resolveTier(d, folder)))
    .map(toVisibleDocument)

  return {
    folder: {
      id: folder.id,
      slug: folder.slug,
      name: folder.name,
      description: folder.description,
      sortOrder: folder.sortOrder,
      tier: folder.tier,
      documentCount: visible.length,
    },
    documents: visible,
  }
}

/** A single document, with its folder, only if this link may see it. */
export async function getDocumentForVisitor(
  link: AccessLink,
  documentId: string,
): Promise<{ document: VisibleDocument; folder: VisibleFolder } | null> {
  if (!isUuid(documentId)) return null

  const rows = await db
    .select({ doc: documents, folder: folders })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(eq(documents.id, documentId))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (!canSeeDocument(link, row.doc, row.folder)) return null

  return {
    document: toVisibleDocument(row.doc),
    folder: {
      id: row.folder.id,
      slug: row.folder.slug,
      name: row.folder.name,
      description: row.folder.description,
      sortOrder: row.folder.sortOrder,
      tier: row.folder.tier,
      documentCount: 0,
    },
  }
}

/** Full-text-ish search across the titles and descriptions this link may see. */
export async function searchDocuments(
  link: AccessLink,
  query: string,
): Promise<(VisibleDocument & { folderName: string; folderSlug: string })[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const pattern = `%${trimmed.replace(/[%_]/g, (c) => `\\${c}`)}%`

  const rows = await db
    .select({ doc: documents, folder: folders })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(
      and(
        eq(documents.isHidden, false),
        eq(folders.isHidden, false),
        sql`(${documents.title} ILIKE ${pattern} OR ${documents.description} ILIKE ${pattern} OR ${documents.fileName} ILIKE ${pattern} OR ${folders.name} ILIKE ${pattern})`,
      ),
    )
    .orderBy(asc(documents.sortOrder))
    .limit(40)

  return rows
    .filter((r) => canSeeDocument(link, r.doc, r.folder))
    .map((r) => ({
      ...toVisibleDocument(r.doc),
      folderName: r.folder.name,
      folderSlug: r.folder.slug,
    }))
}

/**
 * What has changed since this visitor was last here. Returning investors ask
 * "what's new?" and this answers it without them having to hunt.
 */
export async function getWhatsNew(
  link: AccessLink,
  visitorId: string,
): Promise<{ since: Date | null; documents: (VisibleDocument & { folderSlug: string; folderName: string })[] }> {
  const [lastView] = await db
    .select({ at: documentViews.openedAt })
    .from(documentViews)
    .where(eq(documentViews.visitorId, visitorId))
    .orderBy(desc(documentViews.openedAt))
    .limit(1)

  const since = lastView?.at ?? null
  if (!since) return { since: null, documents: [] }

  const rows = await db
    .select({ doc: documents, folder: folders })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(and(eq(documents.isHidden, false), eq(folders.isHidden, false)))
    .orderBy(desc(documents.createdAt))
    .limit(60)

  const fresh = rows
    .filter((r) => canSeeDocument(link, r.doc, r.folder))
    .filter((r) => {
      const changed = r.doc.contentUpdatedAt ?? r.doc.createdAt
      return changed.getTime() > since.getTime()
    })
    .map((r) => ({
      ...toVisibleDocument(r.doc),
      folderSlug: r.folder.slug,
      folderName: r.folder.name,
    }))

  return { since, documents: fresh }
}

/** Documents this visitor has already opened, for the "continue" affordance. */
export async function getVisitorProgress(visitorId: string): Promise<
  Map<string, { activeMs: number; completion: number; lastSeenAt: Date }>
> {
  const rows = await db
    .select({
      documentId: documentViews.documentId,
      activeMs: sql<number>`SUM(${documentViews.activeMs})`,
      completion: sql<number>`MAX(${documentViews.completion})`,
      lastSeenAt: sql<Date>`MAX(${documentViews.lastSeenAt})`,
    })
    .from(documentViews)
    .where(eq(documentViews.visitorId, visitorId))
    .groupBy(documentViews.documentId)

  return new Map(
    rows.map((r) => [
      r.documentId,
      {
        activeMs: Number(r.activeMs ?? 0),
        completion: Number(r.completion ?? 0),
        lastSeenAt: r.lastSeenAt,
      },
    ]),
  )
}

/** Q&A threads this visitor may see: their own, plus published answers. */
export async function getVisitorQuestions(visitorId: string) {
  return db
    .select()
    .from(questions)
    .where(
      sql`(${questions.visitorId} = ${visitorId}) OR (${questions.isPublic} = TRUE AND ${questions.status} = 'answered')`,
    )
    .orderBy(desc(questions.createdAt))
    .limit(100)
}

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Room configuration as the visitor-facing pages need it.
 *
 * The canonical reader lives in `app/admin/_lib/settings.ts` — that module owns
 * the key names, the defaults and the defensive coercion. This re-exports it
 * under the name the room pages use, so the console and the room can never
 * disagree about what a setting means.
 */
export const getRoomSettings = readSettings

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toVisibleDocument(d: typeof documents.$inferSelect): VisibleDocument {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    fileName: d.fileName,
    kind: d.kind,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    tier: d.tier,
    sortOrder: d.sortOrder,
    contentUpdatedAt: d.contentUpdatedAt,
    createdAt: d.createdAt,
    downloadPolicy: d.downloadPolicy,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
