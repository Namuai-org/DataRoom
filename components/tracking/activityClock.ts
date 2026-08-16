'use client'

/**
 * Attention accounting for the whole room.
 *
 * The question this exists to answer is "how long did they actually spend on
 * this document", which is not the same as "how long was the tab open". A tab
 * left open overnight must be worth zero. Thirty minutes of genuine reading
 * must be worth thirty minutes even if the visitor barely touched the mouse.
 *
 * THE RULES
 *
 * 1. Time accrues only while `document.visibilityState === 'visible'`. A
 *    backgrounded tab, a minimised window and a locked screen all stop the
 *    clock immediately.
 * 2. Time accrues only while the page holds focus. Focus moving into an iframe
 *    on this page does NOT stop the clock — `window` fires `blur` in that case
 *    but `document.hasFocus()` stays true, and an embedded PDF viewer is
 *    exactly where reading happens. Focus moving to another application does
 *    stop it.
 * 3. Time accrues only for 60 seconds past the last sign of the visitor
 *    (mousemove, mousedown, keydown, scroll, wheel, click, touchstart,
 *    touchmove, or the tab regaining focus). Idle is measured against a
 *    timestamp rather than an event, so the clock stops at the 60 second mark
 *    inside a segment rather than at the next tick.
 * 4. A gap of more than 2 minutes between ticks is discarded outright. The
 *    machine slept, or the tab was frozen; either way nobody was reading. The
 *    idle rule bounds what a shorter sleep can cost: a 90 second nap can at
 *    worst be credited as 60 seconds, and only if the visitor was active right
 *    up to the moment the lid closed.
 * 5. Every state change settles the accumulator before the state flips, so each
 *    measured segment has exactly one state. This is what keeps the arithmetic
 *    honest without polling faster than once a second.
 *
 * ONE MONITOR, MANY CURSORS
 *
 * The listeners, the timer and the running total live once per page. Each
 * caller — the room tracker, every open document viewer — gets a cheap cursor
 * over that single total, so two trackers can never disagree about whether the
 * visitor was reading, and consuming from one never steals time from another.
 * Listeners attach with the first cursor and detach with the last.
 */

export const IDLE_AFTER_MS = 60_000
export const MAX_SEGMENT_MS = 120_000

const TICK_MS = 1_000
const ACTIVITY_THROTTLE_MS = 250

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'wheel',
  'click',
  'touchstart',
  'touchmove',
] as const

// Capture, because `scroll` does not bubble: a PDF scrolling inside its own
// container would otherwise never reach a document-level listener.
const LISTENER_OPTIONS = { capture: true, passive: true } as const

export interface ActivityClock {
  /** Active milliseconds since the previous consume() on this cursor. */
  consume(): number
  /** Same number, without resetting the cursor. */
  peek(): number
  /** Whether the clock is running right now — visible, focused and not idle. */
  isCounting(): boolean
  /** Detach this cursor. Safe to call twice. */
  release(): void
}

/* -------------------------------------------------------------------------- */
/*  Shared monitor                                                             */
/* -------------------------------------------------------------------------- */

let cursorCount = 0
/** Monotonic and deliberately never reset, so cursors survive re-attachment. */
let totalActiveMs = 0
let lastTickAt = 0
let lastActivityAt = 0
let lastActivityBumpAt = 0
let visible = true
let focused = true
let tickTimer: ReturnType<typeof setInterval> | null = null
let focusRecheckTimer: ReturnType<typeof setTimeout> | null = null

function settle(now: number): void {
  const gap = now - lastTickAt
  lastTickAt = now

  if (gap <= 0) return
  // Rule 4 — suspended machine or frozen tab.
  if (gap > MAX_SEGMENT_MS) return
  // Rules 1 and 2 — the state held for this whole segment.
  if (!visible || !focused) return

  // Rule 3 — credit only the part of the segment before the idle cutoff.
  const segmentStart = now - gap
  const idleAt = lastActivityAt + IDLE_AFTER_MS
  const creditedEnd = Math.min(now, idleAt)
  if (creditedEnd > segmentStart) totalActiveMs += creditedEnd - segmentStart
}

