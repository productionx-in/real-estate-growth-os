'use client'
// components/matching/LeadMatches.tsx — what the buyer wants, and the available units that fit it best.
// Editing requirements goes through PUT /api/leads/[leadId]/requirements (managers or the lead's salesperson).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, SlidersHorizontal } from 'lucide-react'
import { Alert, Badge, Button, Field, Input } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { CATEGORIES, CONFIGURATIONS, FACINGS, shortInr, type Requirements } from '@/lib/matching/score'
import { PROPERTY_TYPES } from '@/lib/listings/listing'
import { cn } from '@/lib/utils/cn'

export interface MatchRow {
  unitId: string
  label: string
  projectName: string
  price: number | null
  match: { score: number; reasons: string[]; gaps: string[] }
}

function Chips<T extends string>({ options, labels, value, onChange, label }: {
  options: readonly T[]; labels?: Record<string, string>; value: string[]; onChange: (v: string[]) => void; label: string
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={cn('rounded-full border px-2.5 py-1 text-[12px]', on ? 'border-brand bg-brand-light text-brand' : 'border-default text-foreground hover:bg-surface-hover')}>
              {labels?.[o] ?? o}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(/,/g, ''))) || null)

export function LeadMatches({ leadId, requirements, matches, canWork, showMatches, locations = [], agency = false }: {
  leadId: string
  /** An agency: also ask buy or rent, the most rent, and property types (resale and rental listings). */
  agency?: boolean
  /** The workspace's locations (Settings → Locations), offered as one-tap choices. */
  locations?: string[]
  requirements: Requirements
  matches: MatchRow[]
  canWork: boolean
  /** Inventory module on. */
  showMatches: boolean
}) {
  const router = useRouter()
  const r = requirements
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    budget_min: r.budget_min?.toString() ?? '', budget_max: r.budget_max?.toString() ?? '',
    req_configurations: r.req_configurations, req_categories: r.req_categories, req_facing: r.req_facing,
    req_locations: r.req_locations.join(', '),
    req_min_area: r.req_min_area?.toString() ?? '', req_max_area: r.req_max_area?.toString() ?? '',
    req_purpose: (r.req_purpose ?? '') as '' | 'buy' | 'rent', req_rent_max: r.req_rent_max?.toString() ?? '',
    req_property_types: r.req_property_types ?? [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/requirements`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget_min: num(form.budget_min), budget_max: num(form.budget_max),
          req_configurations: form.req_configurations, req_categories: form.req_categories, req_facing: form.req_facing,
          req_locations: form.req_locations.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 10),
          req_min_area: num(form.req_min_area), req_max_area: num(form.req_max_area),
          ...(agency ? { req_purpose: form.req_purpose || null, req_rent_max: num(form.req_rent_max), req_property_types: form.req_property_types } : {}),
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setOpen(false)
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  const wants = [
    agency && r.req_purpose ? (r.req_purpose === 'rent' ? `To rent${r.req_rent_max ? ` up to ₹${r.req_rent_max.toLocaleString('en-IN')}/month` : ''}` : 'To buy') : null,
    agency && r.req_property_types?.length ? r.req_property_types.map((t) => PROPERTY_TYPES[t as keyof typeof PROPERTY_TYPES] ?? t).join(', ') : null,
    r.budget_min || r.budget_max ? `${r.budget_min ? shortInr(r.budget_min) : 'up'} – ${r.budget_max ? shortInr(r.budget_max) : 'any'}` : null,
    r.req_configurations.join(', ') || null,
    r.req_categories.map((c) => CATEGORIES[c as keyof typeof CATEGORIES] ?? c).join(', ') || null,
    r.req_locations.join(', ') || null,
    r.req_min_area || r.req_max_area ? `${r.req_min_area ?? 0}–${r.req_max_area ?? '…'} sq ft` : null,
    r.req_facing.length ? `${r.req_facing.join(' / ')} facing` : null,
  ].filter(Boolean)

  return (
    <section className="rounded-lg border border-default bg-surface p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><Home aria-hidden className="size-4 text-brand" /> Looking for</h2>
        {canWork && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null) }}>
            <DialogTrigger asChild><Button size="sm" variant="ghost"><SlidersHorizontal aria-hidden /> Edit</Button></DialogTrigger>
            <DialogContent title="What is the buyer looking for?" description="Used to suggest matching units. Everything is optional." className="max-w-xl">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Budget from (₹)"><Input inputMode="numeric" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} placeholder="8000000" /></Field>
                  <Field label="Budget up to (₹)"><Input inputMode="numeric" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} placeholder="12000000" /></Field>
                </div>
                {agency && (
                  <>
                    <Chips label="Buy or rent" options={['buy', 'rent'] as const} labels={{ buy: 'Buy', rent: 'Rent' }} value={form.req_purpose ? [form.req_purpose] : []}
                      onChange={(v) => setForm({ ...form, req_purpose: (v.find((x) => x !== form.req_purpose) ?? '') as '' | 'buy' | 'rent' })} />
                    {form.req_purpose === 'rent' && (
                      <Field label="Rent up to (₹ a month)"><Input inputMode="numeric" value={form.req_rent_max} onChange={(e) => setForm({ ...form, req_rent_max: e.target.value })} placeholder="35000" /></Field>
                    )}
                    <Chips label="Property type (incl. commercial)" options={Object.keys(PROPERTY_TYPES) as (keyof typeof PROPERTY_TYPES)[]} labels={PROPERTY_TYPES}
                      value={form.req_property_types} onChange={(v) => setForm({ ...form, req_property_types: v })} />
                  </>
                )}
                <Chips label="Configuration" options={CONFIGURATIONS} value={form.req_configurations} onChange={(v) => setForm({ ...form, req_configurations: v })} />
                <Chips label="Property type" options={Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]} labels={CATEGORIES} value={form.req_categories} onChange={(v) => setForm({ ...form, req_categories: v })} />
                <Field label="Areas or cities" hint="Separate with commas, e.g. Whitefield, Sarjapur Road">
                  <Input value={form.req_locations} onChange={(e) => setForm({ ...form, req_locations: e.target.value })} />
                </Field>
                {locations.length > 0 && (() => {
                  const picked = form.req_locations.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
                  const has = (l: string) => picked.some((x) => x.toLowerCase() === l.toLowerCase())
                  const toggle = (l: string) => setForm({ ...form, req_locations: (has(l) ? picked.filter((x) => x.toLowerCase() !== l.toLowerCase()) : [...picked, l]).join(', ') })
                  return (
                    <div className="-mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Your locations">
                      {locations.slice(0, 40).map((l) => (
                        <button key={l} type="button" aria-pressed={has(l)} onClick={() => toggle(l)}
                          className={`min-h-8 rounded-full border px-2.5 text-[12px] ${has(l) ? 'border-brand bg-brand-light text-brand' : 'border-default text-foreground hover:bg-surface-hover'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Area from (sq ft)"><Input inputMode="numeric" value={form.req_min_area} onChange={(e) => setForm({ ...form, req_min_area: e.target.value })} /></Field>
                  <Field label="Area up to (sq ft)"><Input inputMode="numeric" value={form.req_max_area} onChange={(e) => setForm({ ...form, req_max_area: e.target.value })} /></Field>
                </div>
                <Chips label="Facing" options={FACINGS} value={form.req_facing} onChange={(v) => setForm({ ...form, req_facing: v })} />
                {error && <Alert tone="danger">{error}</Alert>}
                <DialogFooter>
                  <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                  <Button onClick={save} loading={busy}>Save</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <p className="text-[12px] text-muted">{wants.length ? wants.join(' · ') : 'Not recorded yet.'}</p>

      {showMatches && (
        <div className="mt-4">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">Matching units</h3>
          {matches.length === 0 ? (
            <p className="text-[12px] text-muted">
              {wants.length ? 'No available unit fits yet.' : 'Add what the buyer is looking for to see matching units.'}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {matches.map((m) => (
                <li key={m.unitId} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground">{m.projectName} · {m.label}</span>
                    <Badge tone={m.match.score >= 75 ? 'success' : m.match.score >= 50 ? 'warning' : 'neutral'} aria-label={`Match ${m.match.score} out of 100`}>
                      {m.match.score}%
                    </Badge>
                  </div>
                  <p className="text-[12px] text-muted">
                    {m.price != null ? shortInr(m.price) : 'Price on request'}
                    {m.match.reasons.length > 0 && <> · <span className="text-success">{m.match.reasons.join(', ')}</span></>}
                    {m.match.gaps.length > 0 && <> · <span className="text-warning">{m.match.gaps.join(', ')}</span></>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
