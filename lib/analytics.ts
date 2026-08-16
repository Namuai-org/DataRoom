import 'server-only'
import { db } from '@/lib/db'
import {
  sessions,
  documentViews,
  pageViews,
  events,
  visitors,
  documents,
  folders,
  accessLinks,
  ndaAcceptances,
} from '@/lib/db/schema'
import { and, desc, eq, gte, sql, sum, count, countDistinct, max, isNotNull } from 'drizzle-orm'

/* ========================================================================== */
/*  Recording                                                                 */
/* ========================================================================== */

export type EventType =
  | 'link_opened'
  | 'link_rejected'
  | 'nda_accepted'
  | 'room_entered'
  | 'folder_opened'
  | 'document_opened'
  | 'document_closed'
  | 'download'
  | 'print_attempt'
  | 'search'
  | 'admin_login'
  | 'admin_login_failed'
  | 'invite_created'
  | 'invite_revoked'
  | 'invite_sent'
  | 'document_uploaded'
  | 'document_deleted'
  | 'settings_changed'

export async function recordEvent(input: {
  type: EventType
  sessionId?: string | null
  visitorId?: string | null
  documentId?: string | null
  actor?: 'visitor' | 'admin' | 'system'
  label?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  country?: string | null
}): Promise<void> {
  try {
    await db.insert(events).values({
      type: input.type,
      sessionId: input.sessionId ?? null,
      visitorId: input.visitorId ?? null,
      documentId: input.documentId ?? null,
      actor: input.actor ?? 'visitor',
      label: input.label ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      country: input.country ?? null,
    })
  } catch (error) {
    // Analytics must never break the room. A failed write is logged and
    // swallowed so a visitor still sees their document.
    console.error('[analytics] failed to record event', input.type, error)
  }
}

/** Advances a session's heartbeat and accumulates real active time. */
export async function touchSession(sessionId: string, deltaMs: number): Promise<void> {
  const bounded = Math.max(0, Math.min(deltaMs, 120_000))
  await db
    .update(sessions)
    .set({
      lastSeenAt: new Date(),
      activeMs: sql`${sessions.activeMs} + ${bounded}`,
    })
    .where(eq(sessions.id, sessionId))
}

/** Advances a document view and rolls up page-level progress. */
export async function touchDocumentView(input: {
  documentViewId: string
  deltaMs: number
  currentPage?: number
  pageCount?: number | null
}): Promise<void> {
  const bounded = Math.max(0, Math.min(input.deltaMs, 120_000))

  await db
    .update(documentViews)
    .set({
      lastSeenAt: new Date(),
      activeMs: sql`${documentViews.activeMs} + ${bounded}`,
      ...(input.currentPage
        ? {
            maxPageReached: sql`GREATEST(${documentViews.maxPageReached}, ${input.currentPage})`,
          }
        : {}),
    })
    .where(eq(documentViews.id, input.documentViewId))

  if (input.currentPage) {
    await db
      .insert(pageViews)
      .values({
        documentViewId: input.documentViewId,
        documentId: (
          await db
            .select({ documentId: documentViews.documentId })
            .from(documentViews)
            .where(eq(documentViews.id, input.documentViewId))
            .limit(1)
        )[0]!.documentId,
        pageNumber: input.currentPage,
        activeMs: bounded,
      })
      .onConflictDoUpdate({
        target: [pageViews.documentViewId, pageViews.pageNumber],
        set: {
          activeMs: sql`${pageViews.activeMs} + ${bounded}`,
          updatedAt: new Date(),
        },
      })

    // Completion is the share of distinct pages actually dwelt on.
    if (input.pageCount && input.pageCount > 0) {
      await db
        .update(documentViews)
        .set({
          pagesViewed: sql`(SELECT COUNT(*) FROM ${pageViews} WHERE ${pageViews.documentViewId} = ${input.documentViewId})`,
          completion: sql`LEAST(1.0, (SELECT COUNT(*)::real FROM ${pageViews} WHERE ${pageViews.documentViewId} = ${input.documentViewId}) / ${input.pageCount})`,
        })
        .where(eq(documentViews.id, input.documentViewId))
    }
  }
}

/* ========================================================================== */
/*  Aggregate queries for the admin console                                   */
/* ========================================================================== */

export type Overview = {
  totalVisitors: number
  invitedCount: number
  activatedCount: number
  totalSessions: number
  totalActiveMs: number
  medianSessionMs: number
  documentOpens: number
  downloads: number
  ndaSigned: number
  last7dSessions: number
  newDeviceFlags: number
}

