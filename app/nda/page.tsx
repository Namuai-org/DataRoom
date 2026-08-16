import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ndaAcceptances } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { requireVisitor } from '@/lib/auth'
import { getRoomSettings } from '@/lib/room'
import { NamuLogo } from '@/components/brand/Logo'
import { NdaForm } from './NdaForm'
import { brand } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export default async function NdaPage() {
  const auth = await requireVisitor()
  if (!auth) redirect('/access-denied?reason=expired')

  const settings = await getRoomSettings()
  if (!settings.ndaEnabled) redirect('/room')

  const [signed] = await db
    .select({ id: ndaAcceptances.id })
    .from(ndaAcceptances)
    .where(eq(ndaAcceptances.visitorId, auth.visitor.id))
    .orderBy(desc(ndaAcceptances.acceptedAt))
    .limit(1)
  if (signed) redirect('/room')

  return (
    <div className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="animate-fade-up">
        <span className="block [[data-theme='dark']_&]:hidden">
          <NamuLogo tone="dark" height={28} animated />
        </span>
        <span className="hidden [[data-theme='dark']_&]:block">
          <NamuLogo tone="light" height={28} animated />
        </span>

        <p className="label mt-10 flex items-center gap-2.5">
          <span className="sahel-dot" />
          Before you enter
        </p>

        <h1
          className="font-display mt-4 text-balance text-[1.9rem] leading-tight sm:text-[2.3rem]"
          style={{ color: 'var(--text-primary)' }}
        >
          Confidentiality agreement
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          The material in this room is confidential and commercially sensitive. Please read and
          accept the terms below to continue.
        </p>
      </div>

      <article
        className="namu-card mt-9 max-h-[26rem] overflow-y-auto p-6 text-[13.5px] leading-relaxed sm:p-7"
        style={{ color: 'var(--text-secondary)' }}
      >
        {settings.ndaText ? (
          settings.ndaText.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className={index === 0 ? '' : 'mt-4'}>
              {paragraph.trim()}
            </p>
          ))
        ) : (
          <p>
            The confidentiality terms have not been configured yet. Contact {brand.contact} before
            continuing.
          </p>
        )}

        <p className="mt-6 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          Version {settings.ndaVersion}
        </p>
      </article>

      <NdaForm suggestedName={auth.visitor.name ?? ''} />
    </div>
  )
}
