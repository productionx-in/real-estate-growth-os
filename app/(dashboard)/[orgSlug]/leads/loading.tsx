// The lead list's shape while it loads: filter bar, then rows (not a generic block), so nothing jumps.
import { Skeleton } from '@/components/ui/skeleton'

export default function LeadsLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <span role="status" className="sr-only">Loading leads…</span>
      <div className="border-b border-default bg-surface px-4 py-5 md:px-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      </div>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md sm:max-w-xs" />
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="hidden h-9 w-24 rounded-md sm:block" />)}
        </div>
        <div className="overflow-hidden rounded-xl border border-default bg-surface">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-default px-4 py-3.5 last:border-0">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
              <Skeleton className="hidden h-3 w-16 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
