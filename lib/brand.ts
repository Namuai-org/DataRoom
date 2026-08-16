/**
 * Namu brand system, transcribed from the brand board
 * (namu-design/namu-brand-board.txt). These values are the single source of
 * truth for the data room; the CSS custom properties in globals.css mirror them.
 */

export const colors = {
  harmattan: '#F7F0E3', // primary background and warmth
  dryClay: '#EDD9B0', // secondary surface
  sahel: '#E8935A', // signature accent, the dot
  kola: '#6B3E1E', // secondary dark
  forest: '#1A3A2E', // depth accent
  ink: '#1C1410', // primary type and dark fields
} as const

/**
 * Colour proportion from the brand board: light space first, then dark
 * structure, then small moments of heat. Sahel is a precision accent — it marks
 * one thing per view, never decorates.
 */
export const proportion = {
  harmattan: 0.54,
  ink: 0.26,
  dryClay: 0.12,
  sahel: 0.08,
} as const

export const type = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const

export const brand = {
  name: 'Namu',
  legalName: 'Namu Inc.',
  tagline: 'Making AI work for every language and every community',
  descriptor: 'Namu is an African AI research and Technology company',
  site: 'namu-ai.org',
  contact: 'mouhamad@namuai.org',
} as const

/**
 * The ten data room folders. Order and naming follow the structure Mouhamad
 * specified; slugs are URL-safe and stable, so renaming a folder's display name
 * never breaks a link or an analytics history.
 *
 * `tier` is the disclosure stage a folder sits at, following the way diligence
 * material is normally released: a teaser in first conversations, the full set
 * once there is real interest, and the legal pack only once a term sheet is on
 * the table. Invite links default to the widest tier, so this only takes effect
 * for a link you deliberately narrow.
 */
export const FOLDER_BLUEPRINT = [
  {
    slug: 'company-overview',
    name: '01-Company Overview',
    tier: 'teaser',
    description:
      'What Namu is, the problem, the solution, mission and vision, and the executive summary.',
  },
  {
    slug: 'corporate-legal',
    name: '02-Corporate & Legal Affair',
    tier: 'confirmatory',
    description:
      'Incorporation, agreements, intellectual property assignment, and the standing legal pack.',
  },
  {
    slug: 'risk-management',
    name: '03-Risk Management',
    tier: 'diligence',
    description:
      'Risk register, information security policy, data privacy and consent, incident response, insurance.',
  },
  {
    slug: 'accounting-financials',
    name: '04-Accounting & Financials',
    tier: 'diligence',
    description:
      'Financial model, historical statements, cash flow, payroll, and grant funding.',
  },
  {
    slug: 'market-research',
    name: '05-Market Research',
    tier: 'teaser',
    description:
      'Market landscape, TAM/SAM/SOM, competitive analysis, go-to-market, and primary research findings.',
  },
  {
    slug: 'team',
    name: '06- Team',
    tier: 'diligence',
    description: 'Founders, current team, team agreements, and organisational structure.',
  },
  {
    slug: 'sales-customers',
    name: '07-Sales & Customers Information',
    tier: 'diligence',
    description: 'Traction, pipeline, customer segments, and the ideal customer profile.',
  },
  {
    slug: 'product-technology',
    name: '08-Product & Technology',
    tier: 'diligence',
    description: 'Kura, the technical roadmap, architecture, and product milestones.',
  },
  {
    slug: 'marketing',
    name: '09-Marketing',
    tier: 'teaser',
    description: 'Brand system, positioning, presentation material, and public collateral.',
  },
  {
    slug: 'faq',
    name: '10-FAQ',
    tier: 'teaser',
    description: 'Answers to the questions investors ask most often.',
  },
] as const

export type FolderSlug = (typeof FOLDER_BLUEPRINT)[number]['slug']

/** Strips the numeric prefix for display in tight spaces. */
export function displayFolderName(name: string): string {
  return name.replace(/^\d+\s*-\s*/, '').trim()
}

/** The "01" chip shown beside a folder name. */
export function folderIndex(name: string): string | null {
  const match = name.match(/^(\d+)/)
  return match ? match[1] : null
}
