'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * The initial theme is applied by an inline script in the root layout, so this
 * component only has to keep the toggle label in sync after hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem('namu-theme', next)
    } catch {
      // Private browsing can refuse localStorage; the toggle still works for
      // this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`grid h-9 w-9 place-items-center rounded-full border transition-colors duration-300 hover:bg-[var(--surface-sunken)] ${className ?? ''}`}
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
    >
      {mounted && theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}
