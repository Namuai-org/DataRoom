import {
  SkeletonBlock,
  SkeletonHeader,
  SkeletonPanels,
  SkeletonStatRow,
} from '@/components/admin/Skeletons'

export default function OverviewLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonStatRow count={8} />
      <SkeletonBlock className="mt-5 h-[380px]" />
      <div className="mt-5">
        <SkeletonPanels />
      </div>
    </>
  )
}
