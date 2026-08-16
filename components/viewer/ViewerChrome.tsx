'use client'

import Link from 'next/link'
import type * as React from 'react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { brand, displayFolderName } from '@/lib/brand'
import { ToolbarSlotTarget } from './ToolbarSlot'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'
import { documentDownloadUrl, kindLabel, type ViewerDocument } from './types'

/**
 * The frame around any document.
 *
 * The chrome is deliberately quiet — one bar, a hairline, a footer line. The
 * document is the subject; everything here should be findable but forgettable.
 */

export type ViewerChromeProps = {
  doc: ViewerDocument
  /** Takes precedence over the folder fields on the document itself. */
  folder?: { slug: string; name: string } | null
  viewerEmail: string
  canDownload: boolean
  /** Defaults to the document's folder in the room. */
  backHref?: string
  children: ReactNode
}

export function ViewerChrome({
  doc,
  folder,
  viewerEmail,
  canDownload,
  backHref,
  children,
}: ViewerChromeProps) {
  const folderName = folder?.name ?? doc.folderName ?? null
  const folderSlug = folder?.slug ?? doc.folderSlug ?? null
  const folderLabel = folderName ? displayFolderName(folderName) : 'Data room'
  const href = backHref ?? (folderSlug ? `/room/${folderSlug}` : '/room')

  const meta = [
    kindLabel(doc),
    doc.sizeBytes ? formatBytes(doc.sizeBytes) : null,
    doc.pageCount ? `${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}` : null,
  ].filter(Boolean) as string[]

  const [rootRef, height] = useAvailableHeight()

  return (
    <div
      ref={rootRef}
      className="flex flex-col overflow-hidden bg-[var(--surface)]"
      style={{ height }}
    >
      <header className="flex-none border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Link
            href={href}
            aria-label={`Back to ${folderLabel}`}
            className="group -ml-1 flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-300 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            style={{ transitionTimingFunction: 'var(--ease-namu)' }}
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
          </Link>

          <div className="min-w-0 flex-1 basis-[200px]">
            <div className="label truncate">{folderLabel}</div>
            <h1
              className="font-display truncate text-[17px] leading-tight text-[var(--text-primary)] sm:text-[19px]"
              title={doc.title}
            >
              {doc.title}
            </h1>
            {meta.length > 0 && (
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)] tnum">
                {meta.join(' · ')}
              </p>
            )}
          </div>

          {/* Renderer controls (zoom, page indicator) portal in here. */}
          <ToolbarSlotTarget className="order-last flex w-full items-center justify-center gap-1 md:order-none md:w-auto md:justify-end" />

          <DownloadAction doc={doc} canDownload={canDownload} />
        </div>
      </header>

      <main className="relative min-h-0 flex-1">{children}</main>

      <footer className="flex-none border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
          <ShieldCheck
            className="h-3.5 w-3.5 flex-none text-[var(--text-muted)]"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          {/*
            Saying this out loud is the point. A reader who knows the view is
            attributed to them behaves differently from one who does not, and
            telling them is the honest half of that bargain.
          */}
          <p className="truncate text-[11px] tracking-[0.02em] text-[var(--text-muted)]">
            Confidential — this view is logged to{' '}
            <span className="text-[var(--text-secondary)]">{viewerEmail}</span>
          </p>
        </div>
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * The viewer fills whatever is left of the screen below the room's own header,
 * rather than assuming the whole viewport. Measuring is what makes it survive a
 * header that changes height — or a page that renders the viewer with nothing
 * above it at all. The `useLayoutEffect` runs before paint, so the corrected
 * height is the first one drawn and there is no jump.
 */
function useAvailableHeight(): [React.RefObject<HTMLDivElement | null>, string] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState('calc(100dvh - 4.25rem)')

  useIsomorphicLayoutEffect(() => {
    const measure = () => {
      const element = ref.current
      if (!element) return
      const offset = Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY))
      // The floor keeps the viewer usable if it is ever placed low on a long
      // page, where the arithmetic would otherwise leave it a few pixels tall.
      setHeight(`max(26rem, calc(100dvh - ${offset}px))`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return [ref, height]
}

function DownloadAction({ doc, canDownload }: { doc: ViewerDocument; canDownload: boolean }) {
  const tooltipId = useId()
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const baseClass =
    'flex h-9 flex-none items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-all duration-300'

  if (canDownload) {
    return (
      <a
        href={documentDownloadUrl(doc.id)}
        download={doc.fileName}
        className={cn(
          baseClass,
          'border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
        )}
        style={{ transitionTimingFunction: 'var(--ease-namu)' }}
      >
        <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        <span className="hidden sm:inline">Download</span>
      </a>
    )
  }

  const reason =
    doc.downloadReason ??
    'Downloads are off for your access. You can read the whole document here.'

  return (
    <div className="relative flex-none">
      {/*
        aria-disabled rather than disabled: the control stays focusable, so a
        keyboard user can actually reach the explanation for why it is off.
      */}
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={tooltipId}
        onClick={(event) => {
          event.preventDefault()
          setTooltipOpen(true)
        }}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        className={cn(
          baseClass,
          'cursor-not-allowed border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)]',
        )}
        style={{ transitionTimingFunction: 'var(--ease-namu)' }}
      >
        <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        <span className="hidden sm:inline">Download</span>
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className={cn(
          'namu-card absolute right-0 top-[calc(100%+8px)] z-50 w-64 px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)] transition-opacity duration-300',
          tooltipOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transitionTimingFunction: 'var(--ease-namu)' }}
      >
        {reason}{' '}
        <a
          href={`mailto:${brand.contact}`}
          className="text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-2"
        >
          {brand.contact}
        </a>
      </div>
    </div>
  )
}
