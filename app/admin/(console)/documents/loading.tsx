import { SkeletonBlock, SkeletonHeader, SkeletonTable } from '@/components/admin/Skeletons'

export default function DocumentsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="h-[140px]" />
      <SkeletonBlock className="mt-5 h-[240px]" />
      <div className="mt-10">
        <SkeletonTable rows={5} />
      </div>
    </>
  )
}
