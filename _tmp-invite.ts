import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

import { randomBytes, createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)

  const email = process.argv[2] ?? 'preview@namuai.org'
  const name = process.argv[3] ?? 'Preview Reader'

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const visitorRows = (await sql`
    INSERT INTO visitors (email, name, organization, role)
    VALUES (${email}, ${name}, 'Preview', 'Preview')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `) as { id: string }[]

  const visitorId = visitorRows[0]!.id

  await sql`
    INSERT INTO access_links
      (visitor_id, token_hash, token_preview, label, tier, can_download, invited_by)
    VALUES
      (${visitorId}, ${tokenHash}, ${token.slice(0, 8)}, 'Preview link', 'confirmatory', true, 'cli')
  `

  // Pre-accept the NDA so a preview link lands straight in the room.
  const existing = (await sql`
    SELECT id FROM nda_acceptances WHERE visitor_id = ${visitorId} LIMIT 1
  `) as { id: string }[]

  if (existing.length === 0) {
    await sql`
      INSERT INTO nda_acceptances
        (visitor_id, nda_version, nda_text_hash, signed_name, ip, user_agent)
      VALUES
        (${visitorId}, 'preview', 'preview', ${name}, '127.0.0.1', 'cli')
    `
  }

  console.log(`\n${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/access/${token}\n`)
}

void main()
