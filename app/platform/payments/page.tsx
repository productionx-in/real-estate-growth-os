// app/platform/payments/page.tsx — gateway health, primary provider, refunds, unapplied money, disputes,
// reconciliation exceptions and verified outages. Finance admins and the Platform Owner act; auditors read.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { PAYMENT_STAFF, paymentsOverview } from '@/lib/payments/admin'
import { envResolver, type Db } from '@/lib/payments/registry'
import { PaymentsConsole } from '@/components/platform/PaymentsConsole'

export const metadata: Metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

export default async function PlatformPaymentsPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!(PAYMENT_STAFF as readonly string[]).includes(access.role)) notFound()
  const overview = await paymentsOverview(createServiceClient() as unknown as Db, envResolver().environment)
  return <PaymentsConsole overview={overview} role={access.role} userId={access.userId} />
}