export async function getOverview(): Promise<Overview> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [visitorRow] = await db.select({ n: count() }).from(visitors)
  const [linkRow] = await db.select({ n: count() }).from(accessLinks)
  const [activatedRow] = await db
    .select({ n: count() })
    .from(accessLinks)
    .where(isNotNull(accessLinks.firstOpenedAt))
  const [sessionRow] = await db
    .select({
      n: count(),
      total: sum(sessions.activeMs),
      flagged: sql<number>`COUNT(*) FILTER (WHERE ${sessions.isNewDevice})`,
    })
    .from(sessions)
  const [recentRow] = await db
    .select({ n: count() })
    .from(sessions)
    .where(gte(sessions.startedAt, sevenDaysAgo))
  const [medianRow] = await db
    .select({
      median: sql<number>`COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${sessions.activeMs}), 0)`,
    })
    .from(sessions)
  const [docRow] = await db.select({ n: count() }).from(documentViews)
  const [downloadRow] = await db
    .select({ n: count() })
    .from(events)
    .where(eq(events.type, 'download'))
  const [ndaRow] = await db.select({ n: countDistinct(ndaAcceptances.visitorId) }).from(ndaAcceptances)

  return {
    totalVisitors: Number(visitorRow?.n ?? 0),
    invitedCount: Number(linkRow?.n ?? 0),
    activatedCount: Number(activatedRow?.n ?? 0),
    totalSessions: Number(sessionRow?.n ?? 0),
    totalActiveMs: Number(sessionRow?.total ?? 0),
    medianSessionMs: Number(medianRow?.median ?? 0),
    documentOpens: Number(docRow?.n ?? 0),
    downloads: Number(downloadRow?.n ?? 0),
    ndaSigned: Number(ndaRow?.n ?? 0),
    last7dSessions: Number(recentRow?.n ?? 0),
    newDeviceFlags: Number(sessionRow?.flagged ?? 0),
  }
}

export type VisitorSummary = {
  visitorId: string
  email: string
  name: string | null
  organization: string | null
  role: string | null
  sessionCount: number
  totalActiveMs: number
  documentsOpened: number
  downloads: number
  lastSeenAt: Date | null
  firstSeenAt: Date | null
  country: string | null
  city: string | null
  ndaSignedAt: Date | null
  linkRevoked: boolean
  linkExpiresAt: Date | null
  canDownload: boolean
  flagged: boolean
  /** 0-100, weighted toward depth of reading rather than raw clicks. */
  engagementScore: number
}

export async function getVisitorSummaries(): Promise<VisitorSummary[]> {
  const rows = await db
    .select({
      visitorId: visitors.id,
      email: visitors.email,
      name: visitors.name,
      organization: visitors.organization,
      role: visitors.role,
      sessionCount: sql<number>`COUNT(${sessions.id})`,
      // Only `sessions` is joined here, so this sum counts each session once.
      // Document and download counts are fetched separately below precisely so
      // that fan-out from a second join cannot inflate it.
      totalActiveMs: sql<number>`COALESCE(SUM(${sessions.activeMs}), 0)`,
      lastSeenAt: max(sessions.lastSeenAt),
      firstSeenAt: sql<Date | null>`MIN(${sessions.startedAt})`,
      country: sql<string | null>`MAX(${sessions.country})`,
      city: sql<string | null>`MAX(${sessions.city})`,
      flagged: sql<boolean>`COALESCE(BOOL_OR(${sessions.isNewDevice}), FALSE)`,
    })
    .from(visitors)
    .leftJoin(sessions, eq(sessions.visitorId, visitors.id))
    .groupBy(visitors.id)
    .orderBy(desc(max(sessions.lastSeenAt)))

  // Per-visitor document and download counts, fetched separately so the joins
  // above cannot multiply the session time.
  const docRows = await db
    .select({
      visitorId: documentViews.visitorId,
      opened: countDistinct(documentViews.documentId),
      totalCompletion: sql<number>`COALESCE(SUM(${documentViews.completion}), 0)`,
    })
    .from(documentViews)
    .groupBy(documentViews.visitorId)

  const downloadRows = await db
    .select({ visitorId: events.visitorId, n: count() })
    .from(events)
    .where(eq(events.type, 'download'))
    .groupBy(events.visitorId)

  const ndaRows = await db
    .select({ visitorId: ndaAcceptances.visitorId, at: max(ndaAcceptances.acceptedAt) })
    .from(ndaAcceptances)
    .groupBy(ndaAcceptances.visitorId)

  const linkRows = await db
    .select({
      visitorId: accessLinks.visitorId,
      revokedAt: max(accessLinks.revokedAt),
      expiresAt: max(accessLinks.expiresAt),
      canDownload: sql<boolean>`BOOL_OR(${accessLinks.canDownload})`,
    })
    .from(accessLinks)
    .groupBy(accessLinks.visitorId)

  const docMap = new Map(docRows.map((r) => [r.visitorId, r]))
  const dlMap = new Map(downloadRows.map((r) => [r.visitorId, Number(r.n)]))
  const ndaMap = new Map(ndaRows.map((r) => [r.visitorId, r.at]))
  const linkMap = new Map(linkRows.map((r) => [r.visitorId, r]))

  return rows.map((r) => {
    const docs = docMap.get(r.visitorId)
    const opened = Number(docs?.opened ?? 0)
    const completion = Number(docs?.totalCompletion ?? 0)
    const activeMs = Number(r.totalActiveMs ?? 0)
    const link = linkMap.get(r.visitorId)

    return {
      visitorId: r.visitorId,
      email: r.email,
      name: r.name,
      organization: r.organization,
      role: r.role,
      sessionCount: Number(r.sessionCount ?? 0),
      totalActiveMs: activeMs,
      documentsOpened: opened,
      downloads: dlMap.get(r.visitorId) ?? 0,
      lastSeenAt: r.lastSeenAt,
      firstSeenAt: r.firstSeenAt as Date | null,
      country: r.country,
      city: r.city,
      ndaSignedAt: (ndaMap.get(r.visitorId) as Date | null) ?? null,
      linkRevoked: Boolean(link?.revokedAt),
      linkExpiresAt: (link?.expiresAt as Date | null) ?? null,
      canDownload: Boolean(link?.canDownload),
      flagged: Boolean(r.flagged),
      engagementScore: engagementScore({ activeMs, opened, completion }),
    }
  })
}

