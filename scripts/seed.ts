/**
 * Bootstraps an empty data room.
 *
 *   npm run seed
 *
 * Creates the ten folders, records the owner so someone can sign in, and writes
 * the room's default settings including the NDA a visitor accepts on the way
 * in. Run this once before `npm run ingest`.
 *
 * Idempotent by design, but deliberately conservative: settings you have since
 * changed in the admin console are left alone. Pass --reset-settings to put
 * every setting back to the defaults below.
 */

import { count, eq } from 'drizzle-orm'
import { brand } from '../lib/brand'
import * as schema from '../lib/db/schema'
import {
  type Db,
  fail,
  getDb,
  heading,
  loadEnv,
  note,
  ok,
  requireEnv,
  style,
  upsertFolders,
} from './shared'

const DEFAULT_OWNER_EMAIL = 'mouhamad@namuai.org'

/**
 * Setting keys are the contract between this script, the admin console, and the
 * visitor-facing room. They are duplicated from app/admin/_lib/settings.ts
 * because that module is server-only and cannot be imported from a script; keep
 * the two lists identical.
 */
const SETTINGS_KEYS = {
  roomTitle: 'room_title',
  welcomeMessage: 'room_welcome',
  ndaEnabled: 'nda_enabled',
  ndaVersion: 'nda_version',
  ndaText: 'nda_text',
  watermarkEnabled: 'watermark_enabled',
  defaultCanDownload: 'default_can_download',
  qaEnabled: 'qa_enabled',
} as const

const NDA_VERSION = '2026-08-v1'

/**
 * The confidentiality agreement a visitor accepts before the room opens.
 *
 * Written to be read rather than skipped: plain English, short sentences, and
 * only the obligations a seed-stage company actually needs. The signed name,
 * the version string, and a hash of this exact text are recorded at acceptance,
 * so revising it later does not disturb signatures already collected.
 */
const NDA_TEXT = `MUTUAL CONFIDENTIALITY AGREEMENT

This agreement is between ${brand.legalName} ("Namu") and you, together with the firm you represent ("you"). It takes effect when you accept it and covers everything you see in this room from that moment.

1. What is confidential.
Everything in this room. The documents, the financial model and its assumptions, research findings, customer and pipeline information, technical material, team and compensation details, and the fact and content of our conversations. It also covers anything you tell us that you mark as confidential. If you are unsure whether something is covered, treat it as covered.

2. What you may do with it.
Use it for one purpose: deciding whether to invest in, partner with, or advise Namu, and acting on that decision. You may share it inside your firm with the people who need it for that purpose, and with your lawyers and accountants, provided they are bound by obligations at least as strict as these. You remain responsible for what they do with it.

3. What you may not do with it.
Do not publish it or pass it outside that group. Do not use it to compete with Namu, to build a competing product, or to inform an investment in a competitor. Do not use it to solicit Namu's employees, contractors, or customers. Do not reverse engineer or retrain on any model, dataset, or technical material described here.

4. How to look after it.
Protect it at least as carefully as your own confidential information, and never with less than reasonable care. Keep it in systems your firm controls and tell us promptly if it is lost or exposed.

5. What is not covered.
Information that was already public, or becomes public through no act of yours; that you already held without a duty of confidence; that a third party gives you with the right to disclose it; or that you develop independently without reference to anything here.

6. If you are legally compelled.
If a court, regulator, or law requires disclosure, disclose only what is required. Where you are lawfully able to, tell us first and give us a reasonable chance to respond.

7. How long this lasts.
Three years from the date you accept. Trade secrets stay protected for as long as they remain trade secrets under applicable law.

8. Returning or deleting material.
If either of us asks, stop using the material and delete the copies you hold. You may keep one archival copy where your compliance rules require it; this agreement continues to apply to it.

9. What this agreement is not.
Nothing here grants you a licence or ownership in Namu's intellectual property, obliges either of us to enter into a transaction, or creates an exclusive arrangement. Everything is provided as it stands, without warranty. Forward-looking figures are estimates, not promises.

10. Acceptance.
You accept by entering your name and continuing into the room. We record your name, the version of this text, the time, and the address you accepted from.`

