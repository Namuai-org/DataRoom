'use client'

import type * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Copy deterrence for a document view.
 *
 * Be clear about what this is. It blocks the reflexes — right-click save,
 * Cmd+S, Cmd+P, drag-the-image-to-the-desktop — and it makes printing produce a
 * blank page. It does not, and cannot, stop a determined viewer: the pixels are
 * on their screen, and a phone camera defeats every one of these measures. The
 * real deterrent is the watermark carrying their name and the fact that we log
 * who read what. This hook handles the casual case; honesty handles the rest.
 */

/** Ref-counted so two mounted viewers cannot un-protect each other on unmount. */
let protectedViewCount = 0

export type ViewerProtectionOptions = {
  /** Fired for Cmd/Ctrl+P and for the browser's own print flow. */
  onPrintAttempt?: () => void
  enabled?: boolean
}

export type ViewerProtection = {
  /** Spread onto the element wrapping the document content. */
  containerProps: {
    onContextMenu: (event: React.MouseEvent) => void
    onDragStart: (event: React.DragEvent) => void
  }
}

export function useViewerProtection(options: ViewerProtectionOptions = {}): ViewerProtection {
  const { onPrintAttempt, enabled = true } = options

  const printHandlerRef = useRef(onPrintAttempt)
  printHandlerRef.current = onPrintAttempt

  // One print attempt can fire both keydown and beforeprint; report it once.
  const lastPrintReportRef = useRef(0)

  const reportPrintAttempt = useCallback(() => {
    const now = Date.now()
    if (now - lastPrintReportRef.current < 1500) return
    lastPrintReportRef.current = now
    printHandlerRef.current?.()
  }, [])

  useEffect(() => {
    if (!enabled) return

    protectedViewCount += 1
    document.body.classList.add('protected-view')

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      if (key === 'p') {
        event.preventDefault()
        reportPrintAttempt()
        return
      }
      // Save, and Chrome's "save as" variant.
      if (key === 's') {
        event.preventDefault()
      }
    }

    const onBeforePrint = () => reportPrintAttempt()

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('beforeprint', onBeforePrint)

    return () => {
      protectedViewCount = Math.max(0, protectedViewCount - 1)
      if (protectedViewCount === 0) document.body.classList.remove('protected-view')
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('beforeprint', onBeforePrint)
    }
  }, [enabled, reportPrintAttempt])

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (enabled) event.preventDefault()
    },
    [enabled],
  )

  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      if (enabled) event.preventDefault()
    },
    [enabled],
  )

  return { containerProps: { onContextMenu, onDragStart } }
}
