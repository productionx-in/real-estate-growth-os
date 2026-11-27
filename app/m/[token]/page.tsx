// app/m/[token]/page.tsx — a project's live plot map shared with buyers. Public: the 256-bit link is the key, and
// unknown, turned-off, unpublished and add-on-off links all show the same page. Buyers see available / reserved /
// sold only, prices only when the developer chose to show them, and can enquire about an available plot.
import type { Metadata } from 'next'
import { PlotMap } from '@/components/plots/PlotMap'
import { openSharedLayout } from '@/lib/dal/plot-layouts'
import { AutoRefresh } from '@/components/plots/AutoRefresh'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Plot availability', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function SharedPlotMapPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { token } = await params
  const embed = (await searchParams).embed === '1'
  const map = await openSharedLayout(token)
  if (!map) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-[18px] font-semibold text-foreground">This map is no longer available</h1>
        <p className="mt-2 text-[14px] text-muted">The link may have been turned off. Please ask the person who sent it for a new one.</p>
      </main>
    )
  }
  const available = Object.values(map.plots).filter((p) => p.status === 'available').length
  return (
    <main className={embed ? 'bg-background p-2' : 'min-h-dvh bg-background px-4 py-6 sm:px-6'}>
      <AutoRefresh seconds={30} />
      <div className="mx-auto max-w-6xl space-y-4">
        <header className={embed ? 'sr-only' : undefined}>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">{map.orgName}</p>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-foreground">{map.projectName}{map.name ? ` — ${map.name}` : ''}</h1>
          <p className="mt-1 text-[14px] text-muted">{available} plot{available === 1 ? '' : 's'} available now · updated live</p>
        </header>
        <PlotMap mode="public" viewBox={map.viewBox} geometry={map.geometry} plots={map.plots} showPrices={map.showPrices}
          contact={{ phone: map.contactPhone, projectName: map.projectName, orgName: map.orgName }} image={map.image} enquiryToken={token} northDeg={map.northDeg} />
        <p className="text-[11px] text-subtle">Availability is shown for information and can change at any time. A plot is yours only once the developer confirms your booking.</p>
      </div>
    </main>
  )
}
