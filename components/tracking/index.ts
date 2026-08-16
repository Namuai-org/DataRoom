/**
 * Visitor analytics tracking layer.
 *
 *   app/room/layout.tsx   <RoomTracker>{children}</RoomTracker>
 *   any room component    const { trackEvent } = useTracking()
 *   any document viewer   const { documentViewId, setCurrentPage, trackPrintAttempt }
 *                           = useDocumentTracking(doc.id, doc.pageCount ?? undefined)
 */

export { RoomTracker, useTracking, SESSION_HEARTBEAT_MS } from './RoomTracker'
export type { RoomTrackerProps } from './RoomTracker'

export { useDocumentTracking, DOCUMENT_HEARTBEAT_MS } from './useDocumentTracking'
export type { DocumentTracking } from './useDocumentTracking'

export { createActivityClock, IDLE_AFTER_MS, MAX_SEGMENT_MS } from './activityClock'
export type { ActivityClock } from './activityClock'

export {
  TRACK_ENDPOINTS,
  VISITOR_EVENT_TYPES,
  MAX_DELTA_MS,
  defaultTrackingApi,
} from './trackingClient'
export type {
  HeartbeatInput,
  TrackEventPayload,
  TrackResult,
  TrackingApi,
  VisitorEventType,
} from './trackingClient'
