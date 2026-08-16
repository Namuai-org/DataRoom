import Link from 'next/link'
import { NamuLogo } from '@/components/brand/Logo'
import { brand } from '@/lib/brand'

/**
 * The public front door. It deliberately says almost nothing: anyone who has
 * business here arrived with a personal link, and an uninvited visitor should
 * learn no more than that the room exists.
 */
export default function Home() {
  return (
    <div className="grid min-h-screen place-items-center px-5 py-16">
      <div className="animate-fade-up w-full max-w-md text-center">
        <div className="mb-12 flex justify-center">
          <span className="block [[data-theme='dark']_&]:hidden">
            <NamuLogo tone="dark" height={38} animated />
          </span>
          <span className="hidden [[data-theme='dark']_&]:block">
            <NamuLogo tone="light" height={38} animated />
          </span>
        </div>

        <p className="label mb-5 flex items-center justify-center gap-2.5">
          <span className="sahel-dot" />
          Data Room
        </p>

        <h1
          className="font-display text-balance text-[1.6rem] leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {brand.tagline}
        </h1>

        <p
          className="text-pretty mx-auto mt-5 max-w-sm text-[15px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          This room is shared by invitation. If you were sent a link, open it to enter.
        </p>

        <a
          href={`mailto:${brand.contact}?subject=Namu%20data%20room%20access`}
          className="mt-8 inline-block rounded-full px-5 py-2.5 text-sm font-medium transition-transform duration-300 hover:-translate-y-0.5"
          style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
        >
          Request access
        </a>

        <div className="mt-14 flex items-center justify-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>
            {brand.legalName} · {brand.site}
          </span>
          <span aria-hidden style={{ opacity: 0.4 }}>
            ·
          </span>
          <Link href="/admin" className="underline-offset-4 transition-colors hover:underline">
            Console
          </Link>
        </div>
      </div>
    </div>
  )
}
