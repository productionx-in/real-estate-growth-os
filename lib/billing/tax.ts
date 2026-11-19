// lib/billing/tax.ts — the tax lines printed on an invoice, from the values copied onto the invoice when it was
// issued (migration 20260062). Nothing is assumed: no rate, GSTIN or SAC code is printed unless it was recorded, and
// the document is a GST tax invoice only when every particular the law asks for is present.
export interface InvoiceTaxFields {
  tax_cents: number | string | null
  gst_rate_bps: number | null
  cgst_cents: number | string | null
  sgst_cents: number | string | null
  igst_cents: number | string | null
  supplier_gstin: string | null
  supplier_legal_name: string | null
  supplier_state_code: string | null
  sac_code: string | null
  customer_gstin: string | null
  customer_legal_name: string | null
  place_of_supply: string | null
}

export interface TaxLine { label: string; cents: number }

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

export function invoiceTaxLines(inv: InvoiceTaxFields): TaxLine[] {
  const tax = Number(inv.tax_cents ?? 0)
  const rate = inv.gst_rate_bps
  const c = Number(inv.cgst_cents ?? 0), s = Number(inv.sgst_cents ?? 0), i = Number(inv.igst_cents ?? 0)
  if (tax > 0 && i === tax) return [{ label: rate ? `IGST (${pct(rate)})` : 'IGST', cents: i }]
  if (tax > 0 && c + s === tax && c > 0) {
    const half = rate ? ` (${pct(rate / 2)})` : ''
    return [{ label: `CGST${half}`, cents: c }, { label: `SGST${half}`, cents: s }]
  }
  return [{ label: rate ? `GST (${pct(rate)})` : 'GST', cents: tax }]
}

/** A tax invoice needs the supplier's legal name, GSTIN and SAC code, the place of supply and the tax split. */
export function isTaxInvoice(inv: InvoiceTaxFields): boolean {
  const split = Number(inv.igst_cents ?? 0) > 0 || Number(inv.cgst_cents ?? 0) > 0
  return Boolean(inv.supplier_gstin && inv.supplier_legal_name && inv.sac_code && inv.place_of_supply && inv.gst_rate_bps && split)
}
