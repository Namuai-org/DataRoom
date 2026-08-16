import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  real,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

/* -------------------------------------------------------------------------- */
/*  Admins — people who can open the control room                             */
/* -------------------------------------------------------------------------- */

export const admins = pgTable(
  'admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    // Admins sign in with a one-time code sent to their address. There is no
    // password to leak, and the owner's address is seeded from OWNER_EMAIL.
    isOwner: boolean('is_owner').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admins_email_idx').on(t.email)],
)

/** Short-lived one-time codes for admin sign-in. */
export const adminLoginCodes = pgTable(
  'admin_login_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    // Only a hash is stored, so a database read cannot be replayed as a login.
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    requestIp: text('request_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_login_codes_email_idx').on(t.email, t.expiresAt)],
)

/* -------------------------------------------------------------------------- */
/*  Visitors — the people you invite                                          */
/* -------------------------------------------------------------------------- */

export const visitors = pgTable(
  'visitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    organization: text('organization'),
    // Free-form label: "Seed investor", "Accelerator", "Advisor"…
    role: text('role'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('visitors_email_idx').on(t.email)],
)

/* -------------------------------------------------------------------------- */
/*  Access links — one unguessable magic link per visitor                     */
/* -------------------------------------------------------------------------- */

export const accessLinks = pgTable(
  'access_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),

    // The raw token lives only in the invite URL. We store a SHA-256 hash so a
    // database compromise does not hand an attacker working access links.
    tokenHash: text('token_hash').notNull(),
    // First 8 chars of the raw token, purely so the admin UI can show which
    // link a row refers to without being able to reconstruct it.
    tokenPreview: text('token_preview').notNull(),

    label: text('label'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    // Per-visitor capability flags.
    canDownload: boolean('can_download').notNull().default(false),
    // Empty array = every folder. Otherwise an allow-list of folder ids.
    allowedFolderIds: jsonb('allowed_folder_ids').$type<string[]>().notNull().default([]),

    // Staged disclosure. The standard diligence practice is to release material
    // in three waves rather than all at once: a teaser for first conversations,
    // full diligence once there is real interest, and confirmatory material
    // only after a term sheet. A link sees its own tier and everything below.
    //
    // The default is the *widest* tier on purpose. Staging is a choice you make
    // for a particular investor, not a trap that silently hides folders from
    // everyone you invite: you narrow a link deliberately, rather than
    // discovering after the fact that someone could not see the financials.
    tier: text('tier').notNull().default('confirmatory'), // teaser | diligence | confirmatory

    // Device binding: the fingerprint + IP of the first device to open the
    // link. Later opens from elsewhere still work but are flagged, which keeps
    // the analytics honest even though the link itself is frictionless.
    boundFingerprint: text('bound_fingerprint'),
    boundIp: text('bound_ip'),

    invitedBy: text('invited_by'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    openCount: integer('open_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('access_links_token_hash_idx').on(t.tokenHash),
    index('access_links_visitor_idx').on(t.visitorId),
  ],
)

/* -------------------------------------------------------------------------- */
/*  NDA acceptances                                                            */
/* -------------------------------------------------------------------------- */

export const ndaAcceptances = pgTable(
  'nda_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    accessLinkId: uuid('access_link_id').references(() => accessLinks.id, {
      onDelete: 'set null',
    }),
    ndaVersion: text('nda_version').notNull(),
    // Exact text shown at the moment of signing, so the record is self-proving
    // even after the NDA copy is later revised.
    ndaTextHash: text('nda_text_hash').notNull(),
    signedName: text('signed_name').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    country: text('country'),
  },
  (t) => [index('nda_visitor_idx').on(t.visitorId)],
)

