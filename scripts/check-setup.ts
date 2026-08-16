/**
 * Pre-flight check: `npm run check`
 *
 * Answers one question — is this environment ready to run the data room? — and
 * says exactly what to do about anything that is not. Written to be run before
 * the first deploy and again whenever something behaves oddly.
 *
 * It only reads. Nothing here writes to the database or to Blob storage.
 */

import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
config({ path: resolve(process.cwd(), '.env'), quiet: true })

type Status = 'ok' | 'warn' | 'fail'

type Check = {
  name: string
  status: Status
  detail: string
  fix?: string
}

const results: Check[] = []

function add(name: string, status: Status, detail: string, fix?: string): void {
  results.push({ name, status, detail, fix })
}

/* -------------------------------------------------------------------------- */
/*  Environment                                                                */
/* -------------------------------------------------------------------------- */

function checkEnv(): void {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    add(
      'DATABASE_URL',
      'fail',
      'Not set — the room cannot store visitors or analytics.',
      'Vercel dashboard → Storage → Create Database → Neon, then: npx vercel env pull .env.local',
    )
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    add('DATABASE_URL', 'fail', 'Set, but does not look like a Postgres URL.')
  } else {
    const host = safeHost(databaseUrl)
    add('DATABASE_URL', 'ok', `Set — ${host}`)
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    add(
      'BLOB_READ_WRITE_TOKEN',
      'fail',
      'Not set — documents cannot be uploaded or served.',
      'Vercel dashboard → Storage → Create Store → Blob, then: npx vercel env pull .env.local',
    )
  } else if (!blobToken.startsWith('vercel_blob_rw_')) {
    add('BLOB_READ_WRITE_TOKEN', 'warn', 'Set, but does not have the usual vercel_blob_rw_ prefix.')
  } else {
    add('BLOB_READ_WRITE_TOKEN', 'ok', 'Set.')
  }

  const secret = process.env.SESSION_SECRET
  if (!secret) {
    add(
      'SESSION_SECRET',
      'fail',
      'Not set — sessions cannot be signed and nobody can sign in.',
      'Generate one with: openssl rand -base64 32',
    )
  } else if (secret.length < 32) {
    add(
      'SESSION_SECRET',
      'fail',
      `Only ${secret.length} characters. At least 32 are required.`,
      'Generate one with: openssl rand -base64 32',
    )
  } else if (/^(changeme|replace|placeholder|secret|test)/i.test(secret)) {
    add(
      'SESSION_SECRET',
      'fail',
      'Still the example value. Anyone who reads the repository can forge a session.',
      'Generate one with: openssl rand -base64 32',
    )
  } else {
    add('SESSION_SECRET', 'ok', `Set — ${secret.length} characters.`)
  }

  const owner = process.env.OWNER_EMAIL
  if (!owner) {
    add(
      'OWNER_EMAIL',
      'warn',
      'Not set — defaults to mouhamad@namuai.org for admin sign-in and alerts.',
    )
  } else if (!owner.includes('@')) {
    add('OWNER_EMAIL', 'fail', 'Does not look like an email address.')
  } else {
    add('OWNER_EMAIL', 'ok', `Set — ${owner}`)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    add(
      'NEXT_PUBLIC_APP_URL',
      'warn',
      'Not set — invite links fall back to the host of whichever request created them.',
      'Set it to the room\'s real URL before sending any invite, or links will break when the deployment changes.',
    )
  } else if (!/^https?:\/\//.test(appUrl)) {
    add('NEXT_PUBLIC_APP_URL', 'fail', 'Must start with http:// or https://')
  } else if (appUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
    add('NEXT_PUBLIC_APP_URL', 'fail', 'Points at localhost in a production build.')
  } else {
    add('NEXT_PUBLIC_APP_URL', 'ok', `Set — ${appUrl}`)
  }

  if (!process.env.RESEND_API_KEY) {
    add(
      'RESEND_API_KEY',
      'warn',
      'Not set — no email is sent. The room still works: copy invite links from the console, and admin sign-in codes are printed to the server logs.',
      'Optional. Get a key at resend.com and verify your sending domain.',
    )
  } else {
    add('RESEND_API_KEY', 'ok', `Set. Sending as ${process.env.EMAIL_FROM ?? '(EMAIL_FROM unset)'}`)
    if (!process.env.EMAIL_FROM) {
      add('EMAIL_FROM', 'warn', 'Unset — Resend will fall back to its test sender.')
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Local assets                                                               */
/* -------------------------------------------------------------------------- */

function checkAssets(): void {
  const assets: [string, string][] = [
    ['public/pdfjs/pdf.worker.min.mjs', 'PDF viewer worker'],
    ['public/pdfjs/standard_fonts', 'PDF standard fonts'],
    ['public/pdfjs/cmaps', 'PDF character maps'],
  ]

  const missing = assets.filter(([path]) => !existsSync(resolve(process.cwd(), path)))
  if (missing.length === 0) {
    add('PDF viewer assets', 'ok', 'Present in public/pdfjs.')
  } else {
    add(
      'PDF viewer assets',
      'warn',
      `Missing: ${missing.map(([, label]) => label).join(', ')}. PDFs may fail to render or fall back to substitute fonts.`,
      'Restore with: cp -R node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm,iccs} public/pdfjs/ && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/',
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Database                                                                   */
/* -------------------------------------------------------------------------- */

async function checkDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) return

  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)

    const tables = (await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `) as { table_name: string }[]

    const present = new Set(tables.map((t) => t.table_name))
    const expected = [
      'admins',
      'visitors',
      'access_links',
      'folders',
      'documents',
      'sessions',
      'document_views',
      'page_views',
      'events',
      'nda_acceptances',
      'admin_login_codes',
      'questions',
      'settings',
    ]
    const missing = expected.filter((t) => !present.has(t))

    if (missing.length > 0) {
      add(
        'Database schema',
        'fail',
        `Connected, but ${missing.length} table${missing.length === 1 ? '' : 's'} missing: ${missing.join(', ')}`,
        'Create them with: npm run db:push',
      )
      return
    }

    add('Database schema', 'ok', `Connected. All ${expected.length} tables present.`)

    const [folderRow] = (await sql`SELECT COUNT(*)::int AS n FROM folders`) as { n: number }[]
    const [docRow] = (await sql`SELECT COUNT(*)::int AS n FROM documents`) as { n: number }[]
    const [adminRow] = (await sql`SELECT COUNT(*)::int AS n FROM admins`) as { n: number }[]
    const [settingRow] = (await sql`SELECT COUNT(*)::int AS n FROM settings`) as { n: number }[]

    add(
      'Seed data',
      (folderRow?.n ?? 0) >= 10 && (adminRow?.n ?? 0) > 0 && (settingRow?.n ?? 0) > 0 ? 'ok' : 'warn',
      `${folderRow?.n ?? 0} folders · ${adminRow?.n ?? 0} admins · ${settingRow?.n ?? 0} settings`,
      (folderRow?.n ?? 0) < 10 || (adminRow?.n ?? 0) === 0 ? 'Run: npm run seed' : undefined,
    )

    add(
      'Documents',
      (docRow?.n ?? 0) > 0 ? 'ok' : 'warn',
      `${docRow?.n ?? 0} document${docRow?.n === 1 ? '' : 's'} filed.`,
      (docRow?.n ?? 0) === 0 ? 'Load them with: npm run ingest' : undefined,
    )
  } catch (error) {
    add(
      'Database connection',
      'fail',
      `Could not connect: ${error instanceof Error ? error.message : String(error)}`,
      'Check DATABASE_URL is correct and the Neon project is not suspended.',
    )
  }
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                     */
/* -------------------------------------------------------------------------- */

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unparseable host'
  }
}

const MARK: Record<Status, string> = { ok: '✓', warn: '!', fail: '✗' }

function report(): number {
  const width = Math.max(...results.map((r) => r.name.length))

  console.log('\nNamu data room — setup check\n')

  for (const result of results) {
    console.log(`  ${MARK[result.status]} ${result.name.padEnd(width)}  ${result.detail}`)
    if (result.fix) console.log(`    ${' '.repeat(width)}  → ${result.fix}`)
  }

  const failures = results.filter((r) => r.status === 'fail')
  const warnings = results.filter((r) => r.status === 'warn')

  console.log('')
  if (failures.length > 0) {
    console.log(
      `  ${failures.length} thing${failures.length === 1 ? '' : 's'} must be fixed before the room will run.`,
    )
    if (warnings.length > 0) {
      console.log(
        `  ${warnings.length} other thing${warnings.length === 1 ? '' : 's'} worth a look.`,
      )
    }
    console.log('')
    return 1
  }

  if (warnings.length > 0) {
    console.log(`  Ready to run. ${warnings.length} optional thing${warnings.length === 1 ? '' : 's'} not configured.\n`)
    return 0
  }

  console.log('  Everything is configured.\n')
  return 0
}

async function main(): Promise<void> {
  checkEnv()
  checkAssets()
  await checkDatabase()
  process.exit(report())
}

void main()
