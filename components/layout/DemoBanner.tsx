// components/layout/DemoBanner.tsx — makes demo and staging environments impossible to mistake for production.
// DeploymentRibbon: shown on every page when NEXT_PUBLIC_DEPLOYMENT_LABEL is set (e.g. "STAGING"); never set it in
// production. DemoBanner: shown inside a workspace created by the demo seed (organisations.is_demo).
const LABEL = process.env.NEXT_PUBLIC_DEPLOYMENT_LABEL?.trim()

export function DeploymentRibbon() {
  if (!LABEL) return null
  return (
    <div role="note" className="sticky top-0 z-[60] bg-[var(--warning)] px-3 py-1 text-center text-[12px] font-semibold uppercase tracking-wide text-[var(--warning-foreground)]">
      {LABEL} · test environment · not real customer data
    </div>
  )
}

export function DemoBanner({ kind }: { kind: 'workspace' }) {
  return (
    <div role="note" className="border-b border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-1.5 text-[13px] text-[var(--warning)]">
      <strong className="font-semibold">DEMO {kind === 'workspace' ? 'workspace' : ''}</strong> — every buyer, unit and figure here is fictional test data.
    </div>
  )
}
