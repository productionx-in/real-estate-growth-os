// app/(dashboard)/[orgSlug]/listings/page.tsx — an agency's resale and rental listings (20260079). Everyone in an
// agency workspace sees the listings (to share them); owner details only reach managers, the listing's agent and
// whoever added it (lib/dal/listings.ts).
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getShareTemplate, listListings } from '@/lib/dal/listings'
import { createServiceClient } from '@/lib/supabase/server'
import { ListingsClient } from '@/components/listings/ListingsClient'
import { LISTING_STATUSES } from '@/lib/listings/listing'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Listings' }
export const dynamic = 'force-dynamic'

export default async function ListingsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ kind?: string; status?: string; q?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (org.type !== 'channel_partner') redirect(`/${orgSlug}`)
  const viewer = { role, profileId: profile.id }
  const kind = sp.kind === 'sale' || sp.kind === 'rent' ? sp.kind : null
  const status = sp.status && (sp.status === 'all' || sp.status in LISTING_STATUSES) ? sp.status : null
  const [listings, template, { data: me }] = await Promise.all([
    listListings(org.id, viewer, { kind, status, q: sp.q ?? null }),
    getShareTemplate(org.id),
    createServiceClient().from('profiles').select('full_name, phone').eq('id', profile.id).maybeSingle(),
  ])
  const tab = (k: string | null, label: string) => {
    const q = new URLSearchParams(); if (k) q.set('kind', k); if (status) q.set('status', status)
    return <Link key={label} href={`/${orgSlug}/listings${q.size ? `?${q}` : ''}`} aria-current={kind === k ? 'page' : undefined}
      className={cn('rounded-md px-3 py-1.5 text-[12px]', kind === k ? 'bg-surface font-semibold shadow-sm' : 'text-muted')}>{label}</Link>
  }
  return (
    <PageShell title="Listings" description="Resale homes, rentals and commercial spaces you handle for owners.">
      <div className="max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Sale or rent" className="inline-flex rounded-lg border border-default bg-[var(--background)] p-0.5">{[tab(null, 'All'), tab('sale', 'For sale'), tab('rent', 'For rent')]}</nav>
          <form className="flex items-center gap-2" action={`/${orgSlug}/listings`}>
            {kind && <input type="hidden" name="kind" value={kind} />}
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Search title, locality, city" aria-label="Search listings"
              className="h-9 w-56 rounded-md border border-default bg-surface px-3 text-[13px] text-foreground" />
            <select name="status" defaultValue={status ?? ''} aria-label="Status" className="h-9 rounded-md border border-default bg-surface px-2 text-[13px] text-foreground">
              <option value="">Available and on hold</option><option value="all">All, incl. closed</option>
              {Object.entries(LISTING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="submit" className="h-9 rounded-md border border-default px-3 text-[13px] font-medium text-foreground hover:bg-surface-hover">Apply</button>
          </form>
        </div>
        <ListingsClient orgId={org.id} agency={org.name} me={{ name: me?.full_name ?? 'Your agent', phone: me?.phone ?? null }} listings={listings} template={template}
          canCreate={!['readonly', 'post_sales'].includes(role)} canDelete={isAdmin} />
      </div>
    </PageShell>
  )
}
