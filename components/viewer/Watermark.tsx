'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A tiled diagonal watermark laid over the document.
 *
 * It is drawn in the DOM, above the canvas, rather than composited into the
 * bitmap. Baking it into the canvas would be trivially stripped by re-rendering
 * the page; keeping it as a sibling layer means a screenshot — the realistic
 * threat — always carries it. It is set at 7% ink: legible enough that a leaked
 * screenshot traces back to one reader, faint enough to read straight through.
 */

const TILE_WIDTH = 340
const TILE_HEIGHT = 148

export type WatermarkProps = {
  text: string
  className?: string
  /** Slightly heavier over photographic content, which swallows 7% ink. */
  intensity?: 'default' | 'strong'
}

export function Watermark({ text, className, intensity = 'default' }: WatermarkProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Measured rather than assumed so the same component works over a PDF page,
    // a full-bleed image and a scrolling table.
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize((previous) =>
        Math.abs(previous.width - rect.width) < 8 && Math.abs(previous.height - rect.height) < 8
          ? previous
          : { width: rect.width, height: rect.height },
      )
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const tiles = useMemo(() => {
    if (!size.width || !size.height) return []
    // The layer is rotated -30°, so it is drawn at 200% and offset by -50% in
    // both axes; that always covers the corners whatever the aspect ratio.
    const columns = Math.max(2, Math.ceil((size.width * 2) / TILE_WIDTH))
    const rows = Math.max(2, Math.ceil((size.height * 2) / TILE_HEIGHT))
    const total = Math.min(columns * rows, 400)
    return Array.from({ length: total }, (_, index) => ({
      key: index,
      // Offsetting alternate rows breaks the grid up, so the pattern cannot be
      // cropped around and reads as a texture rather than a table.
      offset: Math.floor(index / columns) % 2 === 0 ? 0 : TILE_WIDTH / 2,
      columns,
    }))
  }, [size])

  const columns = tiles[0]?.columns ?? 2

  // An empty string means the room has watermarking switched off. Rendering the
  // tile grid anyway would lay 400 invisible spans over every document for no
  // reason. The guard sits here, after the hooks, so hook order stays stable.
  if (!text.trim()) return null

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-watermark=""
      className={cn('pointer-events-none absolute inset-0 z-10 overflow-hidden no-select', className)}
    >
      <div
        className="absolute"
        style={{
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          transform: 'rotate(-30deg)',
          transformOrigin: 'center',
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, ${TILE_WIDTH}px)`,
          gridAutoRows: `${TILE_HEIGHT}px`,
          alignContent: 'start',
          color: 'var(--text-primary)',
          opacity: intensity === 'strong' ? 0.11 : 0.07,
          willChange: 'transform',
        }}
      >
        {tiles.map((tile) => (
          <span
            key={tile.key}
            style={{
              transform: `translateX(${tile.offset}px)`,
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.1em',
              whiteSpace: 'nowrap',
              lineHeight: 1,
              alignSelf: 'center',
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  )
}
