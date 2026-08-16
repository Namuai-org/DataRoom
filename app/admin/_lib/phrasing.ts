import { formatDuration } from '@/lib/utils'

/**
 * Every event type gets an English sentence. The feed should read like a
 * record of what people did, not like a database dump: "Amina Diallo opened
 * Namu Financial Model — 4m 12s", never "document_opened".
 */

export type EventTone = 'neutral' | 'positive' | 'attention'

export type EventLike = {
  type: string
  actor: string
  label: string | null
  metadata: Record<string, unknown> | null
  visitorName?: string | null
  visitorEmail?: string | null
  documentTitle?: string | null
}

/** Short label for the type filter on the activity page. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  link_opened: 'Invite link opened',
  link_rejected: 'Link rejected',
  nda_accepted: 'NDA signed',
  room_entered: 'Room entered',
  folder_opened: 'Folder opened',
  document_opened: 'Document opened',
  document_closed: 'Document closed',
  download: 'Download',
  print_attempt: 'Print attempt',
  search: 'Search',
  admin_login: 'Admin sign-in',
  admin_login_failed: 'Failed sign-in',
  invite_created: 'Invite created',
  invite_revoked: 'Invite revoked',
  invite_sent: 'Invite emailed',
  document_uploaded: 'Document uploaded',
  document_deleted: 'Document deleted',
  settings_changed: 'Settings changed',
}

const ATTENTION = new Set([
  'link_rejected',
  'print_attempt',
  'admin_login_failed',
  'invite_revoked',
  'document_deleted',
])

const POSITIVE = new Set(['nda_accepted', 'room_entered', 'invite_created', 'invite_sent'])

export function eventTone(type: string): EventTone {
  if (ATTENTION.has(type)) return 'attention'
  if (POSITIVE.has(type)) return 'positive'
  return 'neutral'
}

function who(event: EventLike): string {
  const name = event.visitorName?.trim()
  if (name) return name
  const email = event.visitorEmail?.trim()
  if (email) return email
  if (event.actor === 'admin') return 'You'
  if (event.actor === 'system') return 'The room'
  return 'Someone'
}

function doc(event: EventLike): string {
  return event.documentTitle?.trim() || event.label?.trim() || 'a document'
}

function readNumber(metadata: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!metadata) return null
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function readString(metadata: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!metadata) return null
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export type PhrasedEvent = {
  /** The sentence itself. */
  sentence: string
  /** A short trailing fact — a duration, a page, a reason. May be empty. */
  detail: string
  tone: EventTone
}

export function describeEvent(event: EventLike): PhrasedEvent {
  const person = who(event)
  const tone = eventTone(event.type)
  const activeMs = readNumber(event.metadata, 'activeMs', 'durationMs', 'ms')
  const page = readNumber(event.metadata, 'page', 'pageNumber', 'maxPage')
  const reason = readString(event.metadata, 'reason', 'error')

  const detail = (() => {
    if (activeMs !== null && activeMs > 0) return formatDuration(activeMs)
    if (reason) return reason
    if (page !== null) return `page ${page}`
    return ''
  })()

  switch (event.type) {
    case 'link_opened':
      return { sentence: `${person} opened their invite link`, detail, tone }
    case 'link_rejected':
      return {
        sentence: `An invite link was refused`,
        detail: reason ?? event.label ?? 'expired or revoked',
        tone,
      }
    case 'nda_accepted':
      return { sentence: `${person} signed the NDA`, detail: event.label ?? detail, tone }
    case 'room_entered':
      return { sentence: `${person} entered the room`, detail, tone }
    case 'folder_opened':
      return { sentence: `${person} opened ${event.label ?? 'a folder'}`, detail, tone }
    case 'document_opened':
      return { sentence: `${person} opened ${doc(event)}`, detail, tone }
    case 'document_closed':
      return { sentence: `${person} finished reading ${doc(event)}`, detail, tone }
    case 'download':
      return { sentence: `${person} downloaded ${doc(event)}`, detail, tone }
    case 'print_attempt':
      return { sentence: `${person} tried to print ${doc(event)}`, detail, tone }
    case 'search':
      return { sentence: `${person} searched for “${event.label ?? ''}”`, detail: '', tone }
    case 'admin_login':
      return { sentence: `${event.label ?? person} signed in to the console`, detail, tone }
    case 'admin_login_failed':
      return {
        sentence: `A sign-in code was entered incorrectly`,
        detail: event.label ?? detail,
        tone,
      }
    case 'invite_created':
      return { sentence: `Invite created for ${event.label ?? person}`, detail, tone }
    case 'invite_revoked':
      return { sentence: `Invite revoked for ${event.label ?? person}`, detail, tone }
    case 'invite_sent':
      return { sentence: `Invite emailed to ${event.label ?? person}`, detail, tone }
    case 'document_uploaded':
      return { sentence: `${event.label ?? doc(event)} was uploaded`, detail, tone }
    case 'document_deleted':
      return { sentence: `${event.label ?? doc(event)} was deleted`, detail, tone }
    case 'settings_changed':
      return { sentence: `Room settings were changed`, detail: event.label ?? '', tone }
    default:
      return {
        sentence: `${person} — ${event.type.replace(/_/g, ' ')}`,
        detail: event.label ?? '',
        tone,
      }
  }
}

/** Human name for a document `kind`. */
export const KIND_LABELS: Record<string, string> = {
  pdf: 'PDF',
  sheet: 'Spreadsheet',
  doc: 'Document',
  slides: 'Slides',
  image: 'Image',
  web: 'Web page',
  archive: 'Archive',
  other: 'File',
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? 'File'
}
