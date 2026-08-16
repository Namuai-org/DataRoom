'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist'
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Lock,
  MoveHorizontal,
  Scan,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Watermark } from './Watermark'
import { ViewerToolbarPortal } from './ToolbarSlot'
import { ToolbarButton, ToolbarDivider, ToolbarShell } from './ToolbarButton'
import { useDocumentTracking } from './useDocumentTracking'
import { useViewerProtection } from './useViewerProtection'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'
import { PDFJS_ASSET_OPTIONS, describePdfError, loadPdfjs } from './pdfjs'
import { documentContentUrl, type RendererProps } from './types'

/* -------------------------------------------------------------------------- */

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const ZOOM_STEP = 0.25
/** Space around the page column, in CSS pixels. */
const GUTTER = 24
/** How far outside the viewport a page is rasterised. One screen either way. */
const RENDER_MARGIN = '1200px'
/** Safari refuses canvases much beyond this; staying under keeps iPad working. */
const MAX_CANVAS_PIXELS = 12_000_000

type Status = 'loading' | 'password' | 'ready' | 'error'
type ZoomMode = 'fit-width' | 'fit-page' | 'custom'
type PageSize = { width: number; height: number }

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

/* -------------------------------------------------------------------------- */

/**
 * Continuous-scroll PDF reader.
 *
 * Three decisions carry most of the weight here. Pages are laid out at their
 * true size before anything is drawn, so the scrollbar is honest from the first
 * frame and never jumps. Only pages within a screen of the viewport are
 * rasterised, so a hundred-page deck costs the same as a five-page one. And
 * zooming re-lays-out instantly while re-rasterising on a short debounce, so
 * dragging a window edge does not queue up a hundred render tasks.
 */
