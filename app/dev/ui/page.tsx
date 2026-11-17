// app/dev/ui/page.tsx — design-system gallery. Exists on local dev and Vercel preview builds only; production 404s.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Gallery } from './Gallery'

export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } }
// Decided per request: the environment, not the build, says whether this is production.
export const dynamic = 'force-dynamic'

export default function DesignSystemPage() {
  const isProduction = process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV)
  if (isProduction) notFound()
  return <Gallery />
}
