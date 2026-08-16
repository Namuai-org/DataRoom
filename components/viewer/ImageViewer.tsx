'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Maximize2, Minimize2, TriangleAlert, ZoomIn, ZoomOut } from 'lucide-react'
import { Watermark } from './Watermark'
import { ViewerToolbarPortal } from './ToolbarSlot'
import { ToolbarButton, ToolbarDivider, ToolbarShell } from './ToolbarButton'
import { useDocumentTracking } from './useDocumentTracking'
import { useViewerProtection } from './useViewerProtection'
import { documentContentUrl, type RendererProps } from './types'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

type Status = 'loading' | 'ready' | 'error'

/**
 * Zoomable, watermarked image view. Same protections as the PDF path: the image
 * cannot be dragged out, right-clicked or printed cleanly, and it carries the
 * reader's name across it.
 */
export function ImageViewer({ doc, watermark }: RendererProps) {
  const { reportProgress, trackEvent, noteInteraction } = useDocumentTracking(doc.id, doc.pageCount ?? undefined)
  const protection = useViewerProtection({
    onPrintAttempt: useCallback(() => {
      trackEvent('print_attempt', doc.title, { kind: 'image' })
    }, [trackEvent, doc.title]),
  })

  const [status, setStatus] = useState<Status>('loading')
  const [zoom, setZoom] = useState<number | null>(null) // null = fit to frame
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    reportProgress(1, 1)
  }, [reportProgress])

  const applyZoom = useCallback(
    (next: number) => {
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)))
      noteInteraction()
    },
    [noteInteraction],
  )

  const fitted = zoom === null

  return (
    <div className="relative h-full w-full" {...protection.containerProps}>
      <div
        ref={scrollRef}
        tabIndex={0}
        className="no-select h-full w-full overflow-auto overscroll-contain bg-[var(--surface-sunken)] outline-none"
        aria-label={doc.title}
        role="document"
      >
        <div className="flex min-h-full min-w-max items-center justify-center p-6">
          <div className="relative inline-block bg-[var(--surface-raised)] shadow-[var(--shadow-card)]">
            {/*
              A plain <img> rather than a canvas: it keeps SVG uploads inert
              (scripts inside an SVG never run when it is loaded as an image)
              and lets the browser handle decoding and colour management.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={documentContentUrl(doc.id)}
              alt={doc.description || doc.title}
              draggable={false}
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('error')}
              className="pointer-events-none block h-auto transition-opacity duration-500"
              style={{
                width: fitted ? 'auto' : undefined,
                maxWidth: fitted ? 'min(100%, 1400px)' : 'none',
                maxHeight: fitted ? 'calc(100dvh - 220px)' : 'none',
                transform: fitted ? undefined : `scale(${zoom})`,
                transformOrigin: 'top left',
                opacity: status === 'ready' ? 1 : 0,
                transitionTimingFunction: 'var(--ease-namu)',
              }}
            />
            {status === 'ready' && <Watermark text={watermark} intensity="strong" />}
          </div>
        </div>
      </div>

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
          <LoaderCircle
            className="h-5 w-5 animate-spin text-[var(--text-muted)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] p-8">
          <div className="namu-card max-w-sm p-7 text-center">
            <TriangleAlert
              className="mx-auto h-5 w-5 text-[var(--text-muted)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="font-display mt-4 text-[18px] text-[var(--text-primary)]">
              This image didn&rsquo;t load
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Reload the page to try again. If it keeps failing the file may not
              have finished uploading.
            </p>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <ViewerToolbarPortal>
          <ToolbarShell>
            <ToolbarButton
              icon={ZoomOut}
              label="Zoom out"
              onClick={() => applyZoom((zoom ?? 1) - ZOOM_STEP)}
              disabled={zoom !== null && zoom <= MIN_ZOOM + 0.001}
            />
            <span className="tnum min-w-[3.25rem] px-1 text-center text-[12px] text-[var(--text-secondary)]">
              {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
            </span>
            <ToolbarButton
              icon={ZoomIn}
              label="Zoom in"
              onClick={() => applyZoom((zoom ?? 1) + ZOOM_STEP)}
              disabled={zoom !== null && zoom >= MAX_ZOOM - 0.001}
            />
            <ToolbarDivider />
            <ToolbarButton
              icon={fitted ? Maximize2 : Minimize2}
              label={fitted ? 'Actual size' : 'Fit to frame'}
              onClick={() => {
                setZoom(fitted ? 1 : null)
                noteInteraction()
              }}
            />
          </ToolbarShell>
        </ViewerToolbarPortal>
      )}
    </div>
  )
}

export default ImageViewer
