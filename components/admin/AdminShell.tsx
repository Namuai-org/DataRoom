'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Send,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NamuLogoAuto } from '@/components/brand/Logo'
import { cn, initials } from '@/lib/utils'
import { signOut } from '@/app/admin/_actions/auth'
import { ThemeToggle } from './ThemeToggle'
import { Initials } from './ui'

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean }

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/visitors', label: 'Visitors', icon: Users },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  { href: '/admin/invites', label: 'Invites', icon: Send },
  { href: '/admin/questions', label: 'Questions', icon: MessageCircleQuestion },
  { href: '/admin/diligence', label: 'Readiness', icon: ClipboardCheck },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Console sections" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-[9px] py-2.5 pl-4 pr-3 text-[0.875rem]',
              'transition-colors duration-200 [transition-timing-function:var(--ease-namu)]',
              active
                ? 'bg-[var(--surface-sunken)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
            )}
          >
            {/*
              The single moment of Sahel in the chrome: a 2px bar on the active
              item. Nothing else in the sidebar is allowed to use it.
            */}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full transition-opacity duration-300',
                active ? 'opacity-100' : 'opacity-0',
              )}
              style={{ background: 'var(--color-sahel)' }}
            />
            <Icon size={16} aria-hidden className="shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarFooter({ email, isOwner }: { email: string; isOwner: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] px-4 pb-6 pt-5">
      <div className="flex items-center gap-3">
        <Initials value={initials(email)} />
        <div className="min-w-0">
          <p className="truncate text-[0.8rem] text-[var(--text-primary)]" title={email}>
            {email}
          </p>
          <p className="text-[0.7rem] text-[var(--text-muted)]">{isOwner ? 'Owner' : 'Admin'}</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <form action={signOut}>
          <button
            type="submit"
            className={cn(
              'flex h-9 items-center gap-2 rounded-[9px] px-3 text-[0.8rem] text-[var(--text-secondary)]',
              'transition-colors duration-200 [transition-timing-function:var(--ease-namu)]',
              'hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
            )}
          >
            <LogOut size={15} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * The console shell.
 *
 * This is a client component because the active nav item depends on the
 * pathname and the mobile drawer holds state. The authentication check does
 * **not** live here — it happens on the server, in the route-group layout that
 * renders this, and again inside every page. A component the browser can render
 * is not a security boundary.
 */
export function AdminShell({
  email,
  isOwner,
  children,
}: {
  email: string
  isOwner: boolean
  children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-dvh bg-[var(--surface)] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] lg:flex">
        <div className="flex flex-col gap-8 px-4 pt-7">
          <Link
            href="/admin"
            aria-label="Namu data room console"
            className="block px-1 pb-1 transition-opacity duration-200 hover:opacity-70"
          >
            <NamuLogoAuto height={26} />
          </Link>
          <NavLinks />
        </div>
        <SidebarFooter email={email} isOwner={isOwner} />
      </aside>

      {/* Mobile bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 lg:hidden">
        <Link href="/admin" aria-label="Namu data room console">
          <NamuLogoAuto height={22} />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open the console menu"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Menu size={18} aria-hidden />
          </button>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close the console menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-ink)_55%,transparent)]"
          />
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Console menu"
            className="animate-fade-up absolute inset-y-0 left-0 flex w-[268px] max-w-[85vw] flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--surface-raised)]"
          >
            <div className="flex flex-col gap-8 px-4 pt-6">
              <div className="flex items-center justify-between px-1">
                <NamuLogoAuto height={24} />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close the console menu"
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            <SidebarFooter email={email} isOwner={isOwner} />
          </div>
        </div>
      ) : null}

      <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-12 lg:py-14 xl:px-16">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </div>
  )
}
