/**
 * Upload rules, shared by the server action that enforces them and the client
 * uploader that explains them. Deliberately free of server-only imports so the
 * browser bundle can read the same numbers the server checks against.
 *
 * Uploads go straight from the browser to Blob storage via
 * `app/api/blob/upload`, so neither of the request-body ceilings that bind a
 * Server Action applies — Next's 1 MB action limit and Vercel's 4.5 MB
 * serverless limit are both bypassed. `PRACTICAL_LIMIT_BYTES` is kept only for
 * the older action path, which now handles nothing the uploader sends.
 *
 * MAX_UPLOAD_BYTES is the room's own policy limit. It is enforced twice: the
 * uploader refuses a larger file before starting, and the upload token itself
 * carries the same ceiling, so a client that skips the check still cannot
 * exceed it.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const PRACTICAL_LIMIT_BYTES = Math.round(4.5 * 1024 * 1024)

/** Allow-list rather than deny-list: an unknown extension is refused. */
export const ALLOWED_EXTENSIONS: readonly string[] = [
  'pdf',
  'xlsx',
  'xls',
  'csv',
  'numbers',
  'docx',
  'doc',
  'rtf',
  'txt',
  'md',
  'pptx',
  'ppt',
  'key',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'zip',
]

/** The `accept` attribute for the file input. */
export const ACCEPTED_UPLOAD_TYPES = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')

export function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

export function isAllowedFile(fileName: string): boolean {
  return ALLOWED_EXTENSIONS.includes(extensionOf(fileName))
}

/** Keeps a blob pathname predictable and free of anything path-like. */
export function safePathSegment(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 120) || 'file'
  )
}
