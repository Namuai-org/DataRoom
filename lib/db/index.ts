import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/**
 * The database client.
 *
 * Connecting is deferred until the first query rather than done at import time.
 * `next build` imports every route module to collect its metadata, so throwing
 * on a missing DATABASE_URL at module load would fail the build on any machine
 * that has not pulled the environment yet — including a fresh clone. A route
 * that never runs a query should not need a database to compile.
 */

const MISSING_URL_MESSAGE = [
  'DATABASE_URL is not set.',
  '',
  'Provision Postgres from the Vercel dashboard (Storage → Create Database → Neon),',
  'then pull the environment locally with:',
  '',
  '  npx vercel env pull .env.local',
].join('\n')

type Database = NeonHttpDatabase<typeof schema>

let client: Database | null = null

function connect(): Database {
  if (client) return client

  const url = process.env.DATABASE_URL
  if (!url) throw new Error(MISSING_URL_MESSAGE)

  client = drizzle(neon(url), { schema })
  return client
}

/**
 * A proxy so callers keep writing `db.select(...)` while the real connection is
 * created on first use. Drizzle's query builders are plain methods, so
 * forwarding property access is enough.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(connect() as object, property, receiver)
  },
  has(_target, property) {
    return Reflect.has(connect() as object, property)
  },
})

export { schema }
export * from './schema'
