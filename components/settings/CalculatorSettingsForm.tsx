'use client'
// components/settings/CalculatorSettingsForm.tsx — Settings → Calculators (owners and admins).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { CALC_LIMITS, type CalculatorSettings } from '@/lib/calculators/settings'

const NUMBERS: { key: keyof Omit<CalculatorSettings, 'charges'>; label: string; hint: string; step: string }[] = [
  { key: 'loanRatePct', label: 'Home-loan interest rate (% a year)', hint: 'A typical rate from the banks you work with.', step: '0.05' },
  { key: 'tenureYears', label: 'Loan tenure (years)', hint: '1–35.', step: '1' },
  { key: 'downPaymentPct', label: 'Down payment (%)', hint: 'Usually 10–25%.', step: '1' },
  { key: 'foirPct', label: 'Share of income for EMIs (%)', hint: 'What banks allow for all EMIs together; often 40–60%.', step: '1' },
  { key: 'gstPct', label: 'GST (%)', hint: '5% under construction; 1% affordable housing; 0% ready to move.', step: '0.5' },
  { key: 'stampDutyPct', label: 'Stamp duty (%)', hint: 'Depends on your state.', step: '0.5' },
  { key: 'registrationPct', label: 'Registration (%)', hint: 'Depends on your state.', step: '0.5' },
]

export function CalculatorSettingsForm({ orgId, initial }: { orgId: string; initial: CalculatorSettings }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function save() {
    setBusy(true); setMessage(null)
    const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section: 'calculators', value }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMessage({ tone: 'danger', text: body.error || 'Could not save.' }); return }
    setValue(body.value); setMessage({ tone: 'success', text: 'Saved. Calculators start from these values now.' }); router.refresh()
  }

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMBERS.map((n) => (
          <Field key={n.key} label={n.label} hint={n.hint}>
            <Input type="number" inputMode="decimal" step={n.step} min={0} value={value[n.key]} onChange={(e) => setValue({ ...value, [n.key]: e.target.value === '' ? '' : Number(e.target.value) } as CalculatorSettings)} />
          </Field>
        ))}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold text-foreground">Extra charges on the cost sheet</legend>
        <p className="text-[12px] text-muted">Car parking, club membership, floor rise, PLC, maintenance deposit… A fixed amount, or an amount per sq ft.</p>
        {value.charges.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_8rem_auto] items-center gap-2">
            <Input value={c.label} maxLength={CALC_LIMITS.label} aria-label="Charge name" onChange={(e) => setValue({ ...value, charges: value.charges.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
            <Select aria-label="How it is charged" value={c.kind} onChange={(e) => setValue({ ...value, charges: value.charges.map((x, k) => (k === i ? { ...x, kind: e.target.value as 'fixed' | 'per_area' } : x)) })}>
              <option value="fixed">Fixed ₹</option><option value="per_area">₹ per sq ft</option>
            </Select>
            <Input type="number" inputMode="decimal" min={0} aria-label={`${c.label} amount`} value={c.amount} onChange={(e) => setValue({ ...value, charges: value.charges.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) || 0 } : x)) })} />
            <button type="button" aria-label={`Remove ${c.label}`} onClick={() => setValue({ ...value, charges: value.charges.filter((_, k) => k !== i) })} className="grid size-9 place-items-center rounded-full text-muted hover:text-danger"><X className="size-4" /></button>
          </div>
        ))}
        {value.charges.length < CALC_LIMITS.charges && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setValue({ ...value, charges: [...value.charges, { label: 'New charge', kind: 'fixed', amount: 0 }] })}><Plus className="size-4" aria-hidden="true" /> Add a charge</Button>
        )}
      </fieldset>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save calculator settings</Button>
    </form>
  )
}