export function PdfViewer({ doc, watermark }: RendererProps) {
  const { reportProgress, trackEvent, noteInteraction } = useDocumentTracking(doc.id, doc.pageCount ?? undefined)

  const protection = useViewerProtection({
    onPrintAttempt: useCallback(() => {
      trackEvent('print_attempt', doc.title, { kind: 'pdf' })
    }, [trackEvent, doc.title]),
  })

  /* ------------------------------------------------------------- state --- */

  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  const [passwordIncorrect, setPasswordIncorrect] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [baseSize, setBaseSize] = useState<PageSize | null>(null)
  const [pageSizes, setPageSizes] = useState<Map<number, PageSize>>(() => new Map())

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [customScale, setCustomScale] = useState(1)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const [currentPage, setCurrentPage] = useState(1)
  const [activePages, setActivePages] = useState<ReadonlySet<number>>(() => new Set([1]))

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pageElsRef = useRef(new Map<number, HTMLElement>())
  const renderObserverRef = useRef<IntersectionObserver | null>(null)
  const activeObserverRef = useRef<IntersectionObserver | null>(null)
  const intersectionHeightsRef = useRef(new Map<number, number>())
  const passwordCallbackRef = useRef<((password: string) => void) | null>(null)

  /* -------------------------------------------------------------- load --- */

  useEffect(() => {
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null

    setStatus('loading')
    setErrorMessage(null)
    setLoadProgress(null)
    setPdf(null)
    setPageCount(0)
    setBaseSize(null)
    setPageSizes(new Map())
    setCurrentPage(1)
    setActivePages(new Set([1]))
    intersectionHeightsRef.current.clear()

    void (async () => {
      try {
        const pdfjs = await loadPdfjs()
        if (cancelled) return

        loadingTask = pdfjs.getDocument({
          // Same-origin request, so the visitor's session cookie rides along
          // automatically — the bytes still pass the full authorisation check.
          url: documentContentUrl(doc.id),
          withCredentials: true,
          ...PDFJS_ASSET_OPTIONS,
          // Fetch page data on demand rather than pulling the whole file up
          // front. This is what makes the content route's Range support pay off.
          disableAutoFetch: true,
          rangeChunkSize: 131_072,
          // Interactive XFA forms are not something an investor deck needs, and
          // they are the most exotic corner of the format.
          enableXfa: false,
        })

        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          if (cancelled) return
          passwordCallbackRef.current = updatePassword
          setPasswordIncorrect(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
          setStatus('password')
        }

        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (cancelled || !total) return
          setLoadProgress(Math.min(100, Math.round((loaded / total) * 100)))
        }

        const document_ = await loadingTask.promise
        // The cleanup below already destroyed the loading task, which tears the
        // document down with it — nothing further to release here.
        if (cancelled) return

        // Page one sets the layout for the whole document. Individual pages
        // correct themselves when they render, which keeps startup to a single
        // page fetch even for a five-hundred-page file.
        const firstPage = await document_.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        if (cancelled) return

        setBaseSize({ width: viewport.width, height: viewport.height })
        setPageCount(document_.numPages)
        setPdf(document_)
        setStatus('ready')
        setPasswordIncorrect(false)
      } catch (error) {
        if (cancelled) return
        console.error('[viewer] pdf load failed', error)
        setErrorMessage(describePdfError(error))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      passwordCallbackRef.current = null
      // Destroys the worker, aborts every in-flight range request and rejects
      // any pending render task. Without this a closed tab keeps a worker alive.
      void loadingTask?.destroy().catch(() => {})
    }
  }, [doc.id, reloadKey])

  /* ------------------------------------------------------------- sizing --- */

  // Measured before first paint so the very first page is laid out at the
  // correct fit scale rather than at 100% and then corrected.
  useIsomorphicLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    setContainerSize({ width: element.clientWidth, height: element.clientHeight })
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setContainerSize((previous) =>
        Math.abs(previous.width - rect.width) < 2 && Math.abs(previous.height - rect.height) < 2
          ? previous
          : { width: rect.width, height: rect.height },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = useMemo(() => {
    if (zoomMode === 'custom') return clampScale(customScale)
    if (!baseSize || !containerSize.width) return 1
    const availableWidth = containerSize.width - GUTTER * 2
    const fitWidth = availableWidth / baseSize.width
    if (zoomMode === 'fit-width') return clampScale(fitWidth)
    const availableHeight = containerSize.height - GUTTER * 2
    return clampScale(Math.min(fitWidth, availableHeight / baseSize.height))
  }, [zoomMode, customScale, baseSize, containerSize])

  // Layout follows the scale immediately; rasterisation waits a beat so a
  // window drag or a burst of zoom clicks produces one render, not twenty.
  const renderScale = useDebounced(scale, 140)

  const sizeFor = useCallback(
    (pageNumber: number): PageSize => pageSizes.get(pageNumber) ?? baseSize ?? { width: 612, height: 792 },
    [pageSizes, baseSize],
  )

  const handleMeasured = useCallback((pageNumber: number, width: number, height: number) => {
    setPageSizes((previous) => {
      const existing = previous.get(pageNumber)
      if (existing && Math.abs(existing.width - width) < 1 && Math.abs(existing.height - height) < 1) {
        return previous
      }
      const next = new Map(previous)
      next.set(pageNumber, { width, height })
      return next
    })
  }, [])

  /* --------------------------------------------------------- observers --- */

  const registerPage = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const pageNumber = Number(element.dataset.page)
    if (!Number.isFinite(pageNumber)) return

    pageElsRef.current.set(pageNumber, element)
    renderObserverRef.current?.observe(element)
    activeObserverRef.current?.observe(element)

    return () => {
      pageElsRef.current.delete(pageNumber)
      intersectionHeightsRef.current.delete(pageNumber)
      renderObserverRef.current?.unobserve(element)
      activeObserverRef.current?.unobserve(element)
    }
  }, [])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || pageCount === 0) return

    const renderObserver = new IntersectionObserver(
      (entries) => {
        setActivePages((previous) => {
          const next = new Set(previous)
          let changed = false
          for (const entry of entries) {
            const pageNumber = Number((entry.target as HTMLElement).dataset.page)
            if (!Number.isFinite(pageNumber)) continue
            if (entry.isIntersecting) {
              if (!next.has(pageNumber)) {
                next.add(pageNumber)
                changed = true
              }
            } else if (next.delete(pageNumber)) {
              changed = true
            }
          }
          return changed ? next : previous
        })
      },
      { root, rootMargin: `${RENDER_MARGIN} 0px`, threshold: 0 },
    )

    const activeObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.page)
          if (!Number.isFinite(pageNumber)) continue
          intersectionHeightsRef.current.set(
            pageNumber,
            entry.isIntersecting ? entry.intersectionRect.height : 0,
          )
        }
        // "Current page" is the one filling most of the viewport, not merely the
        // first one touching it — otherwise the indicator lags a whole page.
        let best = 1
        let bestHeight = -1
        for (const [pageNumber, height] of intersectionHeightsRef.current) {
          if (height > bestHeight) {
            best = pageNumber
            bestHeight = height
          }
        }
        setCurrentPage((previous) => (previous === best ? previous : best))
      },
      { root, threshold: [0, 0.01, 0.2, 0.4, 0.6, 0.8, 0.99] },
    )

    renderObserverRef.current = renderObserver
    activeObserverRef.current = activeObserver

    // Pages already in the DOM when the observers are created.
    for (const element of pageElsRef.current.values()) {
      renderObserver.observe(element)
      activeObserver.observe(element)
    }

    return () => {
      renderObserver.disconnect()
      activeObserver.disconnect()
      renderObserverRef.current = null
      activeObserverRef.current = null
    }
  }, [pageCount])

  /* ------------------------------------------------------------ report --- */

  useEffect(() => {
    if (status !== 'ready') return
    reportProgress(currentPage, pageCount || doc.pageCount || null)
  }, [status, currentPage, pageCount, doc.pageCount, reportProgress])

  /* ---------------------------------------------------------- movement --- */

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const root = scrollRef.current
      const target = pageElsRef.current.get(Math.min(Math.max(pageNumber, 1), pageCount || 1))
      if (!root || !target) return
      const top =
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        GUTTER / 2
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      root.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
    },
    [pageCount],
  )

  useEffect(() => {
    if (status !== 'ready') return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const root = scrollRef.current
      if (!root) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const page = root.clientHeight * 0.92
      switch (event.key) {
        case 'ArrowDown':
          root.scrollBy({ top: 110 })
          break
        case 'ArrowUp':
          root.scrollBy({ top: -110 })
          break
        case 'PageDown':
        case ' ':
          root.scrollBy({ top: page, behavior: 'smooth' })
          break
        case 'PageUp':
          root.scrollBy({ top: -page, behavior: 'smooth' })
          break
        case 'Home':
          scrollToPage(1)
          break
        case 'End':
          scrollToPage(pageCount)
          break
        case 'ArrowRight':
          scrollToPage(currentPage + 1)
          break
        case 'ArrowLeft':
          scrollToPage(currentPage - 1)
          break
        default:
          return
      }
      event.preventDefault()
      noteInteraction()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status, currentPage, pageCount, scrollToPage, noteInteraction])

  /* -------------------------------------------------------------- zoom --- */

  const setZoom = useCallback(
    (next: number) => {
      setCustomScale(clampScale(next))
      setZoomMode('custom')
    },
    [],
  )

  const zoomIn = useCallback(() => setZoom(scale + ZOOM_STEP), [scale, setZoom])
  const zoomOut = useCallback(() => setZoom(scale - ZOOM_STEP), [scale, setZoom])

  /* ------------------------------------------------------------ render --- */

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  )

  const submitPassword = useCallback((password: string) => {
    const callback = passwordCallbackRef.current
    if (!callback) return
    setStatus('loading')
    callback(password)
  }, [])

  return (
    <div className="relative h-full w-full" {...protection.containerProps}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="document"
        aria-label={
          pageCount ? `${doc.title}, ${pageCount} pages` : `${doc.title}, loading`
        }
        aria-busy={status === 'loading'}
        className="no-select relative h-full w-full overflow-auto overscroll-contain bg-[var(--surface-sunken)] outline-none"
      >
        <div
          className="flex min-w-max justify-center"
          style={{ padding: `${GUTTER}px ${GUTTER}px ${GUTTER * 2}px` }}
        >
          <div className="flex flex-col" style={{ gap: `${GUTTER}px` }}>
            {pdf &&
              pageNumbers.map((pageNumber) => {
                const size = sizeFor(pageNumber)
                return (
                  <PdfPage
                    key={pageNumber}
                    attachRef={registerPage}
                    pdf={pdf}
                    pageNumber={pageNumber}
                    cssWidth={Math.round(size.width * scale)}
                    cssHeight={Math.round(size.height * scale)}
                    renderScale={renderScale}
                    active={activePages.has(pageNumber)}
                    watermark={watermark}
                    onMeasured={handleMeasured}
                  />
                )
              })}
          </div>
        </div>
      </div>

      {status === 'loading' && <LoadingState progress={loadProgress} />}
      {status === 'error' && (
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            setReloadKey((key) => key + 1)
          }}
        />
      )}
      {status === 'password' && (
        <PasswordState incorrect={passwordIncorrect} onSubmit={submitPassword} />
      )}

      {status === 'ready' && pageCount > 0 && (
        <ViewerToolbarPortal>
          <ToolbarShell>
            <ToolbarButton
              icon={ZoomOut}
              label="Zoom out"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE + 0.001}
            />
            <button
              type="button"
              onClick={() => setZoomMode('fit-width')}
              title="Reset zoom to fit width"
              className="tnum min-w-[3.25rem] rounded-full px-1 py-1 text-[12px] text-[var(--text-secondary)] transition-colors duration-300 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              style={{ transitionTimingFunction: 'var(--ease-namu)' }}
            >
              {Math.round(scale * 100)}%
            </button>
            <ToolbarButton
              icon={ZoomIn}
              label="Zoom in"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE - 0.001}
            />

            <ToolbarDivider />

            <ToolbarButton
              icon={MoveHorizontal}
              label="Fit width"
              onClick={() => setZoomMode('fit-width')}
              active={zoomMode === 'fit-width'}
            />
            <ToolbarButton
              icon={Scan}
              label="Fit page"
              onClick={() => setZoomMode('fit-page')}
              active={zoomMode === 'fit-page'}
            />

            <ToolbarDivider />

            <ToolbarButton
              icon={ChevronLeft}
              label="Previous page"
              onClick={() => scrollToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            />
            <PageIndicator
              currentPage={currentPage}
              pageCount={pageCount}
              onJump={scrollToPage}
            />
            <ToolbarButton
              icon={ChevronRight}
              label="Next page"
              onClick={() => scrollToPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
            />
          </ToolbarShell>
        </ViewerToolbarPortal>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  One page                                                                   */
/* -------------------------------------------------------------------------- */

type PdfPageProps = {
  /**
   * Named rather than passed as `ref`: React 19 does forward a `ref` prop to
   * function components, but if that ever changed the observers would silently
   * stop registering pages and only the first page would draw. A plain prop has
   * no such failure mode.
   */
  attachRef: (element: HTMLDivElement | null) => (() => void) | void
  pdf: PDFDocumentProxy
  pageNumber: number
  cssWidth: number
  cssHeight: number
  renderScale: number
  active: boolean
  watermark: string
  onMeasured: (pageNumber: number, width: number, height: number) => void
}

function PdfPage({
  attachRef,
  pdf,
  pageNumber,
  cssWidth,
  cssHeight,
  renderScale,
  active,
  watermark,
  onMeasured,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [rendered, setRendered] = useState(false)
  const [failed, setFailed] = useState(false)

  const measuredRef = useRef(onMeasured)
  measuredRef.current = onMeasured

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let task: RenderTask | null = null
    let page: PDFPageProxy | null = null

    void (async () => {
      try {
        page = await pdf.getPage(pageNumber)
        if (cancelled) return

        const unscaled = page.getViewport({ scale: 1 })
        measuredRef.current(pageNumber, unscaled.width, unscaled.height)

        const canvas = canvasRef.current
        if (!canvas) return

        // Rasterise at device pixel ratio for crisp type, but never past the
        // point where the browser refuses to allocate the bitmap.
        const cssViewport = page.getViewport({ scale: renderScale })
        const areaLimit = Math.sqrt(
          MAX_CANVAS_PIXELS / Math.max(1, cssViewport.width * cssViewport.height),
        )
        const outputScale = Math.max(
          0.75,
          Math.min(window.devicePixelRatio || 1, 2, areaLimit),
        )
        const viewport = page.getViewport({ scale: renderScale * outputScale })

        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))

        task = page.render({ canvas, viewport })
        await task.promise
        if (cancelled) return
        setRendered(true)
        setFailed(false)
      } catch (error) {
        if (cancelled) return
        const name = (error as { name?: string } | null)?.name
        // Cancellation is the normal path when scrolling fast or zooming.
        if (name === 'RenderingCancelledException' || name === 'AbortException') return
        console.error(`[viewer] failed to render page ${pageNumber}`, error)
        setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      try {
        task?.cancel()
      } catch {
        // Cancelling an already-settled task is not an error worth surfacing.
      }
      try {
        page?.cleanup()
      } catch {
        // The document may already be destroyed; nothing left to release.
      }
    }
  }, [pdf, pageNumber, renderScale, active])

  // Releasing the bitmap when a page leaves the render window is what keeps a
  // long document from growing without bound.
  useEffect(() => {
    if (active) return
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    setRendered(false)
  }, [active])

  return (
    <div
      ref={attachRef}
      data-page={pageNumber}
      className="relative flex-none overflow-hidden bg-white shadow-[var(--shadow-card)]"
      style={{ width: cssWidth, height: cssHeight }}
      aria-label={`Page ${pageNumber}`}
      role="img"
    >
      {!rendered && (
        <div className={cn('absolute inset-0', failed ? 'bg-[var(--surface-sunken)]' : 'skeleton')} />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-[12px] text-[var(--text-muted)]">
            Page {pageNumber} could not be drawn.
          </p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        // pointer-events off so the canvas cannot be dragged out or picked up
        // by a right-click; the context menu is blocked on the container above.
        className="pointer-events-none block transition-opacity duration-500"
        style={{
          width: cssWidth,
          height: cssHeight,
          opacity: rendered ? 1 : 0,
          transitionTimingFunction: 'var(--ease-namu)',
        }}
      />
      <Watermark text={watermark} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Toolbar page indicator — the one place Sahel appears in the viewer         */
/* -------------------------------------------------------------------------- */

function PageIndicator({
  currentPage,
  pageCount,
  onJump,
}: {
  currentPage: number
  pageCount: number
  onJump: (page: number) => void
}) {
  const [draft, setDraft] = useState(String(currentPage))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(String(currentPage))
  }, [currentPage, editing])

  return (
    <form
      className="flex items-baseline gap-1 px-1"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = Number.parseInt(draft, 10)
        if (Number.isFinite(parsed)) onJump(Math.min(Math.max(parsed, 1), pageCount))
        ;(event.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur()
      }}
    >
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onFocus={(event) => {
          setEditing(true)
          event.currentTarget.select()
        }}
        onBlur={() => {
          setEditing(false)
          setDraft(String(currentPage))
        }}
        inputMode="numeric"
        aria-label={`Page ${currentPage} of ${pageCount}. Type a page number to jump.`}
        className="tnum w-[2.4rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right text-[13px] font-medium text-[var(--accent)] transition-colors duration-300 hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)] focus:outline-none"
        style={{ transitionTimingFunction: 'var(--ease-namu)' }}
      />
      <span className="tnum select-none text-[12px] text-[var(--text-muted)]" aria-hidden="true">
        / {pageCount}
      </span>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/*  States                                                                     */
/* -------------------------------------------------------------------------- */

function LoadingState({ progress }: { progress: number | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="label tnum" role="status">
          {progress === null ? 'Opening document' : `Opening document · ${progress}%`}
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] p-8">
      <div className="namu-card max-w-sm p-7 text-center">
        <TriangleAlert
          className="mx-auto h-5 w-5 text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 className="font-display mt-4 text-[18px] text-[var(--text-primary)]">
          This document didn&rsquo;t open
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {message ?? 'Something went wrong while loading it.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition-colors duration-300 hover:bg-[var(--surface-sunken)]"
          style={{ transitionTimingFunction: 'var(--ease-namu)' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

function PasswordState({
  incorrect,
  onSubmit,
}: {
  incorrect: boolean
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] p-8">
      <form
        className="namu-card w-full max-w-sm p-7 text-center"
        onSubmit={(event) => {
          event.preventDefault()
          if (password) onSubmit(password)
        }}
      >
        <Lock
          className="mx-auto h-5 w-5 text-[var(--text-muted)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 className="font-display mt-4 text-[18px] text-[var(--text-primary)]">
          This PDF is password protected
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Enter the password you were given to open it.
        </p>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
          aria-label="Document password"
          aria-invalid={incorrect || undefined}
          className="mt-5 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />
        {incorrect && (
          <p className="mt-2 text-[12px] text-[var(--text-secondary)]" role="alert">
            That password didn&rsquo;t work. Try again.
          </p>
        )}
        <button
          type="submit"
          disabled={!password}
          className="mt-4 w-full rounded-full bg-[var(--text-primary)] px-4 py-2 text-[12.5px] font-medium text-[var(--surface-raised)] transition-opacity duration-300 disabled:opacity-40"
          style={{ transitionTimingFunction: 'var(--ease-namu)' }}
        >
          Unlock
        </button>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export default PdfViewer
