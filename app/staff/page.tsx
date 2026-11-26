// app/staff/page.tsx — the RE team sign-in (re.productionx.in/staff). Unlisted: never linked from the public site.
// Signing in here grants nothing by itself: the console checks the platform role and an authenticator code.
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StaffSignIn } from '@/components/staff/StaffSignIn'

export const metadata: Metadata = { title: 'Team sign-in', robots: { index: false, follow: false } }

export default function StaffPage() {
  return <Suspense fallback={null}><StaffSignIn /></Suspense>
}
