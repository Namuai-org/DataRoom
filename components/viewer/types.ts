/**
 * The shape the viewer needs from a document row. Deliberately narrower than
 * the database record: `blobPath` and `blobUrl` must never cross into a client
 * component, so they are not part of this type at all.
 */
export type ViewerDocument = {
  id: string
  title: string
  description?: string | null
  fileName: string
  mimeType: string
  /** 'pdf' | 'image' | 'sheet' | 'doc' | 'slides' | 'web' | 'archive' | 'other' */
  kind: string
  sizeBytes: number
  pageCount?: number | null
  folderId?: string
  folderName?: string | null
  folderSlug?: string | null
  /** Optional override for the "downloads are off" explanation in the chrome. */
  downloadReason?: string | null
}

/** Every renderer takes the same three things. */
export type RendererProps = {
  doc: ViewerDocument
  /** Viewer email + ISO timestamp + "Confidential", tiled over the content. */
  watermark: string
  canDownload: boolean
}

export function documentContentUrl(id: string): string {
  return `/api/documents/${encodeURIComponent(id)}/content`
}

export function documentDownloadUrl(id: string): string {
  return `/api/documents/${encodeURIComponent(id)}/download`
}

/**
 * The watermark line. Identifying the reader by name is the point: it is the
 * honest thing to do and, of everything in this viewer, the most effective
 * deterrent against a screenshot being passed on.
 */
export function buildWatermark(email: string, isoTimestamp?: string | null): string {
  return isoTimestamp
    ? `${email} · ${isoTimestamp} · Confidential`
    : `${email} · Confidential`
}

const KIND_LABELS: Record<string, string> = {
  pdf: 'PDF document',
  image: 'Image',
  sheet: 'Spreadsheet',
  doc: 'Word document',
  slides: 'Presentation',
  web: 'Web page',
  archive: 'Archive',
  other: 'File',
}

export function kindLabel(doc: ViewerDocument): string {
  const extension = doc.fileName.split('.').pop()?.toUpperCase()
  const base = KIND_LABELS[doc.kind] ?? KIND_LABELS.other!
  return extension && extension.length <= 5 ? `${extension} · ${base}` : base
}
