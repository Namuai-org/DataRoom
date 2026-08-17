import { resolveTier } from '@/lib/db/schema'

/**
 * Marks material released at the confirmatory stage.
 *
 * Plain coloured type rather than a chip. The orange pill this replaces failed
 * contrast at badge size, and — more to the point — Sahel in the room means
 * exactly one thing: how far through a document you are. An access-stage fact
 * is not that, so it is set in Kola instead and simply reads as a word.
 *
 * Teaser and diligence are the ordinary case and stay unlabelled; a note on
 * every row is noise, not information.
 */
export function StageNote({ tier, folderTier }: { tier: string; folderTier: string }) {
  if (resolveTier({ tier }, { tier: folderTier }) !== 'confirmatory') return null

  return (
    <span style={{ color: 'var(--tag)' }} title="Released to you at the confirmatory diligence stage">
      Released to you
    </span>
  )
}
