// components/marketing/BrandMark.tsx — the site header/footer logo: the RE squircle alone (components/brand/Logo.tsx).
import { ReLogo } from '@/components/brand/Logo'

export function BrandMark({ size = 36, className }: { size?: number; className?: string; inverted?: boolean; tagline?: boolean }) {
  return <ReLogo size={size} className={className} />
}