/* -------------------------------------------------------------------------- */
/*  Steps                                                                      */
/* -------------------------------------------------------------------------- */

async function seedOwner(db: Db): Promise<void> {
  const email = (process.env.OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase()

  const [existing] = await db.select({ total: count() }).from(schema.admins)
  if ((existing?.total ?? 0) > 0) {
    const [owner] = await db
      .select({ email: schema.admins.email })
      .from(schema.admins)
      .where(eq(schema.admins.isOwner, true))
      .limit(1)
    ok(`admins already seeded${owner ? ` — owner is ${owner.email}` : ''}`)
    return
  }

  await db.insert(schema.admins).values({ email, isOwner: true })
  ok(`owner admin created — ${email}`)
  note('sign in at /admin; a one-time code is emailed to that address')
}

interface SettingSeed {
  key: string
  value: string | boolean
  label: string
}

function defaultSettings(): SettingSeed[] {
  return [
    {
      key: SETTINGS_KEYS.roomTitle,
      value: `${brand.name} — Data Room`,
      label: 'room title',
    },
    {
      key: SETTINGS_KEYS.welcomeMessage,
      value:
        `${brand.descriptor}. This room holds the material behind that sentence: what we are building, ` +
        'what we have proven so far, what the numbers actually say, and where the risks sit. ' +
        'It is prepared for a small number of readers and it is confidential. Read in any order; ' +
        'the folders are numbered in the order most people find useful. If something is missing or ' +
        `unclear, write to ${brand.contact} and we will answer directly.`,
      label: 'welcome message',
    },
    { key: SETTINGS_KEYS.ndaEnabled, value: true, label: 'NDA required' },
    { key: SETTINGS_KEYS.ndaVersion, value: NDA_VERSION, label: 'NDA version' },
    { key: SETTINGS_KEYS.ndaText, value: NDA_TEXT, label: 'NDA text' },
    { key: SETTINGS_KEYS.watermarkEnabled, value: true, label: 'watermark' },
    { key: SETTINGS_KEYS.defaultCanDownload, value: false, label: 'downloads off by default' },
    { key: SETTINGS_KEYS.qaEnabled, value: true, label: 'in-room questions' },
  ]
}

async function seedSettings(db: Db, reset: boolean): Promise<void> {
  const rows = await db.select({ key: schema.settings.key }).from(schema.settings)
  const present = new Set(rows.map((row) => row.key))

  let written = 0
  let kept = 0

  for (const setting of defaultSettings()) {
    if (present.has(setting.key) && !reset) {
      kept++
      continue
    }
    const now = new Date()
    await db
      .insert(schema.settings)
      .values({ key: setting.key, value: setting.value, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: setting.value, updatedAt: now },
      })
    written++
  }

  if (written > 0) ok(`${written} settings written${reset ? ' (reset to defaults)' : ''}`)
  if (kept > 0) {
    ok(`${kept} existing settings left as they are`)
    note('pass --reset-settings to overwrite them with the defaults in this script')
  }
  note(`NDA version ${NDA_VERSION}, ${NDA_TEXT.split(/\s+/).length} words`)
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        '',
        'Usage: npm run seed -- [options]',
        '',
        '  --reset-settings   overwrite existing settings with the defaults in this script',
        '',
        '  OWNER_EMAIL        the owner address to seed (default mouhamad@namuai.org)',
        '',
      ].join('\n'),
    )
    return
  }

  const reset = args.includes('--reset-settings')

  heading('Namu data room — seed')

  loadEnv()
  requireEnv(['DATABASE_URL'])

  const db = await getDb()

  const folderIds = await upsertFolders(db)
  ok(`${folderIds.size} folders in place`)

  await seedOwner(db)
  await seedSettings(db, reset)

  console.log('')
  note(`next: ${style.bold('npm run ingest -- --dry-run')}, then ${style.bold('npm run ingest')}`)
  console.log('')
}

main().catch((error: unknown) => {
  console.error('')
  fail(error instanceof Error ? error.message : String(error))
  if (error instanceof Error && error.stack && process.env.DEBUG) console.error(error.stack)
  process.exit(1)
})
