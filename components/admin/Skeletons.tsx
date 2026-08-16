import { cn } from '@/lib/utils'

/**
 * Loading shapes for the route-level `loading.tsx` files. They mirror the real
 * layout closely enough that nothing jumps when the data lands — a skeleton
 * that does not match its content is just a different kind of flicker.
 */

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('skeleton h-3 rounded-full', className)} />
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[14px]', className)} />
}

export function SkeletonHeader() {
  return (
    <div className="mb-10 flex flex-col gap-4">
      <SkeletonLine className="w-24" />
      <SkeletonLine className="h-8 w-[min(340px,70%)]" />
      <SkeletonLine className="h-3 w-[min(460px,90%)]" />
    </div>
  )
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className="h-[104px]" />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="namu-card overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3.5">
        <SkeletonLine className="w-32" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0"
        >
          <SkeletonBlock className="h-8 w-8 shrink-0 !rounded-full" />
          <SkeletonLine className="w-[26%]" />
          <SkeletonLine className="hidden w-[14%] sm:block" />
          <SkeletonLine className="hidden w-[14%] md:block" />
          <SkeletonLine className="ml-auto w-[12%]" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonPanels({ count = 2 }: { count?: number }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className="h-[300px]" />
      ))}
    </div>
  )
}
