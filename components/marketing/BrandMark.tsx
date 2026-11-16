// components/marketing/BrandMark.tsx
import { PRODUCT_NAME } from '@/lib/brand'

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${inverted ? 'bg-white' : 'bg-[var(--brand)]'}`}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1L14 5V11L8 15L2 11V5L8 1Z" fill={inverted ? 'var(--brand)' : 'white'} fillOpacity="0.95" />
        </svg>
      </span>
      <span className={`text-[16px] font-bold tracking-tight ${inverted ? 'text-white' : 'text-[var(--foreground)]'}`}>{PRODUCT_NAME}</span>
    </span>
  )
}
