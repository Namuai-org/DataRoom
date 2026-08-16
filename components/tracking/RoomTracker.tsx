'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createActivityClock } from './activityClock'
import {
  MAX_DELTA_MS,
  beaconHeartbeat,
  defaultTrackingApi,
  type TrackingApi,
  type VisitorEventType,
} from './trackingClient'

/** How often the session heartbeat reports accumulated attention. */
export const SESSION_HEARTBEAT_MS = 15_000

const TrackingContext = createContext<TrackingApi>(defaultTrackingApi)

/**
 * Reporting handle for anything inside the room.
 *
 * Falls back to the module-level transport when no provider is above it, so a
 * component that is rendered outside the room layout still records correctly
 * instead of throwing. Nothing about tracking is ever worth an error boundary.
 */
export function useTracking(): TrackingApi {
  return useContext(TrackingContext)
}

export type RoomTrackerProps = {
  children?: ReactNode
  /** Override for tests; the room should use the default. */
  intervalMs?: number
  api?: TrackingApi
}

/**
 * Mount once in the room layout, wrapping the room's children.
 *
 * Runs the session heartbeat and publishes the tracking context. It renders
 * nothing of its own and never blocks: every failure path here is a no-op, and
 * a heartbeat that cannot be delivered is carried into the next one rather than
 * surfaced. `room_entered` is deliberately not fired here — the route that
 * admits the visitor records that server-side, where it cannot be forged.
 */
export function RoomTracker({
  children,
  intervalMs = SESSION_HEARTBEAT_MS,
  api = defaultTrackingApi,
}: RoomTrackerProps) {
  // Survives the StrictMode remount, so time measured before the double-invoke
  // is not thrown away.
  const carriedRef = useRef(0)

  useEffect(() => {
    const clock = createActivityClock()
    let inFlight = false
    let stopped = false

    const take = (): number => {
      const delta = carriedRef.current + clock.consume()
      carriedRef.current = 0
      return Math.min(MAX_DELTA_MS, delta)
    }

    const carry = (ms: number): void => {
      carriedRef.current = Math.min(MAX_DELTA_MS, carriedRef.current + ms)
    }

    const beat = async (): Promise<void> => {
      // A slow beat never stacks up behind the next one; the clock keeps
      // accruing meanwhile, so nothing is lost by skipping a tick.
      if (stopped || inFlight) return

      const deltaMs = take()
      // Nothing to report. Deliberately no empty beat: `lastSeenAt` should mean
      // "last seen paying attention", not "last had a tab open".
      if (deltaMs <= 0) return

      inFlight = true
      let result: { ok: boolean; status: number }
      try {
        result = await api.heartbeat({ deltaMs })
      } catch {
        result = { ok: false, status: 0 }
      }
      inFlight = false

      if (result.ok) return
      if (result.status === 401 || result.status === 403) {
        // The session is over. Beating against a closed door every fifteen
        // seconds helps nobody; the room redirects on its next navigation.
        stopped = true
        return
      }
      // Rate limited, server error, or offline: try again on the next beat.
      carry(deltaMs)
    }

    const flush = (): void => {
      if (stopped) return
      const deltaMs = take()
      if (deltaMs <= 0) return
      // Only a beacon survives the page going away.
      beaconHeartbeat({ deltaMs })
    }

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }

    const timer = setInterval(() => {
      void beat()
    }, intervalMs)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
      flush()
      clock.release()
    }
  }, [api, intervalMs])

  return <TrackingContext.Provider value={api}>{children}</TrackingContext.Provider>
}

export default RoomTracker
export type { TrackingApi, VisitorEventType }
