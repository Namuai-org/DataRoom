/**
 * Populates the data room from the manifest.
 *
 *   npm run ingest -- --dry-run     what it would do, touching nothing
 *   npm run ingest                  upload and record everything
 *   npm run ingest -- --force       re-upload every file regardless of state
 *   npm run ingest -- --folder=team just one folder
 *
 * Safe to run as often as you like. A document is matched on (folder, file
 * name); an unchanged file is left in Blob storage untouched and only its
 * title, description, and position are refreshed. A changed file is re-uploaded
 * and its version number goes up by one.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { FOLDER_BLUEPRINT } from '../lib/brand'
import { detectKind, formatBytes, mimeFromFileName } from '../lib/utils'
import * as schema from '../lib/db/schema'
import type { Document } from '../lib/db/schema'
import {
  type Db,
  type FolderIds,
  fail,
  getDb,
  heading,
  loadEnv,
  note,
  ok,
  pdfPageCount,
  projectRoot,
  requireEnv,
  style,
  upsertFolders,
  warn,
} from './shared'
import {
  type ManifestEntry,
  SOURCE_ROOT,
  manifest,
  resolveSourcePath,
  sanitiseFileName,
  sourceFileName,
  validateManifest,
} from './manifest'

/* -------------------------------------------------------------------------- */
/*  Options                                                                    */
/* -------------------------------------------------------------------------- */

interface Options {
  dryRun: boolean
  force: boolean
  folder: string | null
  concurrency: number
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, force: false, folder: null, concurrency: 4 }

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') options.dryRun = true
    else if (arg === '--force' || arg === '-f') options.force = true
    else if (arg.startsWith('--folder=')) options.folder = arg.slice('--folder='.length)
    else if (arg.startsWith('--concurrency=')) {
      const value = Number(arg.slice('--concurrency='.length))
      if (Number.isFinite(value) && value >= 1) options.concurrency = Math.min(8, Math.floor(value))
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '',
          'Usage: npm run ingest -- [options]',
          '',
          '  --dry-run, -n        print the plan without touching Blob or the database',
          '  --force, -f          re-upload every file even if nothing changed',
          '  --folder=<slug>      restrict to one folder, e.g. --folder=market-research',
          '  --concurrency=<n>    parallel uploads, 1-8 (default 4)',
          '',
        ].join('\n'),
      )
      process.exit(0)
    } else if (arg.startsWith('-')) {
      warn(`Unknown option ${arg} — ignored. Run with --help for the list.`)
    }
  }

  return options
}

/* -------------------------------------------------------------------------- */
/*  Source inspection                                                          */
/* -------------------------------------------------------------------------- */

interface PlannedFile {
  entry: ManifestEntry
  folderName: string
  absolutePath: string
  fileName: string
  blobPath: string
  mimeType: string
  kind: string
  sizeBytes: number
  mtimeMs: number
}

interface Plan {
  files: PlannedFile[]
  missing: { entry: ManifestEntry; absolutePath: string }[]
}

async function buildPlan(options: Options): Promise<Plan> {
  const folderNames = new Map(FOLDER_BLUEPRINT.map((f) => [f.slug, f.name] as const))
  const files: PlannedFile[] = []
  const missing: Plan['missing'] = []

  const selected = options.folder
    ? manifest.filter((entry) => entry.folderSlug === options.folder)
    : manifest

  for (const entry of selected) {
    const absolutePath = resolveSourcePath(entry)
    let stats
    try {
      stats = await stat(absolutePath)
      if (!stats.isFile()) throw new Error('not a file')
    } catch {
      missing.push({ entry, absolutePath })
      continue
    }

    const fileName = sourceFileName(entry)
    files.push({
      entry,
      folderName: folderNames.get(entry.folderSlug) ?? entry.folderSlug,
      absolutePath,
      fileName,
      blobPath: `documents/${entry.folderSlug}/${sanitiseFileName(fileName)}`,
      mimeType: mimeFromFileName(fileName),
      kind: detectKind(fileName),
      sizeBytes: stats.size,
      mtimeMs: Math.round(stats.mtimeMs),
    })
  }

  // Folder order, then position within the folder.
  const folderRank = new Map(FOLDER_BLUEPRINT.map((f, index) => [f.slug, index] as const))
  files.sort((a, b) => {
    const byFolder =
      (folderRank.get(a.entry.folderSlug) ?? 99) - (folderRank.get(b.entry.folderSlug) ?? 99)
    return byFolder !== 0 ? byFolder : a.entry.sortOrder - b.entry.sortOrder
  })

  return { files, missing }
}

