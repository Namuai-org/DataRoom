/**
 * Clears the room back to a clean state before going live.
 *
 *   npm run reset                  # visitors, links, analytics, Q&A  (the default)
 *   npm run reset -- --documents   # also delete every document row and its blob
 *   npm run reset -- --all         # both of the above
 *   npm run reset -- --dry-run     # show what would go, touch nothing
 *
 * What it never touches: the ten folders, the room settings, and the admin
 * accounts. Those are configuration, not data — wiping them would mean setting
 * the room up again from scratch.
 *
 * Deleting documents also deletes the uploaded files from Blob storage, so it
 * is genuinely destructive. `npm run ingest` puts them back from
 * ../namu-design, but anything uploaded through the console is gone for good.
 */

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
config({ path: resolve(process.cwd(), '.env'), quiet: true })

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const withDocuments = args.has('--documents') || args.has('--all')

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('\n  DATABASE_URL is not set. Run `npx vercel env pull .env.local` first.\n')
    process.exit(1)
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const [counts]: any = await sql`
    SELECT
      (SELECT COUNT(*) FROM visitors)::int          AS visitors,
      (SELECT COUNT(*) FROM access_links)::int      AS links,
      (SELECT COUNT(*) FROM sessions)::int          AS sessions,
      (SELECT COUNT(*) FROM document_views)::int    AS views,
      (SELECT COUNT(*) FROM events)::int            AS events,
      (SELECT COUNT(*) FROM questions)::int         AS questions,
      (SELECT COUNT(*) FROM nda_acceptances)::int   AS ndas,
      (SELECT COUNT(*) FROM admin_login_codes)::int AS codes,
      (SELECT COUNT(*) FROM documents)::int         AS documents,
      (SELECT COUNT(*) FROM folders)::int           AS folders,
      (SELECT COUNT(*) FROM admins)::int            AS admins`

  console.log(`\n${bold('Namu data room — reset')}${dryRun ? dim('  (dry run)') : ''}\n`)
  console.log('  will be deleted')
  console.log(`    visitors               ${counts.visitors}`)
  console.log(`    access links           ${counts.links}`)
  console.log(`    sessions               ${counts.sessions}`)
  console.log(`    document views         ${counts.views}`)
  console.log(`    events                 ${counts.events}`)
  console.log(`    questions              ${counts.questions}`)
  console.log(`    NDA acceptances        ${counts.ndas}`)
  console.log(`    admin sign-in codes    ${counts.codes}`)
  if (withDocuments) console.log(`    documents              ${counts.documents}  ${dim('(and their blobs)')}`)

  console.log('\n  will be kept')
  console.log(`    folders                ${counts.folders}`)
  console.log(`    admins                 ${counts.admins}`)
  console.log(`    room settings          all`)
  if (!withDocuments) {
    console.log(`    documents              ${counts.documents}  ${dim('(pass --documents to clear)')}`)
  }

  if (dryRun) {
    console.log(`\n  ${dim('Nothing was changed. Re-run without --dry-run to apply.')}\n`)
    return
  }

  // Ordered so foreign keys never block a delete, even though most cascade.
  await sql`DELETE FROM questions`
  await sql`DELETE FROM page_views`
  await sql`DELETE FROM document_views`
  await sql`DELETE FROM events`
  await sql`DELETE FROM nda_acceptances`
  await sql`DELETE FROM sessions`
  await sql`DELETE FROM access_links`
  await sql`DELETE FROM visitors`
  await sql`DELETE FROM admin_login_codes`

  let blobsDeleted = 0
  if (withDocuments) {
    const rows = (await sql`SELECT blob_path FROM documents`) as { blob_path: string }[]

    if (process.env.BLOB_READ_WRITE_TOKEN && rows.length > 0) {
      const { del } = await import('@vercel/blob')
      for (const row of rows) {
        try {
          await del(row.blob_path)
          blobsDeleted++
        } catch {
          // A blob that is already gone is not a failure worth stopping for.
        }
      }
    }

    await sql`DELETE FROM documents`
  }

  console.log(`\n  ${bold('Done.')} The room is clean.`)
  if (withDocuments) console.log(`  ${blobsDeleted} files removed from Blob storage.`)
  console.log(`\n  Next: sign in at /admin and invite your first reader.\n`)
}

void main()
