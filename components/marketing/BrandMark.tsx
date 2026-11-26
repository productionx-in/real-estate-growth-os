// components/marketing/BrandMark.tsx — the site header/footer lockup (see components/brand/Logo.tsx).
import { Logo } from '@/components/brand/Logo'

export function BrandMark({ tagline = false }: { inverted?: boolean; tagline?: boolean }) {
  return <Logo tagline={tagline} />
}
