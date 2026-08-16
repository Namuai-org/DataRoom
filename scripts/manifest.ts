/**
 * The data room manifest.
 *
 * A hand-curated mapping from Namu's working files to the ten data room
 * folders. Nothing here is inferred at runtime: every entry names one real
 * source file, the folder it belongs in, the title a visitor will read, and a
 * one-line description of what is actually inside it.
 *
 * `sourcePath` is relative to SOURCE_ROOT (the namu-design working directory).
 * Override that root with NAMU_SOURCE_ROOT if the files live elsewhere on the
 * machine running the ingest.
 *
 * Curation rules applied here:
 *  - PDF is preferred wherever a document exists as both .html and .pdf.
 *  - .xlsx is included only where the spreadsheet is the document.
 *  - Where the same document exists in two places, the newest, most complete
 *    copy is used once and the others are left out.
 *  - Agreement templates live in 02-Corporate & Legal Affair. 06- Team holds
 *    the people documents: who is here, what they do, and the policies that
 *    apply to them.
 *  - sortOrder is per folder, starting at 1, most important document first.
 */

import type { FolderSlug } from '../lib/brand'

/** The namu-design working directory that holds every source document. */
export const SOURCE_ROOT =
  process.env.NAMU_SOURCE_ROOT ?? '/Users/mouhamad/Desktop/Namu/namu-design'

export interface ManifestEntry {
  /** Matches a slug in FOLDER_BLUEPRINT. */
  folderSlug: FolderSlug
  /** Path relative to SOURCE_ROOT. May contain spaces. */
  sourcePath: string
  /** What the visitor sees. A clean human title, never the file name. */
  title: string
  /** One line describing what the document contains. */
  description?: string
  /** Position within the folder. 1 is first. */
  sortOrder: number
  /**
   * Overrides the name a visitor downloads, for the few sources whose file name
   * says nothing useful. It is also the ingest's identity key — (folder, file
   * name) is how a re-run finds the row it wrote last time — so change it only
   * when you mean to replace the document rather than retitle it.
   */
  fileName?: string
}

