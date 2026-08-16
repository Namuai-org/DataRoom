import { SkeletonBlock, SkeletonHeader, SkeletonTable } from '@/components/admin/Skeletons'

export default function VisitorsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="mb-4 h-[46px]" />
      <SkeletonTable rows={8} />
    </>
  )
}
