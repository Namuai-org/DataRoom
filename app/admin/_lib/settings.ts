import 'server-only'
import { z } from 'zod'
import { db, settings } from '@/lib/db'
import { brand } from '@/lib/brand'
import type { RoomSettings } from './view-types'

/**
 * Room configuration, stored one row per key in the `settings` table.
 *
 * These key names are the contract between the console and the visitor-facing
 * room, so they are stable, lower-snake-case, and never renamed. Reading is
 * defensive: an unknown or malformed value falls back to the default rather
 * than crashing a page.
 */

export const SETTINGS_KEYS = {
  roomTitle: 'room_title',
  welcomeMessage: 'room_welcome',
  ndaEnabled: 'nda_enabled',
  ndaVersion: 'nda_version',
  ndaText: 'nda_text',
  watermarkEnabled: 'watermark_enabled',
  defaultCanDownload: 'default_can_download',
  alertEmail: 'alert_email',
  qaEnabled: 'qa_enabled',
  showSealedCount: 'show_sealed_count',
} as const

// The shape lives in _lib/view-types.ts, which carries no `server-only` marker,
// so the settings form can be typed against it without dragging this module —
// and the database client it imports — into the browser bundle.
export type { RoomSettings } from './view-types'

const DEFAULT_NDA_TEXT = `By entering this room you agree that the material inside is confidential
information of ${brand.legalName}.

You may use it only to evaluate a possible investment in or partnership with
${brand.name}. You will not copy, publish, or share it with anyone outside your
firm without written permission, and you will not use it to compete with
${brand.name}.

You will keep it as carefully as you keep your own confidential material, and
for no less than three years from today. If you are asked for it by a court or
a regulator, you will tell us first if you are lawfully able to.`

export const DEFAULT_SETTINGS: RoomSettings = {
  roomTitle: `${brand.name} — Data Room`,
  welcomeMessage:
    'Most Hausa speakers will reach AI by talking, not typing, and today’s systems barely hear ' +
    'them. Namu is an African AI research and technology company closing that gap. Our first ' +
    'product, Kura, answers phone calls in Hausa. In Niger, 240 pilot users have made more than ' +
    '1,400 calls to it. This room is the record behind that work: the product, the numbers, the ' +
    'risks. It is confidential, prepared for a few readers. Questions reach us directly, and we ' +
    'answer them.',
  ndaEnabled: true,
  ndaVersion: 'v1.0',
  ndaText: DEFAULT_NDA_TEXT,
  watermarkEnabled: true,
  defaultCanDownload: false,
  alertEmail: '',
  qaEnabled: true,
  showSealedCount: false,
}

const stringValue = z.string()
const boolValue = z.boolean()

/** Coerces one stored jsonb value, falling back to the default on anything odd. */
function readString(raw: unknown, fallback: string): string {
  const parsed = stringValue.safeParse(raw)
  return parsed.success ? parsed.data : fallback
}

function readBool(raw: unknown, fallback: boolean): boolean {
  const parsed = boolValue.safeParse(raw)
  if (parsed.success) return parsed.data
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}

export async function readSettings(): Promise<RoomSettings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
  const map = new Map(rows.map((r) => [r.key, r.value]))

  return {
    roomTitle: readString(map.get(SETTINGS_KEYS.roomTitle), DEFAULT_SETTINGS.roomTitle),
    welcomeMessage: readString(
      map.get(SETTINGS_KEYS.welcomeMessage),
      DEFAULT_SETTINGS.welcomeMessage,
    ),
    ndaEnabled: readBool(map.get(SETTINGS_KEYS.ndaEnabled), DEFAULT_SETTINGS.ndaEnabled),
    ndaVersion: readString(map.get(SETTINGS_KEYS.ndaVersion), DEFAULT_SETTINGS.ndaVersion),
    ndaText: readString(map.get(SETTINGS_KEYS.ndaText), DEFAULT_SETTINGS.ndaText),
    watermarkEnabled: readBool(
      map.get(SETTINGS_KEYS.watermarkEnabled),
      DEFAULT_SETTINGS.watermarkEnabled,
    ),
    defaultCanDownload: readBool(
      map.get(SETTINGS_KEYS.defaultCanDownload),
      DEFAULT_SETTINGS.defaultCanDownload,
    ),
    alertEmail: readString(map.get(SETTINGS_KEYS.alertEmail), DEFAULT_SETTINGS.alertEmail),
    qaEnabled: readBool(map.get(SETTINGS_KEYS.qaEnabled), DEFAULT_SETTINGS.qaEnabled),
    showSealedCount: readBool(
      map.get(SETTINGS_KEYS.showSealedCount),
      DEFAULT_SETTINGS.showSealedCount,
    ),
  }
}

/** Upserts only the keys present in the patch. */
export async function writeSettings(patch: Partial<RoomSettings>): Promise<void> {
  const entries = Object.entries(patch) as [keyof RoomSettings, RoomSettings[keyof RoomSettings]][]
  const now = new Date()

  for (const [field, value] of entries) {
    if (value === undefined) continue
    const key = SETTINGS_KEYS[field]
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
  }
}

/** Reads a single setting without paying for the whole table. */
export async function readRoomTitle(): Promise<string> {
  const all = await readSettings()
  return all.roomTitle
}