/* -------------------------------------------------------------------------- */
/*  Content — folders and documents                                            */
/* -------------------------------------------------------------------------- */

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    // Display name, e.g. "01-Company Overview"
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    // Hidden folders exist but are invisible to visitors.
    isHidden: boolean('is_hidden').notNull().default(false),
    // Default disclosure tier for documents filed here.
    tier: text('tier').notNull().default('diligence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('folders_slug_idx').on(t.slug), index('folders_parent_idx').on(t.parentId)],
)

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    description: text('description'),
    fileName: text('file_name').notNull(),
    // Vercel Blob pathname. Never exposed to the client directly — documents
    // are streamed through an authorised route instead.
    blobPath: text('blob_path').notNull(),
    blobUrl: text('blob_url').notNull(),

    mimeType: text('mime_type').notNull(),
    // 'pdf' | 'sheet' | 'doc' | 'image' | 'slides' | 'other'
    kind: text('kind').notNull().default('other'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    pageCount: integer('page_count'),

    sortOrder: integer('sort_order').notNull().default(0),
    isHidden: boolean('is_hidden').notNull().default(false),
    // Overrides the visitor-level download flag when set.
    downloadPolicy: text('download_policy').notNull().default('inherit'), // inherit | never | allow
    // Overrides the folder's tier when set to something other than 'inherit'.
    tier: text('tier').notNull().default('inherit'), // inherit | teaser | diligence | confirmatory
    // Surfaces "Updated" badges to returning investors.
    contentUpdatedAt: timestamp('content_updated_at', { withTimezone: true }),

    version: integer('version').notNull().default(1),
    uploadedBy: text('uploaded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('documents_folder_idx').on(t.folderId, t.sortOrder)],
)

/* -------------------------------------------------------------------------- */
/*  Analytics — sessions, document views, page dwell, events                   */
/* -------------------------------------------------------------------------- */

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    accessLinkId: uuid('access_link_id').references(() => accessLinks.id, {
      onDelete: 'set null',
    }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    // Advanced by a heartbeat from the client so we measure real dwell time
    // rather than time-to-last-navigation.
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    activeMs: integer('active_ms').notNull().default(0),

    ip: text('ip'),
    country: text('country'),
    countryRegion: text('country_region'),
    city: text('city'),
    latitude: text('latitude'),
    longitude: text('longitude'),
    timezone: text('timezone'),

    userAgent: text('user_agent'),
    browser: text('browser'),
    os: text('os'),
    deviceType: text('device_type'),
    screen: text('screen'),
    referrer: text('referrer'),

    fingerprint: text('fingerprint'),
    // True when this session's device/IP differs from the link's bound device,
    // i.e. the invite link was probably forwarded.
    isNewDevice: boolean('is_new_device').notNull().default(false),
    suspicious: boolean('suspicious').notNull().default(false),
  },
  (t) => [
    index('sessions_visitor_idx').on(t.visitorId, t.startedAt),
    index('sessions_started_idx').on(t.startedAt),
  ],
)

export const documentViews = pgTable(
  'document_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // Sum of heartbeat intervals while the tab was actually visible.
    activeMs: integer('active_ms').notNull().default(0),

    maxPageReached: integer('max_page_reached').notNull().default(1),
    pagesViewed: integer('pages_viewed').notNull().default(0),
    // 0..1 — share of the document's pages actually looked at.
    completion: real('completion').notNull().default(0),
    downloaded: boolean('downloaded').notNull().default(false),
    printAttempted: boolean('print_attempted').notNull().default(false),
  },
  (t) => [
    index('doc_views_session_idx').on(t.sessionId),
    index('doc_views_document_idx').on(t.documentId),
    index('doc_views_visitor_idx').on(t.visitorId, t.openedAt),
  ],
)

/** Per-page dwell time, so you can see exactly which page held attention. */
export const pageViews = pgTable(
  'page_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentViewId: uuid('document_view_id')
      .notNull()
      .references(() => documentViews.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    activeMs: integer('active_ms').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('page_views_unique_idx').on(t.documentViewId, t.pageNumber),
    index('page_views_document_idx').on(t.documentId, t.pageNumber),
  ],
)

/**
 * Append-only audit trail. Everything notable lands here so the admin activity
 * feed and the security log read from one ordered source.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    visitorId: uuid('visitor_id').references(() => visitors.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    // link_opened | link_rejected | nda_accepted | room_entered | folder_opened
    // | document_opened | document_closed | download | print_attempt
    // | search | admin_login | invite_created | invite_revoked | document_uploaded …
    type: text('type').notNull(),
    actor: text('actor').notNull().default('visitor'), // visitor | admin | system
    label: text('label'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    country: text('country'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_created_idx').on(t.createdAt),
    index('events_visitor_idx').on(t.visitorId, t.createdAt),
    index('events_type_idx').on(t.type, t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/*  Q&A — the two-way channel investors expect                                */
/* -------------------------------------------------------------------------- */

