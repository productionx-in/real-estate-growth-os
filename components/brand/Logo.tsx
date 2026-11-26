// components/brand/Logo.tsx — the RE by PX "Forward Vector" monogram and the "RE | by PX" lockup.
// Colours come from --logo-ink / --logo-signal (app/globals.css), so the mark follows the theme and turns
// white-on-indigo inside dark bands (.band-ink) without a variant prop. `tone="white"` forces the mono-white mark.
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils/cn'

const R_PATH = 'M10 12 H39 C49.5 12 56 18.5 56 28.5 C56 36.8 51.2 42.6 43.8 44.3 L57 68 H43.2 L31.2 45.5 H22 V68 H10 Z M22 23 V35 H37.5 C41.8 35 44.5 32.5 44.5 29 C44.5 25.5 41.8 23 37.5 23 Z'

export function ReMark({ className = 'h-7 w-auto', tone, title }: { className?: string; tone?: 'white'; title?: string }) {
  const ink = tone === 'white' ? '#fff' : 'var(--logo-ink)'
  const signal = tone === 'white' ? '#fff' : 'var(--logo-signal)'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="8 10 104 60" className={className} role={title ? 'img' : undefined}
      aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <path fill={ink} fillRule="evenodd" d={R_PATH} />
      <path fill={ink} d="M65 12 H110 V23 H77 V57 H110 V68 H65 Z" />
      <path fill={signal} d="M77 34.5 H106 L100 45.5 H77 Z" />
    </svg>
  )
}

/** The full lockup: RE monogram, a hairline, "by PX"; optionally the REAL ESTATE GROWTH OS descriptor underneath. */
export function Logo({ className, tagline = false, size = 'md' }: { className?: string; tagline?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-flex select-none flex-col items-start', className)} role="img" aria-label={PRODUCT_NAME}>
      <span className="inline-flex items-center gap-2.5" aria-hidden>
        <ReMark className={size === 'sm' ? 'h-[22px] w-auto' : 'h-[27px] w-auto'} />
        <span className="h-5 w-px" style={{ backgroundColor: 'var(--logo-rule)' }} />
        <span className="inline-flex items-baseline gap-1 leading-none">
          <span className="text-[12px] font-medium" style={{ color: 'var(--logo-muted)' }}>by</span>
          <span className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--logo-ink)' }}>PX</span>
        </span>
      </span>
      {tagline && (
        <span aria-hidden className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--logo-muted)' }}>
          {PRODUCT_DESCRIPTOR}
        </span>
      )}
    </span>
  )
}
