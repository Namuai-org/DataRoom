import 'server-only'
import { db } from '@/lib/db'
import { documents, folders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * What investors expect to find in a seed-stage data room.
 *
 * Compiled from a16z's data room guide, Carta's diligence categories, and the
 * common VC checklist. The point of this list is not to be exhaustive — it is
 * to catch the omissions that reliably stall a raise, so they can be fixed
 * before the room is sent rather than discovered in a partner meeting.
 *
 * `matchers` are lowercase substrings tested against document titles and file
 * names in the target folder. They are deliberately loose: a false positive
 * costs nothing, a false negative just leaves an item marked missing.
 */

export type Importance = 'essential' | 'expected' | 'helpful'

export type ChecklistItem = {
  id: string
  label: string
  folderSlug: string
  importance: Importance
  /** Why an investor wants it — shown when the item is missing. */
  why: string
  matchers: string[]
}

export const DILIGENCE_CHECKLIST: ChecklistItem[] = [
  /* -- 01 Company Overview ------------------------------------------------ */
  {
    id: 'deck',
    label: 'Pitch deck',
    folderSlug: 'company-overview',
    importance: 'essential',
    why: 'The first thing every investor opens. a16z lists it as the single most important item in the room.',
    matchers: ['deck', 'pitch'],
  },
  {
    id: 'exec-summary',
    label: 'Executive summary',
    folderSlug: 'company-overview',
    importance: 'essential',
    why: 'A one-read explanation partners forward internally when they cannot forward a meeting.',
    matchers: ['executive summary', 'one-pager', 'one pager', 'overview'],
  },
  {
    id: 'strategy',
    label: 'Strategy / business model',
    folderSlug: 'company-overview',
    importance: 'expected',
    why: 'Shows how the company intends to make money, not only what it builds.',
    matchers: ['strategy', 'business model', 'canvas'],
  },

  /* -- 02 Corporate & Legal ----------------------------------------------- */
  {
    id: 'incorporation',
    label: 'Certificate of incorporation',
    folderSlug: 'corporate-legal',
    importance: 'essential',
    why: 'Confirms the entity exists and where. Diligence cannot close without it.',
    matchers: ['incorporation', 'certificate', 'articles', 'formation', 'bylaws'],
  },
  {
    id: 'cap-table',
    label: 'Cap table',
    folderSlug: 'corporate-legal',
    importance: 'essential',
    why: 'Who owns what, including options and SAFEs. Investors will not write a term sheet without it.',
    matchers: ['cap table', 'capitalization', 'captable', 'ownership', 'shareholding'],
  },
  {
    id: 'prior-financing',
    label: 'Prior financing documents',
    folderSlug: 'corporate-legal',
    importance: 'expected',
    why: 'SAFEs, notes, and prior rounds determine what the new money actually buys.',
    matchers: ['safe', 'convertible', 'note', 'financing', 'subscription', 'shareholders'],
  },
  {
    id: 'ip-assignment',
    label: 'IP assignment agreements',
    folderSlug: 'corporate-legal',
    importance: 'essential',
    why: 'Proves the company, not the founders personally, owns the technology.',
    matchers: ['ip assignment', 'intellectual property', 'assignment'],
  },

  /* -- 03 Risk Management -------------------------------------------------- */
  {
    id: 'risk-register',
    label: 'Risk register',
    folderSlug: 'risk-management',
    importance: 'expected',
    why: 'Naming your own risks reads as maturity. Investors find them anyway.',
    matchers: ['risk register', 'risk'],
  },
  {
    id: 'infosec',
    label: 'Information security policy',
    folderSlug: 'risk-management',
    importance: 'expected',
    why: 'Any buyer handling user voice data will ask how it is protected.',
    matchers: ['security', 'infosec'],
  },
  {
    id: 'data-privacy',
    label: 'Data privacy and consent',
    folderSlug: 'risk-management',
    importance: 'essential',
    why: 'Namu records speech from real people. Consent provenance is a gating question for both investors and NGO customers.',
    matchers: ['privacy', 'consent', 'gdpr', 'data protection'],
  },

  /* -- 04 Accounting & Financials ----------------------------------------- */
  {
    id: 'historical-financials',
    label: 'Historical financial statements',
    folderSlug: 'accounting-financials',
    importance: 'essential',
    why: 'a16z asks for monthly P&L, not quarterly — gross revenue through net income through cash out.',
    matchers: ['profit and loss', 'p&l', 'balance sheet', 'cash flow', 'income statement', 'financial statement'],
  },
  {
    id: 'financial-model',
    label: 'Financial model / projections',
    folderSlug: 'accounting-financials',
    importance: 'essential',
    why: 'One linked model. Numbers that disagree with the deck are the most common reason diligence stalls.',
    matchers: ['model', 'projection', 'forecast'],
  },
  {
    id: 'runway',
    label: 'Runway and use of funds',
    folderSlug: 'accounting-financials',
    importance: 'expected',
    why: 'How long the money lasts and what it buys. Asked in almost every first call.',
    matchers: ['runway', 'use of funds', 'burn', 'budget'],
  },
  {
    id: 'grants',
    label: 'Grant funding summary',
    folderSlug: 'accounting-financials',
    importance: 'helpful',
    why: 'Non-dilutive funding strengthens the story and explains historical cash.',
    matchers: ['grant', 'funding summary'],
  },

  /* -- 05 Market Research -------------------------------------------------- */
  {
    id: 'market-size',
    label: 'Market sizing (TAM/SAM/SOM)',
    folderSlug: 'market-research',
    importance: 'expected',
    why: 'Needed here because voice AI for low-resource languages is a sector investors cannot size from memory.',
    matchers: ['tam', 'sam', 'som', 'market siz', 'market landscape'],
  },
  {
    id: 'competitive',
    label: 'Competitive landscape',
    folderSlug: 'market-research',
    importance: 'expected',
    why: 'Shows you know who else is in the space and why you win.',
    matchers: ['competitive', 'competitor', 'landscape'],
  },
  {
    id: 'primary-research',
    label: 'Primary research findings',
    folderSlug: 'market-research',
    importance: 'helpful',
    why: 'Field evidence from Niger is a genuine differentiator most companies cannot show.',
    matchers: ['primary research', 'research finding', 'user research', 'field'],
  },

  /* -- 06 Team ------------------------------------------------------------- */
  {
    id: 'founder-bios',
    label: 'Founder bios',
    folderSlug: 'team',
    importance: 'essential',
    why: 'At seed, the team is most of the decision.',
    matchers: ['founder', 'bio', 'team overview'],
  },
  {
    id: 'team-roster',
    label: 'Current team and hiring plan',
    folderSlug: 'team',
    importance: 'expected',
    why: 'Who is here now, who the round hires next.',
    matchers: ['current team', 'roster', 'hiring', 'org'],
  },
  {
    id: 'founder-agreement',
    label: 'Founder agreements and vesting',
    folderSlug: 'team',
    importance: 'essential',
    why: 'Unvested founders are a deal risk. Investors check this early.',
    matchers: ['founder agreement', 'vesting', 'cofounder', 'co-founder'],
  },

  /* -- 07 Sales & Customers ------------------------------------------------ */
  {
    id: 'traction',
    label: 'Traction and usage metrics',
    folderSlug: 'sales-customers',
    importance: 'essential',
    why: 'Namu has real numbers — 240+ pilot users, 1,400+ calls, 5,500+ minutes. Show the full cohort, not the best month.',
    matchers: ['traction', 'metric', 'usage', 'sales and traction'],
  },
  {
    id: 'pipeline',
    label: 'Sales pipeline',
    folderSlug: 'sales-customers',
    importance: 'expected',
    why: 'The 12 interested NGOs are the strongest near-term revenue signal you have.',
    matchers: ['pipeline', 'crm', 'prospect'],
  },
  {
    id: 'icp',
    label: 'Customer segments / ICP',
    folderSlug: 'sales-customers',
    importance: 'expected',
    why: 'Shows you know exactly who pays, versus who benefits.',
    matchers: ['segment', 'icp', 'customer'],
  },
  {
    id: 'letters-of-intent',
    label: 'Letters of intent or customer contracts',
    folderSlug: 'sales-customers',
    importance: 'expected',
    why: 'Turns "12 NGOs interested" into something an investor can underwrite.',
    matchers: ['loi', 'letter of intent', 'contract', 'agreement', 'mou'],
  },

  /* -- 08 Product & Technology --------------------------------------------- */
  {
    id: 'roadmap',
    label: 'Product roadmap',
    folderSlug: 'product-technology',
    importance: 'essential',
    why: 'What gets built with the money, and in what order.',
    matchers: ['roadmap', 'milestone'],
  },
  {
    id: 'architecture',
    label: 'Technical architecture',
    folderSlug: 'product-technology',
    importance: 'expected',
    why: 'How the speech models and telephony stack actually fit together.',
    matchers: ['architecture', 'technical', 'system', 'infrastructure', 'stack'],
  },
  {
    id: 'demo',
    label: 'Product demo or walkthrough',
    folderSlug: 'product-technology',
    importance: 'helpful',
    why: 'A Kura call recording is more persuasive than any slide about it.',
    matchers: ['demo', 'walkthrough', 'video', 'recording', 'kura'],
  },

  /* -- 09 Marketing -------------------------------------------------------- */
  {
    id: 'brand',
    label: 'Brand and positioning',
    folderSlug: 'marketing',
    importance: 'helpful',
    why: 'Signals the company is built to be seen, not only shipped.',
    matchers: ['brand', 'positioning', 'value proposition'],
  },

  /* -- 10 FAQ -------------------------------------------------------------- */
  {
    id: 'faq',
    label: 'Investor FAQ',
    folderSlug: 'faq',
    importance: 'expected',
    why: 'Answers the twenty questions you would otherwise answer twenty times.',
    matchers: ['faq', 'question'],
  },
]

export type ChecklistResult = {
  item: ChecklistItem
  present: boolean
  matchedTitles: string[]
  folderName: string
}

export type DiligenceReport = {
  results: ChecklistResult[]
  score: number
  essentialMissing: ChecklistResult[]
  expectedMissing: ChecklistResult[]
  byFolder: Record<string, { folderName: string; present: number; total: number }>
}

/**
 * Scores the room against the checklist. Essentials are weighted heaviest
 * because a missing essential is what actually stalls a raise.
 */
export async function runDiligenceCheck(): Promise<DiligenceReport> {
  const rows = await db
    .select({
      title: documents.title,
      fileName: documents.fileName,
      folderSlug: folders.slug,
      folderName: folders.name,
    })
    .from(documents)
    .innerJoin(folders, eq(documents.folderId, folders.id))

  const byFolderDocs = new Map<string, { title: string; fileName: string }[]>()
  const folderNames = new Map<string, string>()
  for (const row of rows) {
    folderNames.set(row.folderSlug, row.folderName)
    const list = byFolderDocs.get(row.folderSlug) ?? []
    list.push({ title: row.title, fileName: row.fileName })
    byFolderDocs.set(row.folderSlug, list)
  }

  const results: ChecklistResult[] = DILIGENCE_CHECKLIST.map((item) => {
    const docs = byFolderDocs.get(item.folderSlug) ?? []
    const matchedTitles = docs
      .filter((d) => {
        const haystack = `${d.title} ${d.fileName}`.toLowerCase()
        return item.matchers.some((m) => haystack.includes(m))
      })
      .map((d) => d.title)

    return {
      item,
      present: matchedTitles.length > 0,
      matchedTitles,
      folderName: folderNames.get(item.folderSlug) ?? item.folderSlug,
    }
  })

  const weights: Record<Importance, number> = { essential: 3, expected: 2, helpful: 1 }
  const earned = results.reduce((sum, r) => (r.present ? sum + weights[r.item.importance] : sum), 0)
  const total = results.reduce((sum, r) => sum + weights[r.item.importance], 0)

  const byFolder: DiligenceReport['byFolder'] = {}
  for (const r of results) {
    const key = r.item.folderSlug
    byFolder[key] ??= { folderName: r.folderName, present: 0, total: 0 }
    byFolder[key]!.total += 1
    if (r.present) byFolder[key]!.present += 1
  }

  return {
    results,
    score: total ? Math.round((earned / total) * 100) : 0,
    essentialMissing: results.filter((r) => !r.present && r.item.importance === 'essential'),
    expectedMissing: results.filter((r) => !r.present && r.item.importance === 'expected'),
    byFolder,
  }
}
