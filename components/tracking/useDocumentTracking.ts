'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createActivityClock, type ActivityClock } from './activityClock'
import { useTracking } from './RoomTracker'
import { MAX_DELTA_MS, beaconHeartbeat } from './trackingClient'

/** How often an open document reports its accumulated attention. */
export const DOCUMENT_HEARTBEAT_MS = 10_000

/**
 * React runs an effect, its cleanup and the effect again on mount in
 * development StrictMode. The close is deferred by this much so the second run
 * can cancel it, which is what stops a single open document producing two view
 * rows. On a real unmount it simply means the close lands a frame late.
 */
const STRICT_MODE_GRACE_MS = 150

/**
 * A page change flushes the time banked so far against the page that was
 * actually on screen — but only once it is worth attributing. Anything shorter
 * is a visitor flicking past, and it rolls forward into the next page rather
 * than being dropped: the document's total stays exact and only the per-page
 * split blurs, by at most this much per flick.
 */
const MIN_PAGE_FLUSH_MS = 1_500

/** Two print attempts inside this window are one attempt. */
const PRINT_COOLDOWN_MS = 3_000

type OpenEntry = {
  documentId: string
  promise: Promise<string | null>
  viewId: string | null
  finished: boolean
}

type TrackerState = {
  entry: OpenEntry | null
  clock: ActivityClock | null
  pendingMs: number
  pendingPage: number
  pageCount: number | undefined
  inFlight: boolean
  stopped: boolean
  lastPrintAt: number
}

type PendingClose = {
  timer: ReturnType<typeof setTimeout>
  carriedMs: number
}

export type DocumentTracking = {
  /** Null until the open round trip lands, and after a failed open. */
  documentViewId: string | null
  /** Report the page currently on screen; safe to call on every scroll frame. */
  setCurrentPage: (page: number) => void
  trackPrintAttempt: (label?: string) => void
}

function normalisePageCount(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return undefined
  return Math.round(value)
}

/**
 * Tracks one open document: opens a view row, heartbeats real attention time
 * into it every ten seconds, follows the page the visitor is on, and closes the
 * row when the document goes away.
 *
 * Attention time comes from the shared activity clock, so this hook and the
 * room's session heartbeat always agree about whether the visitor was reading.
 * Every failure is swallowed — a viewer that cannot be tracked still renders.
 */