/**
 * Investors ask questions and request documents from inside the room rather
 * than over email, so every thread stays attached to the deal and to the
 * document that prompted it. Answering here is also the cheapest way to see
 * what a given investor is actually worried about.
 */
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: uuid('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    // Set when the question was asked from a specific document or folder.
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),

    kind: text('kind').notNull().default('question'), // question | document_request
    body: text('body').notNull(),
    status: text('status').notNull().default('open'), // open | answered | closed
    answer: text('answer'),
    answeredBy: text('answered_by'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    // Answers can be published to every investor once written, which saves
    // answering the same question five times.
    isPublic: boolean('is_public').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('questions_visitor_idx').on(t.visitorId, t.createdAt),
    index('questions_status_idx').on(t.status, t.createdAt),
  ],
)

/* -------------------------------------------------------------------------- */
/*  Settings — single-row key/value store for room configuration              */
/* -------------------------------------------------------------------------- */

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* -------------------------------------------------------------------------- */
/*  Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const visitorRelations = relations(visitors, ({ many }) => ({
  accessLinks: many(accessLinks),
  sessions: many(sessions),
  documentViews: many(documentViews),
  ndaAcceptances: many(ndaAcceptances),
}))

export const accessLinkRelations = relations(accessLinks, ({ one, many }) => ({
  visitor: one(visitors, { fields: [accessLinks.visitorId], references: [visitors.id] }),
  sessions: many(sessions),
}))

export const folderRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, { fields: [folders.parentId], references: [folders.id], relationName: 'tree' }),
  children: many(folders, { relationName: 'tree' }),
  documents: many(documents),
}))

export const documentRelations = relations(documents, ({ one, many }) => ({
  folder: one(folders, { fields: [documents.folderId], references: [folders.id] }),
  views: many(documentViews),
}))

export const sessionRelations = relations(sessions, ({ one, many }) => ({
  visitor: one(visitors, { fields: [sessions.visitorId], references: [visitors.id] }),
  accessLink: one(accessLinks, { fields: [sessions.accessLinkId], references: [accessLinks.id] }),
  documentViews: many(documentViews),
  events: many(events),
}))

export const documentViewRelations = relations(documentViews, ({ one, many }) => ({
  session: one(sessions, { fields: [documentViews.sessionId], references: [sessions.id] }),
  visitor: one(visitors, { fields: [documentViews.visitorId], references: [visitors.id] }),
  document: one(documents, { fields: [documentViews.documentId], references: [documents.id] }),
  pages: many(pageViews),
}))

export const pageViewRelations = relations(pageViews, ({ one }) => ({
  documentView: one(documentViews, {
    fields: [pageViews.documentViewId],
    references: [documentViews.id],
  }),
}))

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type Admin = typeof admins.$inferSelect
export type Visitor = typeof visitors.$inferSelect
export type AccessLink = typeof accessLinks.$inferSelect
export type Folder = typeof folders.$inferSelect
export type Document = typeof documents.$inferSelect
export type Session = typeof sessions.$inferSelect
export type DocumentView = typeof documentViews.$inferSelect
export type PageView = typeof pageViews.$inferSelect
export type Event = typeof events.$inferSelect
export type NdaAcceptance = typeof ndaAcceptances.$inferSelect
export type Question = typeof questions.$inferSelect

/* -------------------------------------------------------------------------- */
/*  Disclosure tiers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Ordered least- to most-sensitive. A visitor granted `diligence` sees teaser
 * and diligence material; confirmatory stays sealed until they are granted it.
 */
export const TIERS = ['teaser', 'diligence', 'confirmatory'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABELS: Record<Tier, string> = {
  teaser: 'Teaser',
  diligence: 'Diligence',
  confirmatory: 'Confirmatory',
}

export const TIER_DESCRIPTIONS: Record<Tier, string> = {
  teaser: 'Shared in first conversations. Deck, one-pager, market overview.',
  diligence: 'Shared once there is real interest. Financials, traction, team, product.',
  confirmatory: 'Shared after a term sheet. Legal agreements, IP, detailed financials, risk.',
}

export function tierRank(tier: string): number {
  const index = (TIERS as readonly string[]).indexOf(tier)
  return index === -1 ? 1 : index
}

/** A link admits everything at or below its own tier. */
export function tierVisible(linkTier: string, contentTier: string): boolean {
  return tierRank(contentTier) <= tierRank(linkTier)
}

/** Documents inherit their folder's tier unless they override it. */
export function resolveTier(
  doc: { tier: string },
  folder: { tier: string },
): Tier {
  const effective = doc.tier === 'inherit' ? folder.tier : doc.tier
  return (TIERS as readonly string[]).includes(effective) ? (effective as Tier) : 'diligence'
}