/** Settles the segment that just ended, then restarts the idle countdown. */
function markActivity(now: number): void {
  settle(now)
  lastActivityAt = now
}

function onActivity(): void {
  const now = Date.now()
  // Throttled by skipping the work entirely rather than by deferring it: a
  // deferred bump would credit idle time to the segment it lands in.
  if (now - lastActivityBumpAt < ACTIVITY_THROTTLE_MS) return
  lastActivityBumpAt = now
  markActivity(now)
}

function onVisibilityChange(): void {
  const now = Date.now()
  const nextVisible = document.visibilityState === 'visible'
  if (nextVisible === visible) return
  settle(now)
  visible = nextVisible
  // Coming back to the tab is itself a sign of life.
  if (nextVisible) lastActivityAt = now
}

function readFocus(): boolean {
  return typeof document.hasFocus === 'function' ? document.hasFocus() : true
}

function recheckFocus(): void {
  if (focusRecheckTimer !== null) clearTimeout(focusRecheckTimer)
  // Deferred by a macrotask because focus has not necessarily settled by the
  // time `blur` fires, and because a blur caused by focus entering an iframe on
  // this page must not read as the visitor leaving.
  focusRecheckTimer = setTimeout(() => {
    focusRecheckTimer = null
    const nextFocused = readFocus()
    if (nextFocused === focused) return
    const now = Date.now()
    settle(now)
    focused = nextFocused
    if (nextFocused) lastActivityAt = now
  }, 0)
}

function onFocus(): void {
  const now = Date.now()
  if (!focused) {
    settle(now)
    focused = true
  }
  lastActivityAt = now
}

function onTick(): void {
  settle(Date.now())
}

function attach(): void {
  const now = Date.now()
  lastTickAt = now
  lastActivityAt = now
  lastActivityBumpAt = 0
  visible = document.visibilityState === 'visible'
  focused = readFocus()

  for (const type of ACTIVITY_EVENTS) {
    document.addEventListener(type, onActivity, LISTENER_OPTIONS)
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', recheckFocus)
  tickTimer = setInterval(onTick, TICK_MS)
}

function detach(): void {
  settle(Date.now())

  for (const type of ACTIVITY_EVENTS) {
    document.removeEventListener(type, onActivity, LISTENER_OPTIONS)
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('blur', recheckFocus)

  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (focusRecheckTimer !== null) {
    clearTimeout(focusRecheckTimer)
    focusRecheckTimer = null
  }
}

/* -------------------------------------------------------------------------- */
/*  Cursors                                                                    */
/* -------------------------------------------------------------------------- */

const INERT_CLOCK: ActivityClock = {
  consume: () => 0,
  peek: () => 0,
  isCounting: () => false,
  release: () => {},
}

/**
 * Opens a cursor on the shared monitor. Every caller must release it — a React
 * effect should do so in its cleanup — or the page keeps its listeners.
 */
export function createActivityClock(): ActivityClock {
  if (typeof document === 'undefined' || typeof window === 'undefined') return INERT_CLOCK

  if (cursorCount === 0) attach()
  cursorCount += 1

  let mark = totalActiveMs
  let released = false

  const read = (): number => {
    if (released) return 0
    if (cursorCount > 0) settle(Date.now())
    return Math.max(0, Math.round(totalActiveMs - mark))
  }

  return {
    consume() {
      const delta = read()
      mark = totalActiveMs
      return delta
    },
    peek: read,
    isCounting() {
      if (released) return false
      return visible && focused && Date.now() - lastActivityAt < IDLE_AFTER_MS
    },
    release() {
      if (released) return
      released = true
      cursorCount -= 1
      if (cursorCount <= 0) {
        cursorCount = 0
        detach()
      }
    },
  }
}
