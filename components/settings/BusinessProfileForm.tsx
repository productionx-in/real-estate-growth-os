'use client'
// components/settings/BusinessProfileForm.tsx — the company's details for documents: letterhead, signatory and the
// bank account buyers pay into. Owners and admins (the server checks: app/api/settings/business-profile).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { DocumentBody } from '@/components/documents/DocumentBody'
import { buildLetterhead, normaliseProfile, type BusinessProfile } from '@/lib/documents/letterhead'

type Key = keyof BusinessProfile
const SECTIONS: { title: string; hint: string; fields: { key: Key; label: string; placeholder?: string; wide?: boolean; long?: boolean; inputMode?: 'tel' | 'email' | 'url' }[] }[] = [
  { title: 'Company', hint: 'Printed at the top of every document.', fields: [
    { key: 'legalName', label: 'Registered company name', placeholder: 'e.g. Skyline Developers Private Limited', wide: true },
    { key: 'address', label: 'Address', placeholder: 'Building, street, area', wide: true },
    { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'pincode', label: 'PIN code', placeholder: '560001' },
    { key: 'phone', label: 'Phone', inputMode: 'tel' }, { key: 'email', label: 'E-mail', inputMode: 'email' },
    { key: 'website', label: 'Website', placeholder: 'https://', inputMode: 'url' },
    { key: 'logoUrl', label: 'Logo link', placeholder: 'https://… (PNG or SVG)', inputMode: 'url', wide: true },
  ] },
  { title: 'Registrations', hint: 'Shown on the letterhead; required on most sale documents.', fields: [
    { key: 'gstin', label: 'GSTIN', placeholder: '29ABCDE1234F1Z5' }, { key: 'pan', label: 'PAN', placeholder: 'ABCDE1234F' },
    { key: 'reraNumber', label: 'RERA registration (promoter or agent)', wide: true },
  ] },
  { title: 'Signature', hint: 'Who signs letters such as allotments and payment demands.', fields: [
    { key: 'signatoryName', label: 'Authorised signatory' }, { key: 'signatoryTitle', label: 'Title', placeholder: 'Director' },
  ] },
  { title: 'Bank account for buyer payments', hint: 'Printed on payment demands. Use the project’s collection (RERA) account where required.', fields: [
    { key: 'bankAccountName', label: 'Account name', wide: true }, { key: 'bankName', label: 'Bank and branch' },
    { key: 'bankAccountNumber', label: 'Account number' }, { key: 'bankIfsc', label: 'IFSC', placeholder: 'HDFC0001234' },
  ] },
  { title: 'Footer', hint: 'Small print at the bottom, e.g. registered office and CIN.', fields: [
    { key: 'footerNote', label: 'Footer note', wide: true, long: true },
  ] },
]

export function BusinessProfileForm({ orgId, orgName, initial }: { orgId: string; orgName: string; initial: BusinessProfile }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])) as Record<Key, string>)
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const preview = buildLetterhead(orgName, normaliseProfile(values).profile)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const check = normaliseProfile(values)
    setErrors(check.errors); setMessage(null)
    if (Object.keys(check.errors).length) { setMessage({ tone: 'danger', text: 'Some details need fixing.' }); return }
    setBusy(true)
    try {
      const res = await fetch('/api/settings/business-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, profile: values }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setErrors(out.fields ?? {}); setMessage({ tone: 'danger', text: out.error ?? 'Could not save.' }); return }
      setMessage({ tone: 'success', text: 'Saved. New documents use these details; documents already shared keep the details they were sent with.' })
      router.refresh()
    } catch { setMessage({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_20rem]" noValidate>
      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <fieldset key={s.title} className="space-y-3">
            <legend className="text-[13px] font-semibold text-foreground">{s.title}</legend>
            <p className="-mt-2 text-[12px] text-muted">{s.hint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.fields.map((f) => (
                <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
                  <Field label={f.label} error={errors[f.key]}>
                    {f.long
                      ? <Textarea rows={2} value={values[f.key]} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                      : <Input value={values[f.key]} placeholder={f.placeholder} inputMode={f.inputMode} autoComplete="off"
                          onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}
                  </Field>
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" loading={busy}>Save business details</Button>
      </div>
      <aside aria-label="Letterhead preview" className="h-fit rounded-lg border border-default bg-surface p-4 shadow-2xs lg:sticky lg:top-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">Letterhead preview</p>
        <DocumentBody body={'Dear Priya Sharma,\n\nThank you for visiting our project…'} letterhead={preview} />
      </aside>
    </form>
  )
}
