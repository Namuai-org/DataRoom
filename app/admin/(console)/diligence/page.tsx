import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { requireAdminPage } from '@/app/admin/_lib/guard'
import { runDiligenceCheck, type ChecklistResult, type Importance } from '@/lib/diligence'
import { displayFolderName } from '@/lib/brand'

export const dynamic = 'force-dynamic'

const IMPORTANCE_LABEL: Record<Importance, string> = {
  essential: 'Essential',
  expected: 'Expected',
  helpful: 'Helpful',
}

/**
 * Scores the room against what investors actually expect to find.
 *
 * The list is drawn from a16z's data room guide, Carta's diligence categories,
 * and the standard VC checklist. It is a prompt, not a verdict — the point is
 * to surface the gaps while there is still time to fill them, rather than
 * discovering them in a partner meeting.
 */
export default async function DiligencePage() {
  await requireAdminPage()
  const report = await runDiligenceCheck()

  const grouped = new Map<string, ChecklistResult[]>()
  for (const result of report.results) {
    const list = grouped.get(result.item.folderSlug) ?? []
    list.push(result)
    grouped.set(result.item.folderSlug, list)
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-9">
        <p className="label mb-3 flex items-center gap-2.5">
          <span className="sahel-dot" />
          Readiness
        </p>
        <h1 className="font-display text-[1.9rem] leading-tight" style={{ color: 'var(--text-primary)' }}>
          Is the room ready to send?
        </h1>
        <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Measured against what investors expect to find in a seed data room. Matching is done on
          document titles, so something filed under an unusual name may show as missing when it is
          not.
        </p>
      </header>

      {/* ---- Score ---- */}
      <section className="namu-card mb-8 flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2">
          <span
            className="font-display tnum text-[3rem] leading-none"
            style={{ color: report.score >= 80 ? 'var(--text-primary)' : 'var(--accent)' }}
          >
            {report.score}
          </span>
          <span className="text-lg" style={{ color: 'var(--text-muted)' }}>
            / 100
          </span>
        </div>

        <div className="flex-1">
          <p className="text-[14.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {report.essentialMissing.length > 0 ? (
              <>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {report.essentialMissing.length} essential{' '}
                  {report.essentialMissing.length === 1 ? 'document is' : 'documents are'} missing.
                </strong>{' '}
                These are the ones that stall diligence. Fill them before you send a link.
              </>
            ) : report.expectedMissing.length > 0 ? (
              <>
                Every essential document is filed.{' '}
                {report.expectedMissing.length}{' '}
                {report.expectedMissing.length === 1 ? 'item' : 'items'} investors usually expect
                are still missing.
              </>
            ) : (
              'Everything on the checklist is filed. Check that the numbers agree across the deck, the model, and the traction overview — disagreement is the most common reason diligence stalls.'
            )}
          </p>
        </div>
      </section>

      {/* ---- Missing essentials, called out ---- */}
      {report.essentialMissing.length > 0 && (
        <section className="mb-10">
          <h2 className="label mb-4">Fix these first</h2>
          <ul className="flex flex-col gap-2.5">
            {report.essentialMissing.map((result) => (
              <li
                key={result.item.id}
                className="namu-card p-4"
                style={{
                  boxShadow: 'none',
                  borderColor: 'color-mix(in oklab, var(--accent) 32%, transparent)',
                }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[14.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {result.item.label}
                  </p>
                  <p className="flex-none text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    {displayFolderName(result.folderName)}
                  </p>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {result.item.why}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Full checklist ---- */}
      <section>
        <h2 className="label mb-4">Full checklist</h2>
        <div className="flex flex-col gap-7">
          {[...grouped.entries()].map(([slug, results]) => {
            const summary = report.byFolder[slug]
            return (
              <div key={slug}>
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <h3 className="text-[13.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {displayFolderName(results[0]!.folderName)}
                  </h3>
                  <span className="text-[11.5px] tnum" style={{ color: 'var(--text-muted)' }}>
                    {summary ? `${summary.present}/${summary.total}` : ''}
                  </span>
                </div>

                <ul
                  className="overflow-hidden rounded-xl border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {results.map((result, index) => (
                    <li
                      key={result.item.id}
                      className="flex items-start gap-3 px-4 py-3"
                      style={{
                        background: 'var(--surface-raised)',
                        borderTop: index === 0 ? 'none' : '1px solid var(--border-subtle)',
                      }}
                    >
                      <span className="mt-0.5 flex-none">
                        {result.present ? (
                          <Check size={14} style={{ color: 'var(--accent)' }} aria-label="Filed" />
                        ) : (
                          <Minus size={14} style={{ color: 'var(--text-muted)' }} aria-label="Missing" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[13.5px]"
                          style={{
                            color: result.present ? 'var(--text-primary)' : 'var(--text-secondary)',
                          }}
                        >
                          {result.item.label}
                        </p>
                        {result.present ? (
                          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            {result.matchedTitles.slice(0, 2).join(' · ')}
                            {result.matchedTitles.length > 2 &&
                              ` +${result.matchedTitles.length - 2}`}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {result.item.why}
                          </p>
                        )}
                      </div>

                      <span
                        className="flex-none text-[10px] uppercase tracking-wider"
                        style={{
                          color:
                            result.item.importance === 'essential' && !result.present
                              ? 'var(--accent)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {IMPORTANCE_LABEL[result.item.importance]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      <p className="mt-10 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Add what is missing from{' '}
        <Link href="/admin/documents" className="underline underline-offset-4">
          Documents
        </Link>
        .
      </p>
    </div>
  )
}