/**
 * Weighted so that reading deeply beats clicking widely. A visitor who opens
 * one document and reads all of it outranks one who opens ten and reads none.
 */
export function engagementScore(input: {
  activeMs: number
  opened: number
  completion: number
}): number {
  const timeScore = Math.min(1, input.activeMs / (20 * 60 * 1000)) * 45
  const breadthScore = Math.min(1, input.opened / 10) * 20
  const depthScore = Math.min(1, input.completion / 5) * 35
  return Math.round(timeScore + breadthScore + depthScore)
}

export type DocumentStat = {
  documentId: string
  title: string
  folderName: string
  folderSlug: string
  kind: string
  uniqueViewers: number
  opens: number
  totalActiveMs: number
  avgActiveMs: number
  avgCompletion: number
  downloads: number
  lastOpenedAt: Date | null
}

export async function getDocumentStats(): Promise<DocumentStat[]> {
  const rows = await db
    .select({
      documentId: documents.id,
      title: documents.title,
      kind: documents.kind,
      folderName: folders.name,
      folderSlug: folders.slug,
      uniqueViewers: countDistinct(documentViews.visitorId),
      opens: sql<number>`COUNT(${documentViews.id})`,
      totalActiveMs: sql<number>`COALESCE(SUM(${documentViews.activeMs}), 0)`,
      avgCompletion: sql<number>`COALESCE(AVG(${documentViews.completion}), 0)`,
      lastOpenedAt: max(documentViews.openedAt),
    })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .leftJoin(documentViews, eq(documentViews.documentId, documents.id))
    .groupBy(documents.id, folders.name, folders.slug)
    .orderBy(desc(sql`COALESCE(SUM(${documentViews.activeMs}), 0)`))

  const downloadRows = await db
    .select({ documentId: events.documentId, n: count() })
    .from(events)
    .where(eq(events.type, 'download'))
    .groupBy(events.documentId)
  const dlMap = new Map(downloadRows.map((r) => [r.documentId, Number(r.n)]))

  return rows.map((r) => {
    const opens = Number(r.opens ?? 0)
    const totalActiveMs = Number(r.totalActiveMs ?? 0)
    return {
      documentId: r.documentId,
      title: r.title,
      folderName: r.folderName,
      folderSlug: r.folderSlug,
      kind: r.kind,
      uniqueViewers: Number(r.uniqueViewers ?? 0),
      opens,
      totalActiveMs,
      avgActiveMs: opens ? Math.round(totalActiveMs / opens) : 0,
      avgCompletion: Number(r.avgCompletion ?? 0),
      downloads: dlMap.get(r.documentId) ?? 0,
      lastOpenedAt: r.lastOpenedAt,
    }
  })
}

export type SessionDetail = {
  sessionId: string
  visitorId: string
  email: string
  name: string | null
  organization: string | null
  startedAt: Date
  lastSeenAt: Date
  activeMs: number
  country: string | null
  city: string | null
  ip: string | null
  browser: string | null
  os: string | null
  deviceType: string | null
  referrer: string | null
  isNewDevice: boolean
  documentsOpened: number
}

