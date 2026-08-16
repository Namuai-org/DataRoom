import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "4m 12s" — compact, readable, used everywhere durations appear. */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0s'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Maps a file name or MIME type onto the document `kind` used for rendering. */
export function detectKind(fileName: string, mimeType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(ext)) return 'sheet'
  if (['docx', 'doc', 'rtf', 'txt', 'md'].includes(ext)) return 'doc'
  if (['pptx', 'ppt', 'key'].includes(ext)) return 'slides'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image'
  if (['html', 'htm'].includes(ext)) return 'web'
  if (['zip', 'tar', 'gz'].includes(ext)) return 'archive'
  return 'other'
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  html: 'text/html',
  txt: 'text/plain',
  md: 'text/markdown',
  zip: 'application/zip',
}

export function mimeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** Turns "Namu_Risk_Register.xlsx" into "Namu Risk Register". */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function initials(nameOrEmail: string): string {
  const name = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0]! : nameOrEmail
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

/** Flag emoji from a two-letter ISO country code, for the analytics tables. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🌐'
  const base = 0x1f1e6
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => base + c.charCodeAt(0) - 65),
  )
}

const REGION_NAMES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

export function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown'
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}
