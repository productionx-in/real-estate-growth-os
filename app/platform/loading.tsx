// Shown inside the console shell while a console page's data loads, so the rail and header stay put on every click
// (without it the root loader replaced the whole console).
import { Skeleton } from '@/components/ui/skeleton'

export default function ConsoleLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">Loading…</span>
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}
