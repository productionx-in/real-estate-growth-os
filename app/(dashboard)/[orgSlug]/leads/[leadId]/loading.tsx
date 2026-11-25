// A lead's shape while it loads: header, the work panel (first on phones), details and history.
import { Skeleton } from '@/components/ui/skeleton'

export default function LeadLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <span role="status" className="sr-only">Loading lead…</span>
      <div className="px-4 pb-1 pt-4 md:px-6 md:pt-6">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-3 h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 p-4 md:p-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
        <div className="order-first space-y-5 lg:order-none">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
