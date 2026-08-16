/**
 * Shared plumbing for the ingestion scripts.
 *
 * Loading environment files and creating the ten folders live here because both
 * `seed` and `ingest` need them and they must behave identically: if the folder
 * upsert ever drifted between the two scripts, running them in a different order
 * would produce a different room. The console helpers and the PDF page reader
 * sit alongside them so the two scripts sound the same and can be tested
 * without running either one.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../lib/db/schema'
import { FOLDER_BLUEPRINT } from '../lib/brand'

export type Db = NeonHttpDatabase<typeof schema>

/* -------------------------------------------------------------------------- */
/*  Console                                                                    */
/* -------------------------------------------------------------------------- */

const useColour = process.stdout.isTTY === true && !process.env.NO_COLOR

const ESC = '\u001b'
const wrap =
  (code: string) =>
  (text: string): string =>
    useColour ? `${ESC}[${code}m${text}${ESC}[0m` : text

export const style = {
  bold: wrap('1'),
  dim: wrap('2'),
  green: wrap('32'),
  amber: wrap('33'),
  red: wrap('31'),
}

export function heading(text: string): void {
  console.log(`\n${style.bold(text)}`)
}

export function ok(text: string): void {
  console.log(`${style.green('✓')} ${text}`)
}

export function warn(text: string): void {
  console.warn(`${style.amber('⚠')} ${text}`)
}

export function fail(text: string): void {
  console.error(`${style.red('✗')} ${text}`)
}

export function note(text: string): void {
  console.log(style.dim(`  ${text}`))
}

/* -------------------------------------------------------------------------- */
/*  PDF page count                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Distinct PDF objects that declare `/Type /Page`.
 *
 * Counting the tokens alone is not enough. A file saved incrementally — two
 * `%%EOF` markers, which several of Namu's exports have — carries a second copy
 * of every revised object, so the same page is written twice and a naive count
 * doubles. Each occurrence is therefore traced back to the `N G obj` header
 * that opens its object and recorded by object number, so rewrites collapse and
 * genuinely new pages still count. The negative lookahead keeps `/Pages` from
 * being read as a page.
 */
function countPageObjects(raw: string): number {
  const objectNumbers = new Set<string>()
  const pageToken = /\/Type\s*\/Page(?![a-zA-Z])/g
  let match: RegExpExecArray | null
  let unattributed = 0

  while ((match = pageToken.exec(raw)) !== null) {
    const before = raw.slice(Math.max(0, match.index - 300), match.index)
    const headers = before.match(/(\d+)\s+\d+\s+obj\b/g)
    const header = headers?.[headers.length - 1]
    if (header) objectNumbers.add(header.split(/\s+/)[0]!)
    else unattributed++
  }

  return objectNumbers.size + unattributed
}

/**
 * Best-effort page count, read straight from the file bytes.
 *
 * Counting leaf `/Type /Page` objects is the primary method and it is exact for
 * every document in the manifest, checked against pdfinfo.
 *
 * The `/Count` route is only the fallback, because it is the less trustworthy
 * of the two. Renderers emit balanced page trees, so a file typically carries
 * several `/Pages` nodes — one root holding the real total and intermediate
 * nodes holding partial counts — and other dictionaries use `/Count` for things
 * that are not pages at all. Reading the nearest `/Count` to a `/Type /Pages`
 * token therefore lands on an intermediate node as often as the root. Only the
 * node with no `/Parent` is the root, so that is the one we look for; if none
 * can be identified we take the largest count and accept the risk, since by
 * then the leaf scan has already failed and this is the last thing left to try.
 *
 * Anything unreadable returns null, which the schema allows. A missing page
 * count costs a completion percentage in the analytics, not a usable document.
 */
export function pdfPageCount(buffer: Buffer): number | null {
  // latin1 keeps one byte to one character, so offsets stay meaningful and no
  // multi-byte sequence can swallow a delimiter.
  const raw = buffer.toString('latin1')

  const leaves = countPageObjects(raw)
  if (leaves > 0) return leaves

  // Nothing visible: the objects are probably packed into a compressed object
  // stream. Fall back to the page tree.
  const rootCounts: number[] = []
  const allCounts: number[] = []

  const pagesNode = /\/Type\s*\/Pages\b/g
  let match: RegExpExecArray | null
  while ((match = pagesNode.exec(raw)) !== null) {
    // /Count can sit either side of /Type within the same dictionary.
    const window = raw.slice(Math.max(0, match.index - 400), match.index + 400)
    const count = /\/Count\s+(\d+)/.exec(window)
    if (!count) continue
    const value = Number(count[1])
    allCounts.push(value)
    if (!/\/Parent\b/.test(window)) rootCounts.push(value)
  }

  const candidates = rootCounts.length > 0 ? rootCounts : allCounts
  if (candidates.length === 0) return null

  const total = Math.max(...candidates)
  return total > 0 ? total : null
}

