// components/ui/fullscreen-loader.tsx — the RE building animation over the whole screen while a sign-in opens the
// workspace (the next page loads behind it).
import { BuildingLoader } from '@/components/brand/BuildingLoader'

export function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="anim-overlay fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-sm">
      <BuildingLoader label={label} />
    </div>
  )
}
