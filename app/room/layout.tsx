import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ndaAcceptances, questions } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { requireVisitor } from '@/lib/auth'
import { getRoomSettings } from '@/lib/room'
import { RoomHeader } from '@/components/room/RoomHeader'
import { RoomTracker } from '@/components/tracking/RoomTracker'
import { brand } from '@/lib/brand'

/**
 * The room shell, and the gate in front of it.
 *
 * requireVisitor() re-reads the access link on every request, so revoking a
 * link logs the holder out on their very next navigation rather than whenever
 * their cookie happens to lapse. The same check is repeated inside each page
 * and API route — a layout guard alone is not a security boundary.
 */
export default async function RoomLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const settings = await getRoomSettings()

  if (settings.ndaEnabled) {
    const [signed] = await db
      .select({ id: ndaAcceptances.id })
      .from(ndaAcceptances)
      .where(eq(ndaAcceptances.visitorId, auth.visitor.id))
      .orderBy(desc(ndaAcceptances.acceptedAt))
      .limit(1)
    if (!signed) redirect('/nda')
  }

  const [openCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(questions)
    .where(and(eq(questions.visitorId, auth.visitor.id), eq(questions.status, 'answered')))

  return (
    // RoomTracker wraps the room rather than sitting beside it: it publishes the
    // tracking context, so every viewer below shares one activity clock instead
    // of starting a second one that would disagree with the session heartbeat.
    <RoomTracker>
      <div className="flex min-h-screen flex-col">
        <RoomHeader
          email={auth.visitor.email}
          name={auth.visitor.name}
          qaEnabled={settings.qaEnabled}
          openQuestionCount={Number(openCount?.n ?? 0)}
        />

        <main className="flex-1">{children}</main>

        <footer className="mt-24 border-t py-8" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {brand.legalName} · Confidential. Shared with {auth.visitor.email}.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Activity in this room is recorded.
            </p>
          </div>
        </footer>
      </div>
    </RoomTracker>
  )
}
