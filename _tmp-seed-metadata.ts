/**
 * TEMPORARY — design preview only.
 *
 * Inserts the manifest's document metadata (titles, descriptions, sizes, page
 * counts, ordering) without uploading anything, so the room's folder views can
 * be designed and judged against the real 64 documents before a Blob store
 * exists. `blobUrl` is left as a marker that the viewer will fail on cleanly.
 *
 * `npm run ingest` matches on (folderId, fileName) and is idempotent, so a real
 * ingest later overwrites these rows with genuine Blob URLs. Delete this file
 * once that has happened.
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

import { readFileSync, statSync, existsSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { manifest, resolveSourcePath, sourceFileName, sanitiseFileName } from './scripts/manifest'
import { pdfPageCount } from './scripts/shared'
import { detectKind, mimeFromFileName } from './lib/utils'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)

  const folderRows = (await sql`SELECT id, slug FROM folders`) as { id: string; slug: string }[]
  const folderId = new Map(folderRows.map((f) => [f.slug, f.id]))

  let inserted = 0
  let skipped = 0
  const missing: string[] = []

  for (const entry of manifest) {
    const path = resolveSourcePath(entry)
    if (!existsSync(path)) {
      missing.push(entry.title)
      continue
    }

    const id = folderId.get(entry.folderSlug)
    if (!id) continue

    const fileName = sanitiseFileName(sourceFileName(entry))
    const size = statSync(path).size
    const mimeType = mimeFromFileName(fileName)
    const kind = detectKind(fileName, mimeType)

    let pages: number | null = null
    if (kind === 'pdf') {
      try {
        pages = pdfPageCount(readFileSync(path))
      } catch {
        pages = null
      }
    }

    const existing = (await sql`
      SELECT id FROM documents WHERE folder_id = ${id} AND file_name = ${fileName} LIMIT 1
    `) as { id: string }[]

    if (existing.length > 0) {
      skipped += 1
      continue
    }

    await sql`
      INSERT INTO documents
        (folder_id, title, description, file_name, blob_path, blob_url,
         mime_type, kind, size_bytes, page_count, sort_order, uploaded_by)
      VALUES
        (${id}, ${entry.title}, ${entry.description ?? null}, ${fileName},
         ${`documents/${entry.folderSlug}/${fileName}`},
         ${'pending-upload://' + entry.folderSlug + '/' + fileName},
         ${mimeType}, ${kind}, ${size}, ${pages}, ${entry.sortOrder}, 'design-preview')
    `
    inserted += 1
  }

  console.log(`\n  inserted ${inserted} · already present ${skipped} · missing source ${missing.length}`)
  if (missing.length) console.log(`  missing: ${missing.join(', ')}`)
  console.log()
}

void main()
