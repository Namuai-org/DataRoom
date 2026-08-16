import { config } from 'dotenv'
import type { Config } from 'drizzle-kit'

// `.env.local` first, matching Next's own precedence — it is the gitignored
// file that holds real credentials, and `dotenv/config` alone would miss it.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
} satisfies Config
