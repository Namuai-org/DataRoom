'use client'

import { useCallback, useState } from 'react'
import {
  useTracking,
  useDocumentTracking as useSharedDocumentTracking,
  type VisitorEventType,
} from '@/components/tracking'

/**
 * The renderers' view of attention tracking.
 *
 * This is an adapter, not an implementation. All the accounting lives in
 * `components/tracking/activityClock.ts`, which every part of the room shares:
 * the session heartbeat and each open document read from one clock, so they can
 * never disagree about whether the visitor was actually reading.
 *
 * It matters that there is only one clock. An independent per-viewer timer has
 * to re-derive the same rules — tab hidden, window blurred, reader idle, laptop
 * asleep — and getting any of them slightly wrong shows up directly as inflated
 * reading time in the console. The shared clock discards a wake-from-sleep gap
 * outright rather than crediting its two-minute ceiling to it, which is the
 * difference between a real reading time and a number that quietly flatters
 * every document in the room.
 *
 * The shape here is the renderers' rather than the shared hook's, because a PDF
 * only learns its own length after it loads: `reportProgress` carries the page
 * count alongside the page, and feeds it back into the shared hook, which
 * re-syncs on the argument changing.
 */

export type DocumentTracking = {
  documentViewId: string | null
  /** Called by the renderer whenever the visible page changes. */
  reportProgress: (currentPage: number, pageCount: number | null) => void
  /** Records a discrete event, e.g. a print attempt. */
  trackEvent: (type: string, label?: string, metadata?: Record<string, unknown>) => void
  /**
   * Kept for renderers that want to signal an interaction the global listeners
   * cannot see. The shared clock already watches pointer, keyboard, scroll and
   * touch in the capture phase, so this is almost always a no-op.
   */
  noteInteraction: () => void
}

export function useDocumentTracking(documentId: string, pageCount?: number): DocumentTracking {
  const api = useTracking()

  // Seeded from the database value and widened once the renderer discovers the
  // real length. Held in state rather than a ref precisely so the change reaches
  // the shared hook, which re-syncs whenever this argument differs.
  const [livePageCount, setLivePageCount] = useState<number | undefined>(pageCount)
  const shared = useSharedDocumentTracking(documentId, livePageCount)

  const reportProgress = useCallback(
    (currentPage: number, reportedPageCount: number | null) => {
      if (reportedPageCount && reportedPageCount > 0) {
        setLivePageCount((previous) =>
          previous === reportedPageCount ? previous : reportedPageCount,
        )
      }
      shared.setCurrentPage(currentPage)
    },
    [shared],
  )

  const trackEvent = useCallback(
    (type: string, label?: string, metadata?: Record<string, unknown>) => {
      if (type === 'print_attempt') {
        shared.trackPrintAttempt(label)
        return
      }
      void api.trackEvent(type as VisitorEventType, { documentId, label, metadata })
    },
    [api, documentId, shared],
  )

  const noteInteraction = useCallback(() => {}, [])

  return {
    documentViewId: shared.documentViewId,
    reportProgress,
    trackEvent,
    noteInteraction,
  }
}

export default useDocumentTracking
