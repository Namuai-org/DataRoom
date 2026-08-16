import 'server-only'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import {
  db,
  accessLinks,
  admins,
  documents,
  events,
  folders,
  ndaAcceptances,
  visitors,
  type AccessLink,
  type Document,
  type Folder,
  type NdaAcceptance,
  type Visitor,
} from '@/lib/db'

/**
 * Console-only reads that `lib/analytics.ts` does not cover: content
 * management, the invite ledger, and a genuinely paginated audit trail.
 * Analytics owns the aggregate numbers; this file owns the records.
 */

/* -------------------------------------------------------------------------- */
/*  Content                                                                    */
/* -------------------------------------------------------------------------- */

export type FolderWithDocuments = Folder & { documents: Document[] }

export async function getFolderTree(): Promise<FolderWithDocuments[]> {
  const folderRows = await db
    .select()
    .from(folders)
    .orderBy(asc(folders.sortOrder), asc(folders.name))

  const documentRows = await db
    .select()
    .from(documents)
    .orderBy(asc(documents.sortOrder), asc(documents.title))

  const byFolder = new Map<string, Document[]>()
  for (const doc of documentRows) {
    const list = byFolder.get(doc.folderId)
    if (list) list.push(doc)
    else byFolder.set(doc.folderId, [doc])
  }

  return folderRows.map((folder) => ({ ...folder, documents: byFolder.get(folder.id) ?? [] }))
}

export async function listFolders(): Promise<Folder[]> {
  return db.select().from(folders).orderBy(asc(folders.sortOrder), asc(folders.name))
}

/* -------------------------------------------------------------------------- */
/*  Invites                                                                    */
/* -------------------------------------------------------------------------- */

export type InviteRow = {
  link: AccessLink
  visitor: Visitor
  sessionCount: number
}

export async function getInviteRows(): Promise<InviteRow[]> {
  const rows = await db
    .select({
      link: accessLinks,
      visitor: visitors,
      sessionCount: sql<number>`(SELECT COUNT(*) FROM sessions WHERE sessions.access_link_id = ${accessLinks.id})`,
    })
    .from(accessLinks)
    .innerJoin(visitors, eq(accessLinks.visitorId, visitors.id))
    .orderBy(desc(accessLinks.createdAt))

  return rows.map((r) => ({ ...r, sessionCount: Number(r.sessionCount ?? 0) }))
}

import type { InviteStatus } from './view-types'
export type { InviteStatus }

export function inviteStatus(link: {
  revokedAt: Date | null
  expiresAt: Date | null
  firstOpenedAt: Date | null
}): InviteStatus {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return 'expired'
  if (!link.firstOpenedAt) return 'unopened'
  return 'active'
}

/* -------------------------------------------------------------------------- */
/*  One visitor                                                                */
/* -------------------------------------------------------------------------- */

export type VisitorRecord = {
  visitor: Visitor
  links: AccessLink[]
  ndas: NdaAcceptance[]
}

export async function getVisitorRecord(visitorId: string): Promise<VisitorRecord | null> {
  const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId)).limit(1)
  if (!visitor) return null

  const links = await db
    .select()
    .from(accessLinks)
    .where(eq(accessLinks.visitorId, visitorId))
    .orderBy(desc(accessLinks.createdAt))

  const ndas = await db
    .select()
    .from(ndaAcceptances)
    .where(eq(ndaAcceptances.visitorId, visitorId))
    .orderBy(desc(ndaAcceptances.acceptedAt))

  return { visitor, links, ndas }
}

/* -------------------------------------------------------------------------- */
/*  Audit trail                                                                */
/* -------------------------------------------------------------------------- */

export type AuditRow = {
  id: string
  type: string
  actor: string
  label: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  country: string | null
  createdAt: Date
  visitorId: string | null
  visitorEmail: string | null
  visitorName: string | null
  documentTitle: string | null
}

export type AuditPage = {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/**
 * A real page of the audit trail. `getRecentEvents()` in lib/analytics is a
 * head-of-list read for the dashboard feed; the activity page needs an offset
 * and a type filter pushed into SQL so the trail stays usable once the table is
 * long.
 */
export async function getEventPage(input: {
  page: number
  pageSize: number
  type?: string | null
  actor?: string | null
}): Promise<AuditPage> {
  const pageSize = Math.min(Math.max(input.pageSize, 10), 200)
  const filters = [
    input.type ? eq(events.type, input.type) : undefined,
    input.actor ? eq(events.actor, input.actor) : undefined,
  ].filter((f): f is NonNullable<typeof f> => Boolean(f))
  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db.select({ n: count() }).from(events).where(where)
  const total = Number(totalRow?.n ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(input.page, 1), pageCount)

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      actor: events.actor,
      label: events.label,
      metadata: events.metadata,
      ip: events.ip,
      country: events.country,
      createdAt: events.createdAt,
      visitorId: events.visitorId,
      visitorEmail: visitors.email,
      visitorName: visitors.name,
      documentTitle: documents.title,
    })
    .from(events)
    .leftJoin(visitors, eq(events.visitorId, visitors.id))
    .leftJoin(documents, eq(events.documentId, documents.id))
    .where(where)
    .orderBy(desc(events.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { rows, total, page, pageSize, pageCount }
}

export async function getEventTypeCounts(): Promise<{ type: string; n: number }[]> {
  const rows = await db
    .select({ type: events.type, n: count() })
    .from(events)
    .groupBy(events.type)
    .orderBy(desc(count()))
  return rows.map((r) => ({ type: r.type, n: Number(r.n) }))
}

/* -------------------------------------------------------------------------- */
/*  Admins                                                                     */
/* -------------------------------------------------------------------------- */

export async function listAdmins() {
  return db
    .select({
      id: admins.id,
      email: admins.email,
      name: admins.name,
      isOwner: admins.isOwner,
      lastLoginAt: admins.lastLoginAt,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(desc(admins.isOwner), asc(admins.email))
}

/* -------------------------------------------------------------------------- */
/*  Room shape — used to choose the right empty state                          */
/* -------------------------------------------------------------------------- */

export async function getRoomShape(): Promise<{
  folders: number
  documents: number
  visitors: number
  links: number
}> {
  const [f] = await db.select({ n: count() }).from(folders)
  const [d] = await db.select({ n: count() }).from(documents)
  const [v] = await db.select({ n: count() }).from(visitors)
  const [l] = await db.select({ n: count() }).from(accessLinks)
  return {
    folders: Number(f?.n ?? 0),
    documents: Number(d?.n ?? 0),
    visitors: Number(v?.n ?? 0),
    links: Number(l?.n ?? 0),
  }
}
