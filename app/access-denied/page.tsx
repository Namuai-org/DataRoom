import { NamuLogo } from '@/components/brand/Logo'
import { brand } from '@/lib/brand'

const REASONS: Record<string, { title: string; body: string }> = {
  invalid: {
    title: 'This link is not valid',
    body: 'The address may have been mistyped, or the link was never issued. Check the message you were sent, or ask us for a new one.',
  },
  revoked: {
    title: 'This link has been withdrawn',
    body: 'Access through this link was revoked. If you still need to review the material, ask us and we will issue a new link.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Access links are issued for a fixed period. Ask us and we will send you a fresh one.',
  },
  default: {
    title: 'You do not have access',
    body: 'This data room is shared by invitation only.',
  },
}

export default async function AccessDenied({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const copy = REASONS[reason ?? 'default'] ?? REASONS.default!

  return (
    <div className="grid min-h-screen place-items-center px-5 py-16">
      <div className="animate-fade-up w-full max-w-md text-center">
        <div className="mb-10 flex justify-center">
          <span className="block [[data-theme='dark']_&]:hidden">
            <NamuLogo tone="dark" height={30} animated />
          </span>
          <span className="hidden [[data-theme='dark']_&]:block">
            <NamuLogo tone="light" height={30} animated />
          </span>
        </div>

        <h1
          className="font-display text-balance text-[1.75rem] leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {copy.title}
        </h1>

        <p
          className="text-pretty mx-auto mt-4 max-w-sm text-[15px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {copy.body}
        </p>

        <a
          href={`mailto:${brand.contact}?subject=Namu%20data%20room%20access`}
          className="mt-8 inline-block rounded-full px-5 py-2.5 text-sm font-medium transition-transform duration-300 hover:-translate-y-0.5"
          style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
        >
          Request access
        </a>

        <p className="mt-10 text-xs" style={{ color: 'var(--text-muted)' }}>
          {brand.legalName} · {brand.site}
        </p>
      </div>
    </div>
  )
}
