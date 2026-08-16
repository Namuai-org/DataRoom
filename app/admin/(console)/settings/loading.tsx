import { SkeletonBlock, SkeletonHeader } from '@/components/admin/Skeletons'

export default function SettingsLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <SkeletonBlock className="h-[260px]" />
          <SkeletonBlock className="h-[520px]" />
        </div>
        <div className="flex flex-col gap-5">
          <SkeletonBlock className="h-[300px]" />
          <SkeletonBlock className="h-[180px]" />
        </div>
      </div>
    </>
  )
}
