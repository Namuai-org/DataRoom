'use client'

import { useEffect, useLayoutEffect } from 'react'

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * The viewer measures the space it has been given before its first paint, which
 * is what `useLayoutEffect` is for — but a client component is still rendered
 * once on the server, where layout effects cannot run and React says so in the
 * console. Swapping the implementation keeps the measurement and drops the
 * noise; nothing depends on the effect running during server render.
 */
export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect
