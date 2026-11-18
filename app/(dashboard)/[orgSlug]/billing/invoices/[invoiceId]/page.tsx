// app/(dashboard)/[orgSlug]/billing/invoices/[invoiceId]/page.tsx — one invoice, printable. Owners and admins
// of the invoice's organisation only. It is a pro-forma (unpaid) or a payment receipt (paid); a GST tax
// invoice needs both parties' GSTINs, which this page does not have yet, and it says so.
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { PrintButton } from '@/components/documents/PrintButton'
import { Badge } from '@/components/ui'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { billingRoleFor } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { INVOICE_TYPE_LABEL, rupees } from '@/lib/billing/plans'
import { PRODUCT_NAME } from '@/lib/brand'

export const metadata: Metadata = { title: 'Invoice' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '—')

export default async function InvoicePage({ params }: { params: Promise<{ orgSlug: string; invoiceId: string }> }) {
  const { orgSlug, invoiceId } = await params
  const { org, profile } = await getVerifiedWorkspace(orgSlug)
  // Owners/admins; also while the workspace is on a billing hold (their real role is kept aside), so they can pay.
  if (!(await billingRoleFor(org.id, profile.id))) redirect(`/${orgSlug}`)
  if (!UUID.test(invoiceId)) notFound()
  const { data: inv } = await createServiceClient().from('org_subscription_invoices')
    .select('invoice_number, invoice_type, status, currency, subtotal_cents, tax_cents, amount_cents, seat_quantity, unit_price_cents, billing_cycle, created_at, due_date, paid_at, payment_reference')
    .eq('org_id', org.id).eq('id', invoiceId).maybeSingle()
  if (!inv || inv.status === 'void') notFound()
  const paid = inv.status === 'paid'
  const subtotal = Number(inv.subtotal_cents ?? inv.amount_cents)
  const tax = Number(inv.tax_cents ?? 0)
  const what = `${INVOICE_TYPE_LABEL[inv.invoice_type] ?? inv.invoice_type}${inv.seat_quantity ? ` — ${inv.seat_quantity} extra seat${inv.seat_quantity > 1 ? 's' : ''}` : ''}${inv.billing_cycle ? ` (${inv.billing_cycle})` : ''}`

  return (
    <PageShell back={{ href: `/${orgSlug}/billing`, label: 'Billing' }} title={inv.invoice_number} actions={<PrintButton />}>
      <article className="mx-auto max-w-2xl rounded-xl border border-default bg-surface p-6 print:border-0 print:p-0 md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-default pb-5">
          <div>
            <p className="text-[18px] font-semibold">{PRODUCT_NAME}</p>
            <p className="text-[12px] text-muted">INFYN Group</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-semibold">{paid ? 'Payment receipt' : 'Pro-forma invoice'}</p>
            <p className="text-[12px] text-muted">{inv.invoice_number}</p>
            <Badge tone={paid ? 'success' : 'warning'} className="mt-1">{paid ? `Paid ${date(inv.paid_at)}` : `Due ${date(inv.due_date)}`}</Badge>
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-4 py-5 text-[13px]">
          <div><dt className="text-muted">Billed to</dt><dd className="font-medium">{org.name}</dd></div>
          <div className="text-right"><dt className="text-muted">Issued</dt><dd className="font-medium">{date(inv.created_at)}</dd></div>
        </dl>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-default text-left text-muted"><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody className="tabular">
            <tr className="border-b border-default"><td className="py-3">{what}</td><td className="py-3 text-right">{rupees(subtotal)}</td></tr>
            <tr><td className="pt-3 text-muted">Subtotal</td><td className="pt-3 text-right">{rupees(subtotal)}</td></tr>
            <tr><td className="py-1 text-muted">GST (18%)</td><td className="py-1 text-right">{rupees(tax)}</td></tr>
            <tr className="text-[15px] font-semibold"><td className="pt-2">Total ({inv.currency})</td><td className="pt-2 text-right">{rupees(Number(inv.amount_cents))}</td></tr>
          </tbody>
        </table>
        {paid && inv.payment_reference && <p className="mt-5 text-[12px] text-muted">Payment reference: {inv.payment_reference}</p>}
        <p className="mt-6 border-t border-default pt-4 text-[12px] text-subtle">
          This is not a GST tax invoice. For a tax invoice showing your GSTIN, contact us with your registered business details.
        </p>
      </article>
    </PageShell>
  )
}
