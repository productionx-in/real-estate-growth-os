'use client'
// components/listings/ListingsClient.tsx — an agency's resale and rental listings: add and edit, change status,
// and share with a buyer or tenant on WhatsApp using the agency's message (Settings → Listing share message).
// The owner's details appear only where the server sent them (managers, the listing's agent, whoever added it);
// they are never in a shared message. Every change is checked again by app/api/listings.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Mail, MessageCircle, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import {
  FIT_OUT, FURNISHING, LISTING_KINDS, LISTING_STATUSES, PROPERTY_TYPES, commercialLine, isCommercial, listingPrice, normaliseListing, shareText,
  type Listing, type ListingStatus, type PropertyType,
} from '@/lib/listings/listing'
import { OWNER_EMAILS, ownerEmailBlocker, type OwnerEmailKind } from '@/lib/listings/owner-email'

export interface ListingItem extends Listing { assigneeName: string | null; canEdit: boolean; ownerEmailed: { at: string; kind: string } | null }

type Draft = Record<string, string>
const toDraft = (l?: ListingItem): Draft => ({
  kind: l?.kind ?? 'sale', propertyType: l?.propertyType ?? 'apartment', title: l?.title ?? '', locality: l?.locality ?? '', city: l?.city ?? '',
  address: l?.address ?? '', bhk: l?.bhk ?? '', area: l?.area?.toString() ?? '', areaUnit: l?.areaUnit ?? 'sqft', floor: l?.floor ?? '',
  furnishing: l?.furnishing ?? '', facing: l?.facing ?? '', price: l?.price?.toString() ?? '', monthlyRent: l?.monthlyRent?.toString() ?? '',
  deposit: l?.deposit?.toString() ?? '', maintenance: l?.maintenance?.toString() ?? '', availableFrom: l?.availableFrom ?? '',
  description: l?.description ?? '', ownerName: l?.owner?.name ?? '', ownerPhone: l?.owner?.phone ?? '', ownerEmail: l?.owner?.email ?? '',
  fitOut: l?.fitOut ?? '', seats: l?.seats?.toString() ?? '', frontageFt: l?.frontageFt?.toString() ?? '', parking: l?.parking?.toString() ?? '',
})
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export function ListingsClient({ orgId, agency, me, listings, template, canCreate, canDelete }: {
  orgId: string
  agency: string
  me: { name: string; phone: string | null }
  listings: ListingItem[]
  template: string
  canCreate: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<ListingItem | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(toDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState<ListingItem | null>(null)
  const [emailing, setEmailing] = useState<ListingItem | null>(null)
  const [emailKind, setEmailKind] = useState<OwnerEmailKind>('listed')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailResult, setEmailResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function emailOwner() {
    if (!emailing) return
    setEmailBusy(true); setEmailResult(null)
    try {
      const res = await fetch(`/api/listings/${emailing.id}/owner-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, kind: emailKind }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setEmailResult({ tone: 'danger', text: out.error ?? 'Could not send.' }); return }
      setEmailResult({ tone: 'success', text: out.message ?? 'Sent.' }); router.refresh()
    } catch { setEmailResult({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setEmailBusy(false) }
  }
  const message = useMemo(() => (sharing ? shareText(template, sharing, { agent: me.name, agentPhone: me.phone, agency }) : ''), [sharing, template, me, agency])

  const open = (l: ListingItem | 'new') => { setEditing(l); setDraft(toDraft(l === 'new' ? undefined : l)); setError(null) }
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }))
  const showOwner = editing === 'new' || (editing && editing.owner !== null)

  async function save() {
    const check = normaliseListing(draft)
    const first = Object.values(check.errors)[0]
    if (first) { setError(first); return }
    setBusy(true); setError(null)
    try {
      const isNew = editing === 'new'
      const body = isNew ? { orgId, listing: draft } : { orgId, listing: editing && editing.owner === null ? { ...draft, ownerName: undefined, ownerPhone: undefined, ownerEmail: undefined } : draft }
      const res = await fetch(isNew ? '/api/listings' : `/api/listings/${(editing as ListingItem).id}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setEditing(null); router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function act(l: ListingItem, kind: 'status' | 'delete', status?: ListingStatus) {
    setNotice(null)
    if (kind === 'delete' && !window.confirm(`Delete “${l.title}”? To keep the record, mark it Closed or Withdrawn instead.`)) return
    const res = kind === 'delete'
      ? await fetch(`/api/listings/${l.id}?orgId=${orgId}`, { method: 'DELETE' })
      : await fetch(`/api/listings/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, status }) })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) setNotice(out.error ?? 'Could not save.'); else router.refresh()
  }

  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><Button onClick={() => open('new')}><Plus aria-hidden /> Add listing</Button></div>}
      {notice && <Alert tone="danger">{notice}</Alert>}
      {listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-default p-8 text-center text-[13px] text-muted">No listings here. Add the resale homes, rentals and commercial spaces your agency handles for owners.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((l) => (
            <li key={l.id} className="flex flex-col rounded-xl border border-default bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-foreground">{l.title}</p>
                  <p className="text-[12px] text-muted">{PROPERTY_TYPES[l.propertyType]} · {l.locality}, {l.city}</p>
                </div>
                <Badge tone={l.kind === 'rent' ? 'warning' : undefined}>{LISTING_KINDS[l.kind]}</Badge>
              </div>
              <p className="mt-2 text-[16px] font-semibold tabular-nums text-foreground">{listingPrice(l)}</p>
              <p className="text-[12px] text-muted">{[l.bhk, l.area ? `${Math.round(l.area).toLocaleString('en-IN')} ${l.areaUnit}` : null, l.furnishing && !isCommercial(l.propertyType) ? FURNISHING[l.furnishing] : null, commercialLine(l) || null].filter(Boolean).join(' · ') || '—'}</p>
              {l.owner && (l.owner.name || l.owner.phone) && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><UserRound aria-hidden className="size-3.5" /> Owner: {[l.owner.name, l.owner.phone].filter(Boolean).join(' · ')}</p>
              )}
              <p className="mt-1 text-[12px] text-subtle">Agent: {l.assigneeName ?? '—'}{l.ownerEmailed && <> · Owner e-mailed {day(l.ownerEmailed.at)}</>}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                <Button size="sm" onClick={() => setSharing(l)} disabled={l.status !== 'available'}><MessageCircle aria-hidden /> Share</Button>
                {l.canEdit && <Button size="sm" variant="secondary" onClick={() => open(l)}><Pencil aria-hidden /> Edit</Button>}
                {l.canEdit && l.owner?.email && (
                  <Button size="sm" variant="secondary" onClick={() => { setEmailing(l); setEmailKind(l.status === 'available' ? 'listed' : 'update'); setEmailResult(null) }}><Mail aria-hidden /> E-mail owner</Button>
                )}
                {l.canEdit ? (
                  <Select aria-label={`Status of ${l.title}`} value={l.status} onChange={(e) => act(l, 'status', e.target.value as ListingStatus)} className="h-8 w-auto text-[12px]">
                    {Object.entries(LISTING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                ) : <Badge>{LISTING_STATUSES[l.status]}</Badge>}
                {canDelete && <Button size="sm" variant="ghost" aria-label={`Delete ${l.title}`} onClick={() => act(l, 'delete')}><Trash2 aria-hidden /></Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sharing && (
        <Dialog open onOpenChange={(o) => { if (!o) setSharing(null) }}>
          <DialogContent title={`Share “${sharing.title}”`} description="Your agency’s message, filled in. The owner’s details and the full address are never included.">
            <Textarea readOnly rows={8} value={message} className="font-mono text-[12px]" />
            <DialogFooter>
              <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(message).catch(() => {}) }}><Copy aria-hidden /> Copy</Button>
              <Button asChild><a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Open WhatsApp</a></Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {emailing && (
        <Dialog open onOpenChange={(o) => { if (!o) setEmailing(null) }}>
          <DialogContent title={`E-mail the owner of “${emailing.title}”`} description={`To ${emailing.owner?.name ?? 'the owner'} at the address on the listing. Replies go to your agency’s business e-mail.`}>
            <fieldset className="space-y-2">
              <legend className="sr-only">Message</legend>
              {(Object.keys(OWNER_EMAILS) as OwnerEmailKind[]).map((k) => {
                const blocked = ownerEmailBlocker(k, emailing)
                return (
                  <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${emailKind === k ? 'border-brand bg-brand-light' : 'border-default'} ${blocked ? 'opacity-50' : ''}`}>
                    <input type="radio" name="owner-email" className="mt-1" checked={emailKind === k} disabled={!!blocked} onChange={() => setEmailKind(k)} />
                    <span><span className="block text-[13px] font-medium text-foreground">{OWNER_EMAILS[k].label}</span><span className="block text-[12px] text-muted">{blocked ?? OWNER_EMAILS[k].hint}</span></span>
                  </label>
                )
              })}
            </fieldset>
            <p className="text-[12px] text-muted">The owner’s own details are never shown to buyers or tenants. Each message goes at most once a day.</p>
            {emailResult && <Alert tone={emailResult.tone}>{emailResult.text}</Alert>}
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary">Close</Button></DialogClose>
              <Button onClick={emailOwner} loading={emailBusy} disabled={!!ownerEmailBlocker(emailKind, emailing)}><Mail aria-hidden /> Send</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditing(null) }}>
          <DialogContent title={editing === 'new' ? 'Add a listing' : `Edit “${editing.title}”`} description="Owner details stay inside the agency." className="max-w-2xl">
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sale or rent"><Select value={draft.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(LISTING_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Property type"><Select value={draft.propertyType} onChange={(e) => set('propertyType', e.target.value)}>{Object.entries(PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              </div>
              <Field label="Title" required><Input value={draft.title} maxLength={120} placeholder="e.g. 3BHK with park view, Jubilee Hills" onChange={(e) => set('title', e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Locality" required><Input value={draft.locality} onChange={(e) => set('locality', e.target.value)} /></Field>
                <Field label="City" required><Input value={draft.city} onChange={(e) => set('city', e.target.value)} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="BHK"><Input value={draft.bhk} placeholder="3BHK" onChange={(e) => set('bhk', e.target.value)} /></Field>
                <Field label="Area"><Input inputMode="decimal" value={draft.area} onChange={(e) => set('area', e.target.value)} /></Field>
                <Field label="Unit"><Select value={draft.areaUnit} onChange={(e) => set('areaUnit', e.target.value)}>{['sqft', 'sqyd', 'acres', 'guntas', 'cents'].map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
                <Field label="Floor"><Input value={draft.floor} onChange={(e) => set('floor', e.target.value)} /></Field>
              </div>
              {draft.kind === 'sale' ? (
                <Field label="Asking price (₹)"><Input inputMode="numeric" value={draft.price} onChange={(e) => set('price', e.target.value)} placeholder="8500000" /></Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Rent (₹ a month)"><Input inputMode="numeric" value={draft.monthlyRent} onChange={(e) => set('monthlyRent', e.target.value)} /></Field>
                  <Field label="Deposit (₹)"><Input inputMode="numeric" value={draft.deposit} onChange={(e) => set('deposit', e.target.value)} /></Field>
                  <Field label="Maintenance (₹ a month)"><Input inputMode="numeric" value={draft.maintenance} onChange={(e) => set('maintenance', e.target.value)} /></Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Furnishing"><Select value={draft.furnishing} onChange={(e) => set('furnishing', e.target.value)}><option value="">—</option>{Object.entries(FURNISHING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Facing"><Input value={draft.facing} onChange={(e) => set('facing', e.target.value)} /></Field>
                <Field label="Available from"><Input type="date" value={draft.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} /></Field>
              </div>
              {isCommercial(draft.propertyType as PropertyType) && (
                <fieldset className="space-y-3 rounded-lg border border-default p-3">
                  <legend className="px-1 text-[12px] font-semibold text-foreground">Commercial details</legend>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Fit-out"><Select value={draft.fitOut} onChange={(e) => set('fitOut', e.target.value)}><option value="">—</option>{Object.entries(FIT_OUT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                    <Field label="Seats"><Input inputMode="numeric" value={draft.seats} onChange={(e) => set('seats', e.target.value)} placeholder="40" /></Field>
                    <Field label="Frontage (ft)"><Input inputMode="decimal" value={draft.frontageFt} onChange={(e) => set('frontageFt', e.target.value)} /></Field>
                    <Field label="Parking"><Input inputMode="numeric" value={draft.parking} onChange={(e) => set('parking', e.target.value)} /></Field>
                  </div>
                </fieldset>
              )}
              <Field label="Description"><Textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => set('description', e.target.value)} /></Field>
              {showOwner && (
                <fieldset className="space-y-3 rounded-lg border border-default p-3">
                  <legend className="px-1 text-[12px] font-semibold text-foreground">Owner — private to the agency</legend>
                  <Field label="Full address"><Input value={draft.address} onChange={(e) => set('address', e.target.value)} /></Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Owner’s name"><Input value={draft.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
                    <Field label="Owner’s phone"><Input inputMode="tel" value={draft.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} /></Field>
                    <Field label="Owner’s e-mail"><Input inputMode="email" value={draft.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} /></Field>
                  </div>
                </fieldset>
              )}
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button onClick={save} loading={busy}>{editing === 'new' ? 'Add listing' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
