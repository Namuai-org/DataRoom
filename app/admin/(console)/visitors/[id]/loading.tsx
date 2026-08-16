import { SkeletonBlock, SkeletonHeader, SkeletonStatRow } from '@/components/admin/Skeletons'

export default function VisitorDetailLoading() {
  return (
    <>
      <SkeletonBlock className="mb-6 h-8 w-28" />
      <SkeletonHeader />
      <SkeletonStatRow count={5} />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SkeletonBlock className="h-[320px]" />
        <SkeletonBlock className="h-[320px]" />
      </div>
      <SkeletonBlock className="mt-10 h-[260px]" />
    </>
  )
}