export const manifest: ManifestEntry[] = [
  /* ---------------------------------------------------------------------- */
  /*  01-Company Overview                                                    */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'company-overview',
    sourcePath: 'momowork/namu-executive-summary.pdf',
    title: 'Executive Summary',
    description:
      'The three-page account of what Namu builds, why it started with Hausa, and where the company stands today.',
    sortOrder: 1,
  },
  {
    folderSlug: 'company-overview',
    sourcePath: 'momowork/namu-one-pager.pdf',
    title: 'Company One-Pager',
    description:
      'Namu on a single page: the problem, the product, the market, and the current numbers.',
    sortOrder: 2,
  },
  {
    folderSlug: 'company-overview',
    sourcePath: 'data-room/namu-company-overview.pdf',
    title: 'Company Overview',
    description:
      'A fuller introduction covering focus, geography, purpose, product, and how the company is organised.',
    sortOrder: 3,
  },
  {
    folderSlug: 'company-overview',
    sourcePath: 'momowork/namu-business-model-overview.pdf',
    title: 'Business Model Overview',
    description:
      'How Namu earns revenue: a deployment fee to launch a voice service and an ongoing contract to operate it.',
    sortOrder: 4,
  },
  {
    folderSlug: 'company-overview',
    sourcePath: 'momowork/namu-strategy.pdf',
    title: 'Company Strategy',
    description:
      'Mission, vision, positioning, and the sequence in which Namu intends to build and expand.',
    sortOrder: 5,
  },
  {
    folderSlug: 'company-overview',
    sourcePath: 'momowork/Namu_Business_Model_Canvas.pdf',
    title: 'Business Model Canvas',
    description:
      'The nine blocks of the canvas filled in for Namu: segments, channels, resources, activities, costs, and revenue.',
    sortOrder: 6,
  },

  /* ---------------------------------------------------------------------- */
  /*  02-Corporate & Legal Affair                                            */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'legal/namu-legal-documents-pack.pdf',
    title: 'Legal Documents Pack',
    description:
      'The index to Namu’s standing legal templates, with a short note on what each agreement covers and when it is used.',
    sortOrder: 1,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/founder-agreement/namu-founder-agreement-template.pdf',
    title: 'Founder Agreement (Template)',
    description:
      'Roles, equity, vesting, decision rights, and departure terms between the founders.',
    sortOrder: 2,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/shareholders-agreement/namu-shareholders-agreement-template.pdf',
    title: 'Shareholders Agreement (Template)',
    description:
      'Share classes, transfer restrictions, board and voting arrangements, and shareholder protections.',
    sortOrder: 3,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/exit-clause/namu-cofounder-exit-clause-template.pdf',
    title: 'Co-Founder Exit Clause (Template)',
    description:
      'What happens to equity, obligations, and company property when a founder leaves.',
    sortOrder: 4,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/cap-table/namu-cap-table-template.pdf',
    title: 'Cap Table (Template)',
    description:
      'The equity ownership template Namu maintains: holders, share counts, option pool, and fully diluted totals.',
    sortOrder: 5,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/esop-agreement/namu-esop-agreement-template.pdf',
    title: 'ESOP Agreement (Template)',
    description:
      'The employee share option terms: grant, vesting schedule, exercise, and what happens on leaving.',
    sortOrder: 6,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/ip-assignment-agreement/namu-ip-assignment-agreement-template.pdf',
    title: 'IP Assignment Agreement (Template)',
    description:
      'Assigns models, code, datasets, and other work product created for Namu to the company.',
    sortOrder: 7,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/employment-contract/namu-employment-agreement-template.pdf',
    title: 'Employment Agreement (Template)',
    description:
      'The standard employment terms: role, compensation, confidentiality, IP ownership, and termination.',
    sortOrder: 8,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/offer-letter/namu-offer-letter-template.pdf',
    title: 'Offer Letter (Template)',
    description: 'The letter sent to a candidate, setting out title, start date, pay, and conditions.',
    sortOrder: 9,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'legal/namu-contractor-agreement.pdf',
    title: 'Contractor Agreement (Template)',
    description:
      'Terms for contract work: scope, payment, confidentiality, data access, and ownership of what is produced.',
    sortOrder: 10,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/nda-agreement/namu-nda-template.pdf',
    title: 'Mutual Non-Disclosure Agreement (Template)',
    description:
      'The mutual confidentiality agreement Namu uses with partners, candidates, and counterparties.',
    sortOrder: 11,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'legal/namu-internship-agreement.pdf',
    title: 'Internship Agreement (Template)',
    description:
      'Terms for research interns, including supervision, confidentiality, and assignment of research output.',
    sortOrder: 12,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'templates/terms-of-service/namu-terms-of-service-template.pdf',
    title: 'Terms of Service (Template)',
    description: 'The service terms offered to organisations that deploy a Namu voice service.',
    sortOrder: 13,
  },
  {
    folderSlug: 'corporate-legal',
    sourcePath: 'legal/namu-privacy-agreement.pdf',
    title: 'Privacy and Data Handling Agreement (Template)',
    description:
      'The contractual side of data handling: what Namu collects, how it is processed, and the obligations on each party.',
    sortOrder: 14,
  },

  /* ---------------------------------------------------------------------- */
  /*  03-Risk Management                                                     */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'risk-management',
    sourcePath: 'momowork/risk-and-management/Namu_Risk_Register.xlsx',
    title: 'Risk Register',
    description:
      'Every identified risk with its likelihood, impact, owner, and the mitigation currently in place.',
    sortOrder: 1,
  },
  {
    folderSlug: 'risk-management',
    sourcePath: 'momowork/risk-and-management/Namu_Information_Security_Policy.pdf',
    title: 'Information Security Policy',
    description:
      'How Namu handles accounts, devices, access control, keys, backups, and third-party services.',
    sortOrder: 2,
  },
  {
    folderSlug: 'risk-management',
    sourcePath: 'momowork/risk-and-management/Namu_Data_Privacy_and_Consent.pdf',
    title: 'Data Privacy and Consent',
    description:
      'What voice data Namu records, how consent is obtained from callers, and how recordings are stored, used, and retained.',
    sortOrder: 3,
  },
  {
    folderSlug: 'risk-management',
    sourcePath: 'momowork/risk-and-management/Namu_Incident_Response_Plan.pdf',
    title: 'Incident Response Plan',
    description:
      'The steps taken when a security or data incident occurs: detection, containment, notification, and review.',
    sortOrder: 4,
  },
  {
    folderSlug: 'risk-management',
    sourcePath: 'momowork/risk-and-management/Namu_Regulatory_and_Compliance_Matrix.xlsx',
    title: 'Regulatory and Compliance Matrix',
    description:
      'The regulations that apply across Namu’s operating markets, mapped to the company’s current position on each.',
    sortOrder: 5,
  },
  {
    folderSlug: 'risk-management',
    sourcePath:
      'momowork/risk-and-management/12_Insurance_and_Risk_Transfer/Namu_Insurance_and_Risk_Transfer.pdf',
    title: 'Insurance and Risk Transfer',
    description:
      'Namu’s current insurance position, which is none, and the coverage planned as pilots become paid deployments.',
    sortOrder: 6,
  },
  {
    folderSlug: 'risk-management',
    sourcePath:
      'momowork/risk-and-management/12_Insurance_and_Risk_Transfer/Namu_Insurance_Policy_Register.xlsx',
    title: 'Insurance Policy Register',
    description: 'The register that records each policy, its carrier, limits, and renewal date as cover is added.',
    sortOrder: 7,
  },

  /* ---------------------------------------------------------------------- */
  /*  04-Accounting & Financials                                             */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/Namu_Financial_Snapshot.pdf',
    title: 'Financial Snapshot',
    description:
      'Cash, income, expenses, and near-term needs on two pages, reconciled to the statements in this folder.',
    sortOrder: 1,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'financial-model/Namu_Financial_Model_2026-2031.xlsx',
    title: 'Financial Model 2026–2031',
    description:
      'The six-year operating model: deployment and subscription revenue, headcount, costs, and cash, with the assumptions exposed.',
    sortOrder: 2,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Profit_and_Loss.xlsx',
    title: 'Profit and Loss',
    description: 'Income and expenses recorded to date, by line item and period.',
    sortOrder: 3,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Balance_Sheet.xlsx',
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity as recorded at the close of each period.',
    sortOrder: 4,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Cash_Flow_Statement.xlsx',
    title: 'Cash Flow Statement',
    description: 'Cash in and cash out by period, with the resulting balance.',
    sortOrder: 5,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Revenue_Schedule.xlsx',
    title: 'Revenue Schedule',
    description: 'Revenue recognised to date, broken out by source and by month.',
    sortOrder: 6,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Grant_Funding_Summary.xlsx',
    title: 'Grant Funding Summary',
    description: 'Each grant received or applied for, with amount, funder, status, and any conditions attached.',
    sortOrder: 7,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath: 'momowork/historical-financial-statements/Namu_Payroll_and_Contractor_Summary.xlsx',
    title: 'Payroll and Contractor Summary',
    description: 'Everyone paid by Namu to date, what they were paid, and under which arrangement.',
    sortOrder: 8,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath:
      'momowork/historical-financial-statements/Namu_Founder_Contributions_and_Reimbursements.xlsx',
    title: 'Founder Contributions and Reimbursements',
    description:
      'Money the founders put into the company, what it paid for, and what has been reimbursed.',
    sortOrder: 9,
  },
  {
    folderSlug: 'accounting-financials',
    sourcePath:
      'momowork/historical-financial-statements/Namu_Financial_Supporting_Evidence_Index.xlsx',
    title: 'Supporting Evidence Index',
    description:
      'The index tying each financial line back to its receipt, invoice, or bank record.',
    sortOrder: 10,
  },

  /* ---------------------------------------------------------------------- */
  /*  05-Market Research                                                     */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'market-research',
    sourcePath: 'momowork/namu-market-overview.pdf',
    title: 'Market Overview',
    description:
      'The market Namu is entering: who is underserved by text-first tools, what they use instead, and what that costs organisations.',
    sortOrder: 1,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'Namu Market Research.pdf',
    title: 'Market Research Memo',
    description:
      'The full research memo on speech-native AI for African languages, starting with Hausa and the Niger market.',
    sortOrder: 2,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'Namu Market Landscape Report.pdf',
    title: 'Market Landscape Report',
    description:
      'An external landscape report prepared for Namu by ASHA Consulting Group in August 2026.',
    sortOrder: 3,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'market-sizing/namu-tam-sam-som-visual.pdf',
    title: 'TAM, SAM, SOM',
    description:
      'The market sizing on one page: total addressable, serviceable, and obtainable, with the reasoning behind each figure.',
    sortOrder: 4,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'momowork/Namu_TAM_SAM_SOM.xlsx',
    title: 'Market Sizing Workbook',
    description:
      'The workbook behind the sizing, with every input, source, and calculation available to change.',
    sortOrder: 5,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'momowork/Namu_Competitive_Landscape.pdf',
    title: 'Competitive Landscape',
    description:
      'Who else works on African-language speech and voice deployment, what each covers, and where Namu differs.',
    sortOrder: 6,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'momowork/Namu_Go_to_Market_Research.pdf',
    title: 'Go-to-Market Research',
    description:
      'How organisations in this market buy, who signs, how long it takes, and which channels reach them.',
    sortOrder: 7,
  },
  {
    folderSlug: 'market-research',
    sourcePath: 'momowork/Namu_Primary_Research_Findings.pdf',
    title: 'Primary Research Findings',
    description:
      'What came out of 20 interviews with NGOs operating in Niger, from 52 organisations contacted.',
    sortOrder: 8,
  },

  /* ---------------------------------------------------------------------- */
  /*  06- Team                                                               */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'team',
    sourcePath: 'momowork/team/Namu_Team_Overview.pdf',
    title: 'Team Overview',
    description:
      'Who is on the team, what each person is responsible for, and why this team fits this problem.',
    sortOrder: 1,
  },
  {
    folderSlug: 'team',
    sourcePath: 'momowork/team/Namu_Founder_Bios.pdf',
    title: 'Founder Bios',
    description: 'Background, training, and prior work of the two founders.',
    sortOrder: 2,
  },
  {
    folderSlug: 'team',
    sourcePath: 'momowork/team/Namu_Current_Team.xlsx',
    title: 'Current Team Roster',
    description:
      'The roster: every person working with Namu, their role, engagement type, and start date.',
    sortOrder: 3,
  },
  {
    folderSlug: 'team',
    sourcePath: 'namu-employee-handbook.pdf',
    title: 'Employee Handbook',
    description:
      'The internal reference on how Namu works: expectations, communication, working practice, and workplace policies.',
    sortOrder: 4,
  },
  {
    folderSlug: 'team',
    sourcePath: 'templates/hr-policies/namu-hr-policies-template.pdf',
    title: 'HR Policies',
    description:
      'The people operations policies covering hiring, leave, conduct, performance, and offboarding.',
    sortOrder: 5,
  },

  /* ---------------------------------------------------------------------- */
  /*  07-Sales & Customers Information                                       */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'sales-customers',
    sourcePath: 'momowork/sales-and-customer-information/Namu_Sales_and_Traction_Overview.pdf',
    title: 'Sales and Traction Overview',
    description:
      'Where demand is coming from and what has been proven so far, including pilot usage and repeat calls to Kura.',
    sortOrder: 1,
  },
  {
    folderSlug: 'sales-customers',
    sourcePath: 'momowork/sales-and-customer-information/Namu_Sales_Pipeline.xlsx',
    title: 'Sales Pipeline',
    description:
      'Every organisation in conversation with Namu, the stage it is at, and the next step on each.',
    sortOrder: 2,
  },
  {
    folderSlug: 'sales-customers',
    sourcePath: 'momowork/Namu_Customer_Segments_and_ICP.pdf',
    title: 'Customer Segments and ICP',
    description:
      'The distinction between the user who calls and the organisation that pays, and the profile of the customer Namu is built for.',
    sortOrder: 3,
  },
  {
    folderSlug: 'sales-customers',
    sourcePath: 'namu-ngo-pricing-visual.pdf',
    title: 'NGO Product Pricing',
    description:
      'How Namu prices a voice support line for an NGO: what is included at deployment and what is charged to run it.',
    sortOrder: 4,
  },
  {
    folderSlug: 'sales-customers',
    sourcePath: 'namu-lettre-iqra-collaboration.pdf',
    title: 'Collaboration Request — Cabinet IQRA',
    description:
      'The collaboration letter sent to Cabinet IQRA in July 2026, in French. Included as a record of partner outreach.',
    sortOrder: 5,
  },
  {
    folderSlug: 'sales-customers',
    sourcePath: 'letters/collaboration-research-niger/namu-demande-collaboration-recherche-niger.pdf',
    title: 'Research Collaboration Request — Niger',
    description:
      'The letter, in French, requesting collaboration on community needs research in Niger. Included as a record of field access.',
    sortOrder: 6,
  },

  /* ---------------------------------------------------------------------- */
  /*  08-Product & Technology                                                */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'product-technology',
    sourcePath: 'namu-state-of-art-roadmap.pdf',
    title: 'State of the Art and IP Landscape Assessment',
    description:
      'The technical assessment: where speech models for low-resource languages currently stand, Namu’s data position, patent exposure, and the regulatory path.',
    sortOrder: 1,
  },
  {
    folderSlug: 'product-technology',
    sourcePath: 'momowork/Namu_Milestones_and_Roadmap.pdf',
    title: 'Milestones and Roadmap',
    description:
      'What has been built, what is being proven now with Kura, and what has to happen next, with dates.',
    sortOrder: 2,
  },

  /* ---------------------------------------------------------------------- */
  /*  09-Marketing                                                           */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'marketing',
    sourcePath: 'namu-deck/export/NAMU.pdf',
    title: 'Investor Deck',
    description:
      'The current 28-slide investor deck: story, product, business, and the ask.',
    sortOrder: 1,
    // The source is called NAMU.pdf, which tells a reader nothing once it is
    // sitting in their downloads folder.
    fileName: 'Namu-Investor-Deck.pdf',
  },
  {
    folderSlug: 'marketing',
    sourcePath: 'presentations/namu-full-pitch-deck.pdf',
    title: 'Full Pitch Deck',
    description:
      'The long-form deck, which carries more written detail per slide than the investor deck.',
    sortOrder: 2,
  },
  {
    folderSlug: 'marketing',
    sourcePath: 'namu-value-proposition-matrix-branded.pdf',
    title: 'Value Proposition Matrix',
    description:
      'Each customer segment set against the job it needs done, the pain it carries, and what Namu offers in return.',
    sortOrder: 3,
  },
  {
    folderSlug: 'marketing',
    sourcePath: 'namu-brand-board.pdf',
    title: 'Brand Board',
    description:
      'The brand system: colour, type, proportion, logo use, and the reasoning behind each choice.',
    sortOrder: 4,
  },
  {
    folderSlug: 'marketing',
    sourcePath: 'namu-brand-presentation.pdf',
    title: 'Brand Presentation',
    description: 'The brand applied: identity, voice, and how Namu presents itself in public material.',
    sortOrder: 5,
  },

  /* ---------------------------------------------------------------------- */
  /*  10-FAQ                                                                 */
  /* ---------------------------------------------------------------------- */
  {
    folderSlug: 'faq',
    sourcePath: 'momowork/Namu_Investor_FAQ.pdf',
    title: 'Investor FAQ',
    description:
      'Direct answers to the questions investors ask most often about Namu, Kura, the market, and what comes next.',
    sortOrder: 1,
  },
]

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Absolute path to an entry's source file. Handles spaces and accents. */
export function resolveSourcePath(entry: ManifestEntry): string {
  return `${SOURCE_ROOT}/${entry.sourcePath}`
}

