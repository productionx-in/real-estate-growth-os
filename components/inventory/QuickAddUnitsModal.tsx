'use client'
// components/inventory/QuickAddUnitsModal.tsx — "Add many units": create a run of units (Plot 1–120, or Tower A floors
// 1–12 × 4 flats) with the same details in one go. Rows are checked exactly like a spreadsheet import
// (lib/import/validator.ts) and saved through the same route (/api/inventory/import), which authorises again.
import { useMemo, useState } from 'react'
import { Layers, X } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { validateImportRows, type ValidationSummary } from '@/lib/import/validator'
import { MAX_QUICK_ADD, buildRows, defaultSpec, generateUnits, previewNumbers, type NumberingSpec, type SharedDetails } from '@/lib/inventory/quick-add'
import type { ProjectCategory } from '@/types/database'
import { ModalShell } from '@/components/ui/modal-shell'

const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West']
const UNITS = [['sqft', 'sq ft'], ['sqyd', 'sq yd'], ['acres', 'acres'], ['guntas', 'guntas'], ['cents', 'cents']] as const
const KIND: Record<string, { one: string; many: string }> = {
  apartments: { one: 'flat', many: 'flats' }, plotted_developments: { one: 'plot', many: 'plots' },
  villas_gated_communities: { one: 'villa', many: 'villas' }, commercial_sale: { one: 'unit', many: 'units' }, mixed_use: { one: 'unit', many: 'units' },
}
const IDENTITY = new Proxy({}, { get: (_, k) => k }) as Record<string, string>

