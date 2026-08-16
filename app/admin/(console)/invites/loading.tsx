import { SkeletonBlock, SkeletonHeader, SkeletonTable } from '@/components/admin/Skeletons'

export default function InvitesLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="h-[420px]" />
      <div className="mt-10">
        <SkeletonTable rows={5} />
      </div>
    </>
  )
}