/**
 * The file name a visitor downloads: the source's own name on disk unless the
 * entry overrides it. Spaces and accents are kept — the download route sets a
 * Content-Disposition header that handles them.
 */
export function sourceFileName(entry: ManifestEntry): string {
  if (entry.fileName) return entry.fileName
  const parts = entry.sourcePath.split('/')
  return parts[parts.length - 1] ?? entry.sourcePath
}

/**
 * A blob-safe file name. Vercel Blob accepts most characters, but a pathname
 * with spaces and accents is awkward in logs, in URLs, and in support tickets,
 * so we normalise it. The visitor never sees this; they see `title` in the room
 * and the original file name on download.
 */
export function sanitiseFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''

  const cleanStem =
    stem
      .normalize('NFD')
      // Strip combining accents so "démande" becomes "demande".
      .replace(/\p{M}+/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'document'

  return ext ? `${cleanStem}.${ext.replace(/[^a-z0-9]/g, '')}` : cleanStem
}

/** Entries for one folder, in sortOrder. */
export function entriesForFolder(slug: FolderSlug): ManifestEntry[] {
  return manifest
    .filter((entry) => entry.folderSlug === slug)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Structural problems that would make an ingest ambiguous. Called by the ingest
 * before it touches anything, so a bad manifest fails loudly and immediately
 * rather than half way through an upload run.
 */
export function validateManifest(entries: ManifestEntry[] = manifest): string[] {
  const problems: string[] = []
  const seenSource = new Map<string, string>()
  const seenBlobPath = new Map<string, string>()
  const seenOrder = new Map<string, string>()

  for (const entry of entries) {
    const label = `${entry.folderSlug}/${entry.title}`

    const priorSource = seenSource.get(entry.sourcePath)
    if (priorSource) {
      problems.push(`${entry.sourcePath} is used twice: "${priorSource}" and "${label}"`)
    } else {
      seenSource.set(entry.sourcePath, label)
    }

    const blobKey = `${entry.folderSlug}/${sanitiseFileName(sourceFileName(entry))}`
    const priorBlob = seenBlobPath.get(blobKey)
    if (priorBlob) {
      problems.push(`blob path ${blobKey} collides: "${priorBlob}" and "${label}"`)
    } else {
      seenBlobPath.set(blobKey, label)
    }

    const orderKey = `${entry.folderSlug}#${entry.sortOrder}`
    const priorOrder = seenOrder.get(orderKey)
    if (priorOrder) {
      problems.push(`sortOrder ${entry.sortOrder} used twice in ${entry.folderSlug}: "${priorOrder}" and "${label}"`)
    } else {
      seenOrder.set(orderKey, label)
    }
  }

  return problems
}