export function QuickAddUnitsModal({ projectId, projectCategory, onClose, onSuccess }: {
  projectId: string; projectCategory: ProjectCategory; onClose: () => void; onSuccess: () => void
}) {
  const [spec, setSpec] = useState<NumberingSpec>(() => defaultSpec(projectCategory))
  const [shared, setShared] = useState<SharedDetails>(() => ({
    area_unit: projectCategory === 'plotted_developments' ? 'sqyd' : 'sqft',
    ...(projectCategory === 'mixed_use' ? { category: 'apartments' } : {}),
  }))
  const [check, setCheck] = useState<ValidationSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const kind = KIND[projectCategory] ?? KIND.mixed_use
  const effectiveCategory = (projectCategory === 'mixed_use' ? shared.category : projectCategory) as ProjectCategory
  const generated = useMemo(() => generateUnits(spec), [spec])
  const set = (k: keyof SharedDetails, v: string) => { setShared((s) => ({ ...s, [k]: v })); setCheck(null) }
  const setS = (patch: Partial<NumberingSpec>) => { setSpec((s) => ({ ...s, ...patch } as NumberingSpec)); setCheck(null) }
  const num = (v: string) => (v === '' ? NaN : Number(v))

  async function runCheck(): Promise<ValidationSummary | null> {
    if (generated.error || !generated.units.length) { setError(generated.error ?? 'Nothing to add.'); return null }
    if (!shared.area_value) { setError('Enter the area each unit has (you can change single units later).'); return null }
    setError(null)
    const res = await fetch(`/api/inventory?projectId=${projectId}`)
    const json = await res.json().catch(() => ({}))
    const existing = new Set<string>(((json.items ?? []) as { unit_number: string }[]).map((i) => i.unit_number.toLowerCase()))
    const result = validateImportRows({ rawRows: buildRows(generated.units, shared), columnMapping: IDENTITY, projectCategory, projectId, existingUnitNumbers: existing })
    setCheck(result)
    return result
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const result = check ?? await runCheck()
      if (!result) return
      const valid = result.rows.filter((r) => r.isValid).map((r) => r.data)
      if (!valid.length) { setError('None of these can be added — see the list below.'); return }
      const failedRows = result.rows.filter((r) => !r.isValid).map((r) => ({ row: r.rowNumber, unit: r.data.unit_number || '—', error: r.errors.map((e) => e.message).join('; ') }))
      const res = await fetch('/api/inventory/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileName: `Added ${previewNumbers(generated.units, 1)}`.slice(0, 255), fileType: 'generated', rows: valid, failedRows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Could not add the units.'); return }
      setDone(`Added ${data.successfulCount} ${data.successfulCount === 1 ? kind.one : kind.many}${data.failedCount ? `; ${data.failedCount} skipped` : ''}.`)
      onSuccess()
    } catch {
      setError('Could not reach RE by PX. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  const invalid = check?.rows.filter((r) => !r.isValid) ?? []
  const ready = check ? check.validRowsCount : generated.units.length

  return (
    <ModalShell onClose={onClose} label="Quick add units" size="lg" className="overflow-y-auto">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-default bg-surface px-5 py-4">
          <div>
            <h2 id="quick-add-title" className="flex items-center gap-2 text-[16px] font-semibold"><Layers aria-hidden className="size-4 text-brand" /> Add many {kind.many}</h2>
            <p className="text-[13px] text-muted">Number them, give the details they share, and add them all at once. You can edit any single {kind.one} afterwards.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-surface-hover"><X className="size-4" aria-hidden /></button>
        </div>

        {done ? (
          <div className="space-y-4 p-5">
            <Alert tone="success" title={done}>They are in the list now, all Available.</Alert>
            <div className="flex gap-2">
              <Button onClick={() => { setDone(null); setCheck(null) }} variant="secondary">Add more</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <fieldset className="space-y-3">
              <legend className="text-[13px] font-semibold">1. Numbering</legend>
              {(projectCategory === 'apartments' || projectCategory === 'commercial_sale' || projectCategory === 'mixed_use') && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="How are they numbered">
                  {[['floors', 'By tower and floor (A-101)'], ['range', 'A simple range (Shop 1–20)']].map(([m, label]) => (
                    <button key={m} type="button" aria-pressed={spec.mode === m}
                      onClick={() => { setSpec(m === 'floors' ? { mode: 'floors', tower: 'A', floorFrom: 1, floorTo: 10, perFloor: 4, separator: '-' } : { mode: 'range', prefix: projectCategory === 'apartments' ? 'Flat ' : 'Shop ', start: 1, end: 20, pad: false }); setCheck(null) }}
                      className={`min-h-10 rounded-lg border px-3 text-[13px] ${spec.mode === m ? 'border-brand bg-brand-light text-brand' : 'border-default text-muted hover:bg-surface-hover'}`}>{label}</button>
                  ))}
                </div>
              )}
              {spec.mode === 'range' ? (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Starts with" hint="e.g. “Plot ”, “A-”"><Input value={spec.prefix} maxLength={20} onChange={(e) => setS({ prefix: e.target.value })} /></Field>
                  <Field label="From"><Input type="number" inputMode="numeric" min={0} value={Number.isNaN(spec.start) ? '' : spec.start} onChange={(e) => setS({ start: num(e.target.value) })} /></Field>
                  <Field label="To"><Input type="number" inputMode="numeric" min={0} value={Number.isNaN(spec.end) ? '' : spec.end} onChange={(e) => setS({ end: num(e.target.value) })} /></Field>
                  <label className="col-span-3 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" className="size-4" checked={spec.pad} onChange={(e) => setS({ pad: e.target.checked })} /> Same number of digits ({spec.prefix}001 instead of {spec.prefix}1)
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Tower / block"><Input value={spec.tower} maxLength={12} onChange={(e) => setS({ tower: e.target.value })} /></Field>
                  <Field label="From floor" hint="0 = ground"><Input type="number" inputMode="numeric" min={0} value={Number.isNaN(spec.floorFrom) ? '' : spec.floorFrom} onChange={(e) => setS({ floorFrom: num(e.target.value) })} /></Field>
                  <Field label="To floor"><Input type="number" inputMode="numeric" min={0} value={Number.isNaN(spec.floorTo) ? '' : spec.floorTo} onChange={(e) => setS({ floorTo: num(e.target.value) })} /></Field>
                  <Field label="Per floor"><Input type="number" inputMode="numeric" min={1} max={99} value={Number.isNaN(spec.perFloor) ? '' : spec.perFloor} onChange={(e) => setS({ perFloor: num(e.target.value) })} /></Field>
                </div>
              )}
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-[13px]" aria-live="polite">
                {generated.error ? <span className="text-danger">{generated.error}</span>
                  : <><span className="font-semibold">{generated.units.length} {generated.units.length === 1 ? kind.one : kind.many}:</span> {previewNumbers(generated.units)}</>}
              </p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-[13px] font-semibold">2. What they have in common</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {projectCategory === 'mixed_use' && (
                  <Field label="Type" required>
                    <Select value={shared.category} onChange={(e) => set('category', e.target.value)}>
                      <option value="apartments">Apartments</option><option value="plotted_developments">Plots</option>
                      <option value="villas_gated_communities">Villas</option><option value="commercial_sale">Commercial</option>
                    </Select>
                  </Field>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Field label={effectiveCategory === 'plotted_developments' ? 'Plot area' : 'Saleable area'} required>
                    <Input type="number" inputMode="decimal" min={0} value={shared.area_value ?? ''} onChange={(e) => set('area_value', e.target.value)} placeholder={effectiveCategory === 'plotted_developments' ? '200' : '1200'} />
                  </Field>
                  <Field label="Unit">
                    <Select value={shared.area_unit} onChange={(e) => set('area_unit', e.target.value)}>
                      {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </Field>
                </div>
                {(effectiveCategory === 'apartments' || effectiveCategory === 'villas_gated_communities') && (
                  <Field label={effectiveCategory === 'apartments' ? 'BHK' : 'Typology'}>
                    <Input value={shared.bhk_config ?? ''} maxLength={40} onChange={(e) => set('bhk_config', e.target.value)} placeholder={effectiveCategory === 'apartments' ? '2 BHK' : '4 BHK Villa'} />
                  </Field>
                )}
                {effectiveCategory === 'plotted_developments' && (
                  <Field label="Plot size" hint="Length × breadth, e.g. 30x60"><Input value={shared.plot_dimensions ?? ''} maxLength={30} onChange={(e) => set('plot_dimensions', e.target.value)} /></Field>
                )}
                {effectiveCategory === 'commercial_sale' && (
                  <Field label="Type of unit">
                    <Select value={shared.commercial_asset_type ?? ''} onChange={(e) => set('commercial_asset_type', e.target.value)}>
                      <option value="">Not set</option>
                      {['Retail Shop', 'Office Suite', 'Showroom', 'Warehouse', 'Bare Shell', 'Other'].map((t) => <option key={t}>{t}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Facing">
                  <Select value={shared.facing ?? ''} onChange={(e) => set('facing', e.target.value)}>
                    <option value="">Not set (varies)</option>
                    {FACINGS.map((f) => <option key={f}>{f}</option>)}
                  </Select>
                </Field>
                <Field label="Price per unit (₹)" hint="Optional. Leave empty and set prices later.">
                  <Input type="number" inputMode="numeric" min={0} value={shared.total_price ?? ''} onChange={(e) => set('total_price', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            {check && invalid.length > 0 && (
              <Alert tone="warning" title={`${invalid.length} of ${check.totalRows} cannot be added`}>
                <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {invalid.slice(0, 20).map((r) => <li key={r.rowNumber}>{r.data.unit_number || '—'}: {r.errors[0]?.message}</li>)}
                  {invalid.length > 20 && <li>…and {invalid.length - 20} more</li>}
                </ul>
                {check.validRowsCount > 0 && <p className="mt-1">The other {check.validRowsCount} can be added.</p>}
              </Alert>
            )}
            {error && <Alert tone="danger">{error}</Alert>}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-default pt-4">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={create} disabled={busy || !!generated.error || !ready || generated.units.length > MAX_QUICK_ADD}>
                {busy ? 'Adding…' : `Add ${ready} ${ready === 1 ? kind.one : kind.many}`}
              </Button>
            </div>
          </div>
        )}
      </ModalShell>
  )
}
