// app/loading.tsx — first load and every page outside the workspace shell (sign-in, workspace picker, console).
import { BuildingLoader } from '@/components/brand/BuildingLoader'

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <BuildingLoader label="Building your workspace…" />
    </div>
  )
}
