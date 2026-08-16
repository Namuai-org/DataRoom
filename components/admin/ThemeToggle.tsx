'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'namu-theme'

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

/**
 * Writes the same two markers the inline script in app/layout.tsx reads on
 * first paint: `data-theme` on <html> and the `dark` class Tailwind keys off.
 * Keeping both in sync is what stops the room flashing the wrong theme on the
 * next navigation.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private browsing with storage disabled. The attribute still applies for
    // this page; only the memory of the choice is lost.
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(readTheme())
    setMounted(true)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const label = mounted
    ? theme === 'dark'
      ? 'Switch to the light theme'
      : 'Switch to the dark theme'
    : 'Switch theme'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-secondary)]',
        'transition-colors duration-200 [transition-timing-function:var(--ease-namu)]',
        'hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
        className,
      )}
    >
      {mounted && theme === 'dark' ? (
        <Sun size={16} aria-hidden />
      ) : (
        <Moon size={16} aria-hidden />
      )}
    </button>
  )
}

/** Reports the active theme to components that need concrete colours (charts). */
export function useThemeTone(): { theme: Theme; mounted: boolean } {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(readTheme())
    setMounted(true)

    const observer = new MutationObserver(() => setTheme(readTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return { theme, mounted }
}
