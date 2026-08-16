'use client'

import { useEffect, useMemo, useState } from 'react'
import { ToolbarSlotProvider } from './ToolbarSlot'
import { ViewerChrome } from './ViewerChrome'
import { PdfViewer } from './PdfViewer'
import { ImageViewer } from './ImageViewer'
import { CsvViewer } from './CsvViewer'
import { HtmlViewer } from './HtmlViewer'
import { UnsupportedPreview } from './UnsupportedPreview'
import { buildWatermark, type RendererProps, type ViewerDocument } from './types'

export type ViewerFolder = { slug: string; name: string }

export type DocumentViewerProps = {
  /** The document to render. Any row shaped like `VisibleDocument` fits. */
  document: ViewerDocument
  /** Its folder, used for the back link and the breadcrumb line. */
  folder?: ViewerFolder | null
  /**
   * The watermark line. `null` honours the room's `watermarkEnabled` setting
   * being off — a deliberate choice the owner makes in the console, not a
   * default, because with it off nothing in a screenshot points back to the
   * reader. Omit it and the viewer composes the standard line itself.
   */
  watermark?: string | null
  /** The signed-in visitor. Shown in the chrome so they know they are known. */
  viewerEmail: string
  canDownload: boolean
  /** Defaults to the document's folder. */
  backHref?: string
  /**
   * ISO timestamp for the composed watermark. Pass the server's value when the
   * page knows it; otherwise the viewer stamps the moment it mounted.
   */
  openedAt?: string
  /** Set false when the page supplies its own frame. */
  chrome?: boolean
}

function isCsv(doc: ViewerDocument): boolean {
  return doc.mimeType === 'text/csv' || /\.(csv|tsv)$/i.test(doc.fileName)
}

/**
 * Picks a renderer for a document and gives every one of them the same frame,
 * the same watermark and the same tracking. Nothing here decides policy — it
 * only decides which honest presentation a file type deserves.
 */
export function DocumentViewer({
  document: doc,
  folder,
  watermark,
  viewerEmail,
  canDownload,
  backHref,
  openedAt,
  chrome = true,
}: DocumentViewerProps) {
  // Stamped after mount rather than during render: a timestamp generated on the
  // server would not match the one generated in the browser, and React would
  // flag the mismatch during hydration.
  const [stamp, setStamp] = useState<string | null>(openedAt ?? null)

  useEffect(() => {
    if (openedAt) return
    setStamp(new Date().toISOString())
  }, [openedAt])

  const resolvedWatermark = useMemo(() => {
    if (watermark === null) return ''
    if (watermark) return watermark
    return buildWatermark(viewerEmail, stamp)
  }, [watermark, viewerEmail, stamp])

  const rendererProps: RendererProps = { doc, watermark: resolvedWatermark, canDownload }
  const body = <Renderer {...rendererProps} />

  if (!chrome) return <ToolbarSlotProvider>{body}</ToolbarSlotProvider>

  return (
    <ToolbarSlotProvider>
      <ViewerChrome
        doc={doc}
        folder={folder}
        viewerEmail={viewerEmail}
        canDownload={canDownload}
        backHref={backHref}
      >
        {body}
      </ViewerChrome>
    </ToolbarSlotProvider>
  )
}

function Renderer(props: RendererProps) {
  const { doc } = props

  if (doc.kind === 'pdf') return <PdfViewer {...props} />
  if (doc.kind === 'image') return <ImageViewer {...props} />
  if (doc.kind === 'web') return <HtmlViewer {...props} />

  // CSV is a spreadsheet by `kind`, but unlike xlsx it can be rendered exactly.
  if (isCsv(doc)) return <CsvViewer {...props} />

  // sheet / doc / slides / archive / other — say so plainly.
  return <UnsupportedPreview {...props} />
}

export default DocumentViewer
