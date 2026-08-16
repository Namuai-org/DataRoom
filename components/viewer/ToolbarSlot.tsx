'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A portal slot so the chrome can own the frame while each renderer owns its
 * own controls. PdfViewer knows about zoom and page number; ViewerChrome knows
 * where they belong on screen. Neither needs to know about the other, and no
 * control state has to be lifted and threaded back down.
 */

type ToolbarSlotValue = {
  element: HTMLElement | null
  register: (element: HTMLElement | null) => void
}

const ToolbarSlotContext = createContext<ToolbarSlotValue | null>(null)

export function ToolbarSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const register = useCallback((next: HTMLElement | null) => {
    setElement(next)
  }, [])
  const value = useMemo(() => ({ element, register }), [element, register])
  return <ToolbarSlotContext.Provider value={value}>{children}</ToolbarSlotContext.Provider>
}

/** Rendered once by the chrome. */
export function ToolbarSlotTarget({ className }: { className?: string }) {
  const context = useContext(ToolbarSlotContext)
  return <div ref={context?.register} className={className} />
}

/** Rendered by a document renderer; its children appear inside the target. */
export function ViewerToolbarPortal({ children }: { children: ReactNode }) {
  const context = useContext(ToolbarSlotContext)
  // Null on the first client render and during SSR, which is correct: the
  // controls simply appear once the frame exists.
  if (!context?.element) return null
  return createPortal(children, context.element)
}