export async function getRecentSessions(limit = 50): Promise<SessionDetail[]> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      visitorId: sessions.visitorId,
      email: visitors.email,
      name: visitors.name,
      organization: visitors.organization,
      startedAt: sessions.startedAt,
      lastSeenAt: sessions.lastSeenAt,
      activeMs: sessions.activeMs,
      country: sessions.country,
      city: sessions.city,
      ip: sessions.ip,
      browser: sessions.browser,
      os: sessions.os,
      deviceType: sessions.deviceType,
      referrer: sessions.referrer,
      isNewDevice: sessions.isNewDevice,
      documentsOpened: sql<number>`(SELECT COUNT(DISTINCT document_id) FROM document_views WHERE document_views.session_id = ${sessions.id})`,
    })
    .from(sessions)
    .innerJoin(visitors, eq(sessions.visitorId, visitors.id))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)

  return rows.map((r) => ({ ...r, documentsOpened: Number(r.documentsOpened ?? 0) }))
}

/** Day-by-day activity for the dashboard sparkline. */
export async function getActivityTimeline(days = 30): Promise<
  { date: string; sessions: number; documentOpens: number; activeMinutes: number }[]
> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const sessionRows = await db
    .select({
      date: sql<string>`TO_CHAR(${sessions.startedAt}, 'YYYY-MM-DD')`,
      n: count(),
      ms: sum(sessions.activeMs),
    })
    .from(sessions)
    .where(gte(sessions.startedAt, since))
    .groupBy(sql`TO_CHAR(${sessions.startedAt}, 'YYYY-MM-DD')`)

  const docRows = await db
    .select({
      date: sql<string>`TO_CHAR(${documentViews.openedAt}, 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(documentViews)
    .where(gte(documentViews.openedAt, since))
    .groupBy(sql`TO_CHAR(${documentViews.openedAt}, 'YYYY-MM-DD')`)

  const sessionMap = new Map(sessionRows.map((r) => [r.date, r]))
  const docMap = new Map(docRows.map((r) => [r.date, Number(r.n)]))

  const out: { date: string; sessions: number; documentOpens: number; activeMinutes: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    const s = sessionMap.get(key)
    out.push({
      date: key,
      sessions: Number(s?.n ?? 0),
      documentOpens: docMap.get(key) ?? 0,
      activeMinutes: Math.round(Number(s?.ms ?? 0) / 60000),
    })
  }
  return out
}

/** Where visitors are opening the room from. */
export async function getGeoBreakdown(): Promise<
  { country: string | null; city: string | null; sessions: number; visitors: number }[]
> {
  const rows = await db
    .select({
      country: sessions.country,
      city: sessions.city,
      sessions: count(),
      visitors: countDistinct(sessions.visitorId),
    })
    .from(sessions)
    .groupBy(sessions.country, sessions.city)
    .orderBy(desc(count()))
    .limit(30)
  return rows.map((r) => ({ ...r, sessions: Number(r.sessions), visitors: Number(r.visitors) }))
}

/** The full journey for one visitor, for the drill-down page. */
export async function getVisitorJourney(visitorId: string) {
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.visitorId, visitorId))
    .orderBy(desc(sessions.startedAt))

  const viewRows = await db
    .select({
      view: documentViews,
      documentTitle: documents.title,
      documentKind: documents.kind,
      folderName: folders.name,
      pageCount: documents.pageCount,
    })
    .from(documentViews)
    .innerJoin(documents, eq(documentViews.documentId, documents.id))
    .innerJoin(folders, eq(documents.folderId, folders.id))
    .where(eq(documentViews.visitorId, visitorId))
    .orderBy(desc(documentViews.openedAt))

  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.visitorId, visitorId))
    .orderBy(desc(events.createdAt))
    .limit(200)

  return { sessions: sessionRows, views: viewRows, events: eventRows }
}

/** Per-page dwell for one document — shows exactly where attention landed. */
export async function getDocumentPageHeatmap(documentId: string) {
  const rows = await db
    .select({
      pageNumber: pageViews.pageNumber,
      totalMs: sum(pageViews.activeMs),
      viewers: countDistinct(pageViews.documentViewId),
    })
    .from(pageViews)
    .where(eq(pageViews.documentId, documentId))
    .groupBy(pageViews.pageNumber)
    .orderBy(pageViews.pageNumber)

  return rows.map((r) => ({
    pageNumber: r.pageNumber,
    totalMs: Number(r.totalMs ?? 0),
    viewers: Number(r.viewers ?? 0),
  }))
}

/** Newest-first audit trail for the activity feed. */
export async function getRecentEvents(limit = 100) {
  return db
    .select({
      event: events,
      visitorEmail: visitors.email,
      visitorName: visitors.name,
      documentTitle: documents.title,
    })
    .from(events)
    .leftJoin(visitors, eq(events.visitorId, visitors.id))
    .leftJoin(documents, eq(events.documentId, documents.id))
    .orderBy(desc(events.createdAt))
    .limit(limit)
}
