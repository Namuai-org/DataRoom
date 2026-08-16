import Link from 'next/link'
import {
  Ban,
  Download,
  FileCheck,
  FileText,
  Folder,
  KeyRound,
  Link as LinkIcon,
  LogIn,
  Mail,
  Printer,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { cn, countryFlag } from '@/lib/utils'
import { describeEvent, type EventTone } from '@/app/admin/_lib/phrasing'
import { RelativeTime } from './RelativeTime'

export type FeedEvent = {
  id: string
  type: string
  actor: string
  label: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  country?: string | null
  ip?: string | null
  visitorId?: string | null
  visitorEmail?: string | null
  visitorName?: string | null
  documentTitle?: string | null
}

const ICONS: Record<string, LucideIcon> = {
  link_opened: LinkIcon,
  link_rejected: Ban,
  nda_accepted: FileCheck,
  room_entered: LogIn,
  folder_opened: Folder,
  document_opened: FileText,
  document_closed: FileText,
  download: Download,
  print_attempt: Printer,
  search: Search,
  admin_login: KeyRound,
  admin_login_failed: ShieldAlert,
  invite_created: Send,
  invite_revoked: Ban,
  invite_sent: Mail,
  document_uploaded: Upload,
  document_deleted: Trash2,
  settings_changed: Settings,
}

const TONE_CLASS: Record<EventTone, string> = {
  neutral: 'text-[var(--text-muted)] bg-[var(--surface-sunken)]',
  positive: 'text-[var(--color-forest)] bg-[color-mix(in_oklab,var(--color-forest)_10%,transparent)]',
  attention: 'text-[var(--color-kola)] bg-[color-mix(in_oklab,var(--color-sahel)_20%,transparent)]',
}

/**
 * The audit trail, read as English. Every row names a person, an action and a
 * thing; the trailing fact is a duration or a reason, never a raw event code.
 */
export function EventFeed({
  events,
  showLocation = false,
  className,
}: {
  events: FeedEvent[]
  showLocation?: boolean
  className?: string
}) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {events.map((event) => {
        const { sentence, detail, tone } = describeEvent(event)
        const Icon = ICONS[event.type] ?? FileText

        return (
          <li
            key={event.id}
            className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-3.5 last:border-b-0"
          >
            <span
              aria-hidden
              className={cn(
                'mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                TONE_CLASS[tone],
              )}
            >
              <Icon size={13} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-pretty text-[0.875rem] leading-snug text-[var(--text-primary)]">
                {event.visitorId ? (
                  <Link
                    href={`/admin/visitors/${event.visitorId}`}
                    className="underline decoration-[var(--border-strong)] underline-offset-[3px] transition-colors hover:decoration-[var(--color-sahel)]"
                  >
                    {sentence}
                  </Link>
                ) : (
                  sentence
                )}
              </p>

              <p className="tnum mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
                <RelativeTime value={event.createdAt} />
                {detail ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-[var(--text-secondary)]">{detail}</span>
                  </>
                ) : null}
                {showLocation && event.country ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      <span aria-hidden>{countryFlag(event.country)}</span> {event.country}
                    </span>
                  </>
                ) : null}
                {showLocation && event.ip ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono text-[0.7rem]">{event.ip}</span>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