/* -------------------------------------------------------------------------- */
/*  Change cache                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The database records a document's size but not the modification time of the
 * file it came from, so a same-size edit would otherwise slip through. This
 * local cache closes that gap. It is disposable: delete it and the next run
 * simply falls back to comparing sizes.
 */
interface CacheEntry {
  sizeBytes: number
  mtimeMs: number
}

type Cache = Record<string, CacheEntry>

function cachePath(): string {
  return join(projectRoot(), 'scripts', '.ingest-cache', 'state.json')
}

async function readCache(): Promise<Cache> {
  const path = cachePath()
  if (!existsSync(path)) return {}
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Cache) : {}
  } catch {
    return {}
  }
}

async function writeCache(cache: Cache): Promise<void> {
  const path = cachePath()
  try {
    await mkdir(join(projectRoot(), 'scripts', '.ingest-cache'), { recursive: true })
    await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  } catch {
    // A cache we cannot write is not a reason to fail an otherwise good run.
  }
}

/* -------------------------------------------------------------------------- */
/*  Work                                                                       */
/* -------------------------------------------------------------------------- */

type Action = 'created' | 'replaced' | 'refreshed' | 'unchanged'

interface Result {
  file: PlannedFile
  action: Action
  error?: string
}

function decideAction(
  file: PlannedFile,
  existing: Document | undefined,
  cached: CacheEntry | undefined,
  options: Options,
): 'upload' | 'metadata' {
  if (!existing) return 'upload'
  if (options.force) return 'upload'
  if (existing.sizeBytes !== file.sizeBytes) return 'upload'
  if (cached && cached.mtimeMs !== file.mtimeMs) return 'upload'
  return 'metadata'
}

/** True when nothing a visitor would notice has changed. */
function metadataMatches(file: PlannedFile, existing: Document): boolean {
  return (
    existing.title === file.entry.title &&
    (existing.description ?? '') === (file.entry.description ?? '') &&
    existing.sortOrder === file.entry.sortOrder &&
    existing.mimeType === file.mimeType &&
    existing.kind === file.kind
  )
}

async function processFile(
  db: Db,
  file: PlannedFile,
  folderId: string,
  existing: Document | undefined,
  cache: Cache,
  options: Options,
): Promise<Result> {
  const decision = decideAction(file, existing, cache[file.entry.sourcePath], options)

  // decideAction only returns 'metadata' when a row already exists, so the
  // narrowing below is real rather than assumed.
  if (decision === 'metadata' && existing) {
    if (metadataMatches(file, existing)) return { file, action: 'unchanged' }

    await db
      .update(schema.documents)
      .set({
        title: file.entry.title,
        description: file.entry.description ?? null,
        sortOrder: file.entry.sortOrder,
        mimeType: file.mimeType,
        kind: file.kind,
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, existing.id))
    return { file, action: 'refreshed' }
  }

  const buffer = await readFile(file.absolutePath)
  const { put, del } = await import('@vercel/blob')

  // Private access: the bytes cannot be read from storage without the store
  // token, so even a leaked blob URL is inert. The app reads them server-side
  // with get() and streams every document through an authorised route, which is
  // the only path to a browser. addRandomSuffix keeps the pathname unguessable
  // on top of that — belt and braces, since a private store already refuses
  // anonymous reads.
  const uploaded = await put(file.blobPath, buffer, {
    access: 'private',
    addRandomSuffix: true,
    contentType: file.mimeType,
  })

  const pageCount = file.kind === 'pdf' ? pdfPageCount(buffer) : null
  const now = new Date()

  if (existing) {
    await db
      .update(schema.documents)
      .set({
        title: file.entry.title,
        description: file.entry.description ?? null,
        blobPath: uploaded.pathname,
        blobUrl: uploaded.url,
        mimeType: file.mimeType,
        kind: file.kind,
        sizeBytes: file.sizeBytes,
        pageCount,
        sortOrder: file.entry.sortOrder,
        version: existing.version + 1,
        updatedAt: now,
      })
      .where(eq(schema.documents.id, existing.id))

    // Retire the superseded blob so the store does not accumulate orphans.
    if (existing.blobUrl && existing.blobUrl !== uploaded.url) {
      try {
        await del(existing.blobUrl)
      } catch {
        warn(`could not remove the previous blob for ${file.entry.title} — it is now orphaned`)
      }
    }
  } else {
    await db.insert(schema.documents).values({
      folderId,
      title: file.entry.title,
      description: file.entry.description ?? null,
      fileName: file.fileName,
      blobPath: uploaded.pathname,
      blobUrl: uploaded.url,
      mimeType: file.mimeType,
      kind: file.kind,
      sizeBytes: file.sizeBytes,
      pageCount,
      sortOrder: file.entry.sortOrder,
      uploadedBy: 'scripts/ingest.ts',
      createdAt: now,
      updatedAt: now,
    })
  }

  cache[file.entry.sourcePath] = { sizeBytes: file.sizeBytes, mtimeMs: file.mtimeMs }
  return { file, action: existing ? 'replaced' : 'created' }
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index]!)
    }
  })

  await Promise.all(runners)
  return results
}

