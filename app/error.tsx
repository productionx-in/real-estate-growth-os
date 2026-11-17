'use client'
// app/error.tsx — an unexpected error while rendering a page. Details stay in the server logs; the person sees
// what to do next and a reference they can quote to support.
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-bg">
          <AlertTriangle aria-hidden className="size-6 text-danger" />
        </div>
        <h1 className="text-[18px] font-semibold text-foreground">Something went wrong on this page</h1>
        <p className="mt-2 text-[14px] text-muted">
          Your data is safe. Try again — if it keeps happening, contact support and quote the reference below.
        </p>
        {error.digest && (
          <p className="mt-3 text-[12px] text-subtle">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/select-org" className={buttonVariants({ variant: 'secondary' })}>Go to my workspace</Link>
        </div>
      </div>
    </main>
  )
}
