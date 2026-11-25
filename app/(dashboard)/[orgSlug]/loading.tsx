// Shown inside the workspace shell while a page's server data loads, so the sidebar and header stay put.
import { Skeleton } from '@/components/ui/skeleton'

export default function WorkspaceLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <span role="status" className="sr-only">Loading…</span>
      <div className="px-4 pb-1 pt-4 md:px-6 md:pt-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}