/* -------------------------------------------------------------------------- */
/*  Reporting                                                                  */
/* -------------------------------------------------------------------------- */

const ACTION_LABEL: Record<Action, string> = {
  created: 'uploaded',
  replaced: 're-uploaded',
  refreshed: 'details updated',
  unchanged: 'unchanged',
}

function line(file: PlannedFile, suffix: string, marker = style.green('✓')): string {
  const size = formatBytes(file.sizeBytes).padStart(8)
  return `${marker} ${file.folderName} / ${file.entry.title}  ${style.dim(`(${size.trim()})`)}  ${style.dim(suffix)}`
}

function printSummary(results: Result[], missing: Plan['missing'], dryRun = false): void {
  heading('Summary')

  const byFolder = new Map<string, { name: string; count: number; bytes: number }>()
  for (const result of results) {
    if (result.error) continue
    const slug = result.file.entry.folderSlug
    const row = byFolder.get(slug) ?? { name: result.file.folderName, count: 0, bytes: 0 }
    row.count += 1
    row.bytes += result.file.sizeBytes
    byFolder.set(slug, row)
  }

  const rows = FOLDER_BLUEPRINT.map((folder) => byFolder.get(folder.slug))
    .filter((row): row is { name: string; count: number; bytes: number } => row !== undefined)

  const nameWidth = Math.max(6, ...rows.map((row) => row.name.length))
  for (const row of rows) {
    const docs = `${row.count} ${row.count === 1 ? 'document' : 'documents'}`
    console.log(`  ${row.name.padEnd(nameWidth)}  ${docs.padStart(12)}  ${formatBytes(row.bytes).padStart(9)}`)
  }

  const totalDocs = rows.reduce((sum, row) => sum + row.count, 0)
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0)
  console.log(`  ${style.dim('-'.repeat(nameWidth + 25))}`)
  console.log(
    `  ${style.bold('Total'.padEnd(nameWidth))}  ${`${totalDocs} documents`.padStart(12)}  ${formatBytes(totalBytes).padStart(9)}`,
  )

  if (dryRun) {
    // A dry run cannot tell which of these already exist — that answer lives in
    // the database — so it counts candidates rather than claiming outcomes.
    console.log('')
    note(`${totalDocs} ${totalDocs === 1 ? 'document' : 'documents'} to consider; each is uploaded only if it is new or has changed.`)
  } else {
    const counts = new Map<Action, number>()
    for (const result of results) {
      if (result.error) continue
      counts.set(result.action, (counts.get(result.action) ?? 0) + 1)
    }
    const breakdown = (['created', 'replaced', 'refreshed', 'unchanged'] as const)
      .filter((action) => counts.get(action))
      .map((action) => `${counts.get(action)} ${ACTION_LABEL[action]}`)
    if (breakdown.length > 0) {
      console.log('')
      note(breakdown.join(' · '))
    }
  }

  const failures = results.filter((result) => result.error)
  if (failures.length > 0) {
    console.log('')
    for (const failure of failures) {
      fail(`${failure.file.folderName} / ${failure.file.entry.title} — ${failure.error}`)
    }
  }

  if (missing.length > 0) {
    console.log('')
    for (const item of missing) {
      warn(`source file not found: ${item.absolutePath}`)
      note(`wanted for ${item.entry.folderSlug} / ${item.entry.title}`)
    }
    note(`${missing.length} manifest ${missing.length === 1 ? 'entry was' : 'entries were'} skipped.`)
  }
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  const problems = validateManifest()
  if (problems.length > 0) {
    fail('The manifest is inconsistent, so nothing was ingested:')
    for (const problem of problems) note(problem)
    process.exit(1)
  }

  if (options.folder && !FOLDER_BLUEPRINT.some((folder) => folder.slug === options.folder)) {
    fail(`Unknown folder "${options.folder}".`)
    note(`Known slugs: ${FOLDER_BLUEPRINT.map((folder) => folder.slug).join(', ')}`)
    process.exit(1)
  }

  heading(options.dryRun ? 'Namu data room — ingest (dry run)' : 'Namu data room — ingest')
  note(`source: ${SOURCE_ROOT}`)

  const plan = await buildPlan(options)

  if (plan.files.length === 0 && plan.missing.length === 0) {
    warn('Nothing to do — the manifest selected no entries.')
    return
  }

  /* ------------------------------ dry run ------------------------------- */

  if (options.dryRun) {
    note('no environment needed; nothing is uploaded and nothing is written')
    console.log('')

    let currentFolder = ''
    for (const file of plan.files) {
      if (file.folderName !== currentFolder) {
        currentFolder = file.folderName
        console.log(`\n${style.bold(currentFolder)}`)
      }
      console.log(
        `  ${String(file.entry.sortOrder).padStart(2)}. ${file.entry.title}  ${style.dim(
          `(${formatBytes(file.sizeBytes)}, ${file.kind})`,
        )}`,
      )
      console.log(`      ${style.dim(`${file.entry.sourcePath}  →  ${file.blobPath}`)}`)
    }

    const results: Result[] = plan.files.map((file) => ({ file, action: 'created' as const }))
    printSummary(results, plan.missing, true)
    console.log('')
    note('Run without --dry-run to upload.')
    return
  }

  /* ------------------------------ real run ------------------------------ */

  loadEnv()
  requireEnv(['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'])

  const db = await getDb()
  const folderIds: FolderIds = await upsertFolders(db)
  ok(`${FOLDER_BLUEPRINT.length} folders in place`)

  const cache = await readCache()

  // One read per folder, rather than one per document.
  const existingByFolder = new Map<string, Map<string, Document>>()
  const touchedSlugs = new Set(plan.files.map((file) => file.entry.folderSlug))
  for (const slug of touchedSlugs) {
    const folderId = folderIds.get(slug)
    if (!folderId) continue
    const rows = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.folderId, folderId))
    existingByFolder.set(slug, new Map(rows.map((row) => [row.fileName, row])))
  }

  console.log('')

  const results = await pool(plan.files, options.concurrency, async (file) => {
    const folderId = folderIds.get(file.entry.folderSlug)
    if (!folderId) {
      const result: Result = { file, action: 'unchanged', error: 'folder missing' }
      fail(line(file, 'folder missing', style.red('✗')))
      return result
    }

    const existing = existingByFolder.get(file.entry.folderSlug)?.get(file.fileName)

    try {
      const result = await processFile(db, file, folderId, existing, cache, options)
      console.log(line(file, ACTION_LABEL[result.action]))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(line(file, message, style.red('✗')))
      return { file, action: 'unchanged', error: message } satisfies Result
    }
  })

  await writeCache(cache)
  printSummary(results, plan.missing)
  console.log('')

  const failures = results.filter((result) => result.error).length
  if (failures > 0) {
    fail(`${failures} ${failures === 1 ? 'document' : 'documents'} failed. Re-run to retry.`)
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error('')
  fail(error instanceof Error ? error.message : String(error))
  if (error instanceof Error && error.stack && process.env.DEBUG) console.error(error.stack)
  process.exit(1)
})
