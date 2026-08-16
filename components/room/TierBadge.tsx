import { resolveTier, TIER_LABELS, type Tier } from '@/lib/db/schema'

/**
 * Marks confirmatory material so a viewer understands they are looking at
 * something released to them specifically. Teaser and diligence tiers are the
 * ordinary case and stay unlabelled — a badge on every row would be noise.
 */
export function TierBadge({ tier, folderTier }: { tier: string; folderTier: string }) {
  const effective: Tier = resolveTier({ tier }, { tier: folderTier })
  if (effective !== 'confirmatory') return null

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{
        background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
        color: 'var(--accent)',
      }}
      title="Released to you at the confirmatory diligence stage"
    >
      {TIER_LABELS[effective]}
    </span>
  )
}
