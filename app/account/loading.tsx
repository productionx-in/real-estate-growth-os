// Account pages (security, notifications): a light skeleton instead of the full-screen building loader.
import { Skeleton } from '@/components/ui/skeleton'

export default function AccountLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8" aria-busy="true">
      <span role="status" className="sr-only">Loading…</span>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-72 max-w-full" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )
}