/* -------------------------------------------------------------------------- */
/*  Project root and environment                                               */
/* -------------------------------------------------------------------------- */

/**
 * Walks up from the working directory to the nearest package.json. `npm run`
 * already starts in the project root, but resolving it explicitly means the
 * scripts also work when invoked with `tsx scripts/ingest.ts` from elsewhere.
 */
export function projectRoot(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** Loads .env.local first, then .env. Neither overrides a real shell variable. */
export function loadEnv(): void {
  const root = projectRoot()
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file)
    if (existsSync(path)) dotenv.config({ path, quiet: true })
  }
}

const ENV_HELP: Record<string, string[]> = {
  DATABASE_URL: [
    'The Neon Postgres connection string.',
    'Vercel dashboard → your project → Storage → Neon → the .env.local tab,',
    'or run: vercel env pull .env.local',
  ],
  BLOB_READ_WRITE_TOKEN: [
    'The read/write token for the Blob store that holds the documents.',
    'Vercel dashboard → your project → Storage → Blob → the .env.local tab,',
    'or run: vercel env pull .env.local',
  ],
  OWNER_EMAIL: [
    'The address that signs in as the room owner.',
    'Optional; defaults to mouhamad@namuai.org.',
  ],
}

/**
 * Checks the variables a script cannot run without. Prints a short setup note
 * and exits 1 rather than letting a driver throw a stack trace at the reader.
 */
export function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length === 0) return

  const one = missing.length === 1

  console.error('')
  fail(`Missing ${one ? 'an environment variable' : `${missing.length} environment variables`}.`)
  console.error('')
  for (const name of missing) {
    console.error(`  ${style.bold(name)}`)
    for (const line of ENV_HELP[name] ?? ['Set this variable before running the script.']) {
      console.error(`    ${style.dim(line)}`)
    }
    console.error('')
  }
  console.error(
    `  Put ${one ? 'it' : 'them'} in ${style.bold('.env.local')} at the project root, then run the command again.`,
  )
  console.error(`  ${style.dim('scripts/ingest.ts --dry-run needs no environment at all.')}`)
  console.error('')
  process.exit(1)
}

/* -------------------------------------------------------------------------- */
/*  Database                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Imports the database client lazily. `lib/db/index.ts` throws on import when
 * DATABASE_URL is absent, so a dry run must never reach it — hence the dynamic
 * import here rather than a top-level one.
 */
export async function getDb(): Promise<Db> {
  const mod = await import('../lib/db')
  return mod.db as Db
}

/* -------------------------------------------------------------------------- */
/*  Folders                                                                    */
/* -------------------------------------------------------------------------- */

export type FolderIds = Map<string, string>

/**
 * Creates or updates the ten folders from FOLDER_BLUEPRINT, keyed on slug.
 * sortOrder is the position in the blueprint array, so reordering that array is
 * the only thing needed to reorder the room. Returns slug → folder id.
 */
export async function upsertFolders(db: Db): Promise<FolderIds> {
  const ids: FolderIds = new Map()

  for (let index = 0; index < FOLDER_BLUEPRINT.length; index++) {
    const folder = FOLDER_BLUEPRINT[index]!
    const values = {
      slug: folder.slug,
      name: folder.name,
      description: folder.description,
      tier: folder.tier,
      sortOrder: index,
    }

    const [row] = await db
      .insert(schema.folders)
      .values(values)
      .onConflictDoUpdate({
        target: schema.folders.slug,
        // isHidden and tier are deliberately left alone on update: hiding a
        // folder or moving it to another disclosure stage is an admin decision,
        // and re-running the script should not undo it. The blueprint's tier
        // only seeds a folder the first time it is created.
        set: { name: values.name, description: values.description, sortOrder: values.sortOrder },
      })
      .returning({ id: schema.folders.id })

    if (row) ids.set(folder.slug, row.id)
  }

  return ids
}