export function useDocumentTracking(documentId: string, pageCount?: number): DocumentTracking {
  const api = useTracking()
  const [documentViewId, setDocumentViewId] = useState<string | null>(null)

  const stateRef = useRef<TrackerState>({
    entry: null,
    clock: null,
    pendingMs: 0,
    pendingPage: 1,
    pageCount: normalisePageCount(pageCount),
    inFlight: false,
    stopped: false,
    lastPrintAt: 0,
  })
  // Keyed by document so a close deferred for one document can never be
  // cancelled — or clobbered — by the arrival of another.
  const pendingClosesRef = useRef<Map<string, PendingClose>>(new Map())

  useEffect(() => {
    stateRef.current.pageCount = normalisePageCount(pageCount)
  }, [pageCount])

  const trackPrintAttempt = useCallback(
    (label?: string) => {
      const state = stateRef.current
      const now = Date.now()
      if (now - state.lastPrintAt < PRINT_COOLDOWN_MS) return
      state.lastPrintAt = now
      const viewId = state.entry?.viewId ?? null
      void api.trackEvent('print_attempt', {
        documentId,
        label,
        metadata: viewId ? { documentViewId: viewId } : undefined,
      })
    },
    [api, documentId],
  )

  const setCurrentPage = useCallback(
    (page: number) => {
      const state = stateRef.current
      const next = Number.isFinite(page) ? Math.max(1, Math.round(page)) : 1
      if (next === state.pendingPage) return

      // Bank what has accrued against the page that was on screen for it.
      state.pendingMs = Math.min(MAX_DELTA_MS, state.pendingMs + (state.clock?.consume() ?? 0))

      const viewId = state.entry?.viewId ?? null
      if (viewId && !state.stopped && !state.inFlight && state.pendingMs >= MIN_PAGE_FLUSH_MS) {
        const deltaMs = state.pendingMs
        const currentPage = state.pendingPage
        state.pendingMs = 0
        state.inFlight = true
        void api
          .heartbeat({ deltaMs, documentViewId: viewId, currentPage, pageCount: state.pageCount })
          .then((result) => {
            if (!result.ok) state.pendingMs = Math.min(MAX_DELTA_MS, state.pendingMs + deltaMs)
          })
          .catch(() => {
            state.pendingMs = Math.min(MAX_DELTA_MS, state.pendingMs + deltaMs)
          })
          .finally(() => {
            state.inFlight = false
          })
      }

      state.pendingPage = next
    },
    [api],
  )

  useEffect(() => {
    if (!documentId) return

    const state = stateRef.current
    let mounted = true

    // A close deferred for this same document means React re-ran the effect
    // (StrictMode in development). Cancel it and take back the time it held.
    // A close deferred for a different document is a real navigation away and
    // is left alone to fire.
    const pendingCloses = pendingClosesRef.current
    const scheduled = pendingCloses.get(documentId)
    if (scheduled) {
      clearTimeout(scheduled.timer)
      pendingCloses.delete(documentId)
      state.pendingMs = Math.min(MAX_DELTA_MS, state.pendingMs + scheduled.carriedMs)
    }

    const openEntry = (): OpenEntry => {
      const entry: OpenEntry = {
        documentId,
        promise: Promise.resolve(null),
        viewId: null,
        finished: false,
      }
      entry.promise = api
        .openDocument(documentId)
        .then((viewId) => {
          entry.viewId = viewId
          return viewId
        })
        .catch(() => null)
      state.entry = entry
      state.pendingPage = 1
      state.stopped = false
      return entry
    }

    // The ref is what makes the StrictMode double-invoke harmless: the second
    // run finds the entry the first run created and reuses its in-flight
    // request instead of opening a second view row.
    const existing = state.entry
    const entry =
      existing && existing.documentId === documentId && !existing.finished
        ? existing
        : openEntry()

    void entry.promise.then((viewId) => {
      if (mounted) setDocumentViewId(viewId)
    })

    state.clock = createActivityClock()

    const takeMs = (): number => {
      const delta = state.pendingMs + (state.clock?.consume() ?? 0)
      state.pendingMs = 0
      return Math.min(MAX_DELTA_MS, delta)
    }

    const carry = (ms: number): void => {
      state.pendingMs = Math.min(MAX_DELTA_MS, state.pendingMs + ms)
    }

    const beat = async (): Promise<void> => {
      if (state.stopped || state.inFlight) return
      const deltaMs = takeMs()
      if (deltaMs <= 0) return

      // Always the live entry, never the one captured when the effect ran: a
      // back/forward-cache restore replaces it with a fresh view row.
      const viewId = state.entry?.viewId ?? null
      // The open has not landed yet: hold the time rather than lose it.
      if (!viewId) {
        carry(deltaMs)
        return
      }

      state.inFlight = true
      let result: { ok: boolean; status: number }
      try {
        result = await api.heartbeat({
          deltaMs,
          documentViewId: viewId,
          currentPage: state.pendingPage,
          pageCount: state.pageCount,
        })
      } catch {
        result = { ok: false, status: 0 }
      }
      state.inFlight = false

      if (result.ok) return
      // 401 means the session ended, 403 means this row is not ours. Neither
      // improves by being retried.
      if (result.status === 401 || result.status === 403) {
        state.stopped = true
        return
      }
      carry(deltaMs)
    }

    /** Flush without closing — the tab went away but the document did not. */
    const flush = (): void => {
      if (state.stopped) return
      const deltaMs = takeMs()
      if (deltaMs <= 0) return
      const viewId = state.entry?.viewId ?? null
      if (!viewId) {
        carry(deltaMs)
        return
      }
      beaconHeartbeat({
        deltaMs,
        documentViewId: viewId,
        currentPage: state.pendingPage,
        pageCount: state.pageCount,
      })
    }

    /** Final flush plus close. Idempotent per entry. */
    const finish = (target: OpenEntry, carriedMs: number): void => {
      if (target.finished) return
      target.finished = true

      const send = (viewId: string | null): void => {
        if (!viewId) return
        if (carriedMs > 0) {
          beaconHeartbeat({
            deltaMs: carriedMs,
            documentViewId: viewId,
            currentPage: state.pendingPage,
            pageCount: state.pageCount,
          })
        }
        api.closeDocument(viewId)
      }

      if (target.viewId) send(target.viewId)
      // Opened and unmounted before the round trip landed: close once it does.
      else void target.promise.then(send).catch(() => {})
    }

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }

    const onPageHide = (): void => {
      finish(state.entry ?? entry, takeMs())
    }

    const onPageShow = (event: PageTransitionEvent): void => {
      // Restored from the back/forward cache after the close already fired.
      // Whatever the visitor does now is a genuinely new look at the document.
      if (!event.persisted || !mounted) return
      if (!state.entry?.finished) return
      const reopened = openEntry()
      void reopened.promise.then((viewId) => {
        if (mounted) setDocumentViewId(viewId)
      })
    }

    const onBeforePrint = (): void => trackPrintAttempt('beforeprint')

    const timer = setInterval(() => {
      void beat()
    }, DOCUMENT_HEARTBEAT_MS)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('beforeprint', onBeforePrint)

    return () => {
      mounted = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('beforeprint', onBeforePrint)

      const carriedMs = takeMs()
      state.clock?.release()
      state.clock = null

      const target = state.entry
      if (!target || target.finished) return

      const closeTimer = setTimeout(() => {
        if (pendingCloses.get(documentId)?.timer === closeTimer) pendingCloses.delete(documentId)
        finish(target, carriedMs)
      }, STRICT_MODE_GRACE_MS)
      pendingCloses.set(documentId, { timer: closeTimer, carriedMs })
    }
  }, [api, documentId, trackPrintAttempt])

  return { documentViewId, setCurrentPage, trackPrintAttempt }
}

export default useDocumentTracking
