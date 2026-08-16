'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Search, MessageCircleQuestion, X } from 'lucide-react'
import { NamuLogo } from '@/components/brand/Logo'
import { ThemeToggle } from './ThemeToggle'
import { initials } from '@/lib/utils'

/**
 * The room's persistent header. It stays quiet: the logo, a search field, and
 * the visitor's own identity — which is shown deliberately, so a viewer always
 * knows the session is attributed to them.
 */
export function RoomHeader({
  email,
  name,
  qaEnabled,
  openQuestionCount,
}: {
  email: string
  name: string | null
  qaEnabled: boolean
  openQuestionCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl-K focuses search from anywhere in the room.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    router.push(`/room/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'color-mix(in oklab, var(--surface) 82%, transparent)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Link href="/room" className="flex-none" aria-label="Namu data room home">
          <span className="block [[data-theme='dark']_&]:hidden">
            <NamuLogo tone="dark" height={26} />
          </span>
          <span className="hidden [[data-theme='dark']_&]:block">
            <NamuLogo tone="light" height={26} />
          </span>
        </Link>

        <span
          className="label hidden flex-none border-l pl-4 sm:block"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          Data Room
        </span>

        <form onSubmit={submit} className="ml-auto flex min-w-0 flex-1 justify-end sm:ml-6">
          <div
            className="relative flex w-full max-w-xs items-center rounded-full border transition-all duration-300"
            style={{
              borderColor: focused ? 'var(--accent)' : 'var(--border-subtle)',
              background: 'var(--surface-raised)',
            }}
          >
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5"
              style={{ color: 'var(--text-muted)' }}
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search documents"
              aria-label="Search documents"
              className="w-full bg-transparent py-2 pl-10 pr-9 text-sm outline-none placeholder:text-[var(--text-muted)]"
              style={{ color: 'var(--text-primary)' }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            ) : (
              <kbd
                className="absolute right-3 hidden text-[10px] tracking-wider sm:block"
                style={{ color: 'var(--text-muted)' }}
              >
                ⌘K
              </kbd>
            )}
          </div>
        </form>

        {qaEnabled && (
          <Link
            href="/room/questions"
            className="relative hidden h-9 w-9 flex-none place-items-center rounded-full border transition-colors duration-300 hover:bg-[var(--surface-sunken)] sm:grid"
            style={{
              borderColor: pathname === '/room/questions' ? 'var(--accent)' : 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Questions"
          >
            <MessageCircleQuestion size={15} />
            {openQuestionCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-semibold"
                style={{ background: 'var(--accent)', color: '#1C1410' }}
              >
                {openQuestionCount}
              </span>
            )}
          </Link>
        )}

        <ThemeToggle className="hidden flex-none sm:grid" />

        <div
          className="flex flex-none items-center gap-2.5 border-l pl-4"
          style={{ borderColor: 'var(--border-subtle)' }}
          title={`Signed in as ${email}. Your activity in this room is recorded.`}
        >
          <div
            className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            {initials(name ?? email)}
          </div>
          <div className="hidden leading-tight lg:block">
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {name ?? email.split('@')[0]}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {email}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
