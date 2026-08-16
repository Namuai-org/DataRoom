'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Watermark } from './Watermark'
import { useDocumentTracking } from './useDocumentTracking'
import { useViewerProtection } from './useViewerProtection'
import { documentContentUrl, type RendererProps } from './types'

type Status = 'loading' | 'ready' | 'error'

/**
 * Sandboxed HTML preview.
 *
 * The markup is fetched through the authorised content route and handed to the
 * iframe as `srcdoc` rather than as a `src`. Two reasons: the room sets
 * `X-Frame-Options: DENY` for every path, which would block framing our own
 * content route; and srcdoc keeps the bytes on a path we have already
 * authorised rather than starting a second navigation.
 *
 * The sandbox carries `allow-same-origin` and nothing else — in particular no
 * `allow-scripts`, so nothing inside an uploaded page can execute. The content
 * route additionally answers with `Content-Security-Policy: sandbox`, which
 * covers anyone who navigates to the URL directly.
 */
export function HtmlViewer({ doc, watermark }: RendererProps) {
  const { reportProgress, trackEvent } = useDocumentTracking(doc.id, doc.pageCount ?? undefined)
  const protection = useViewerProtection({
    onPrintAttempt: useCallback(() => {
      trackEvent('print_attempt', doc.title, { kind: 'web' })
    }, [trackEvent, doc.title]),
  })

  const [status, setStatus] = useState<Status>('loading')
  const [html, setHtml] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch(documentContentUrl(doc.id), {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`status ${response.status}`)
        const text = await response.text()
        if (controller.signal.aborted) return
        setHtml(text)
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('[viewer] html load failed', error)
        setStatus('error')
      }
    })()

    return () => controller.abort()
  }, [doc.id])

  useEffect(() => {
    reportProgress(1, 1)
  }, [reportProgress])

  return (
    <div className="relative h-full w-full bg-[var(--surface-sunken)]" {...protection.containerProps}>
      {status === 'ready' && (
        <div className="relative h-full w-full p-4 sm:p-6">
          <div className="namu-card relative h-full overflow-hidden bg-white">
            <iframe
              title={doc.title}
              srcDoc={html}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              className="h-full w-full border-0"
            />
            <Watermark text={watermark} />
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle
            className="h-5 w-5 animate-spin text-[var(--text-muted)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="namu-card max-w-sm p-7 text-center">
            <TriangleAlert
              className="mx-auto h-5 w-5 text-[var(--text-muted)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="font-display mt-4 text-[18px] text-[var(--text-primary)]">
              This page didn&rsquo;t load
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Reload to try again.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default HtmlViewer
