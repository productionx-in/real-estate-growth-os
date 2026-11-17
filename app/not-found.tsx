// app/not-found.tsx — any unknown URL.
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PRODUCT_NAME } from '@/lib/brand'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-[13px] font-semibold text-brand">404</p>
        <h1 className="mt-2 text-[22px] font-semibold text-foreground">This page doesn’t exist</h1>
        <p className="mt-2 text-[14px] text-muted">
          The link may be old or mistyped, or the page may have moved. Nothing has been lost.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/select-org" className={buttonVariants()}>Go to my workspace</Link>
          <Link href="/" className={buttonVariants({ variant: 'secondary' })}>{PRODUCT_NAME} home</Link>
        </div>
      </div>
    </main>
  )
}
