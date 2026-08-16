import { SkeletonBlock, SkeletonHeader } from '@/components/admin/Skeletons'

export default function ActivityLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-[46px]" />
          <SkeletonBlock className="h-[560px]" />
        </div>
        <SkeletonBlock className="h-[420px]" />
      </div>
    </>
  )
}
