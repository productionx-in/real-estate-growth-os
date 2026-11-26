// components/brand/ShellLoader.tsx — the building animation inside the app frame (workspace, console, account): the
// sidebar and header stay put and the rising tower fills the content area while the page's data loads.
import { BuildingLoader } from '@/components/brand/BuildingLoader'

export function ShellLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6" aria-busy="true">
      <BuildingLoader label={label} size={96} />
    </div>
  )
}
