// components/brand/Logo.tsx — the RE squircle (v2 kit, "Folded Interlocking RE"): Electric Indigo rounded square with a
// white RE. The logo stands alone; Production X appears only as a quiet endorsement (PxMark) in footers.
import { useId } from 'react'
import { cn } from '@/lib/utils/cn'

export function ReLogo({ size = 36, flat = false, className, title = 'RE' }: { size?: number; flat?: boolean; className?: string; title?: string }) {
  const gradId = useId()
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size} className={cn('shrink-0', className)}
      role="img" aria-label={title}>
      {!flat && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5348F5" />
            <stop offset="52%" stopColor="#4338CA" />
            <stop offset="100%" stopColor="#2E268A" />
          </linearGradient>
        </defs>
      )}
      <rect width="512" height="512" rx="118" fill={flat ? '#4338CA' : `url(#${gradId})`} />
      <path fill="#FFFFFF" fillRule="evenodd" d="M92 154 H188 C224 154 246 176 246 210 C246 237 230 257 205 264 L256 358 H206 L160 270 H136 V358 H92 Z M136 194 V232 H184 C198 232 206 224 206 213 C206 202 198 194 184 194 Z" />
      <path fill="rgba(49,46,129,0.22)" d="M160 270 H205 L219 296 H173 Z" />
      <path fill="#FFFFFF" d="M276 154 H416 V194 H316 V236 H400 V276 H316 V318 H416 V358 H278 L254 316 V196 Z" />
      <path fill="rgba(49,46,129,0.22)" d="M276 154 H316 L276 200 L254 196 Z" />
    </svg>
  )
}

/** Small marks (sidebar footer, console rail): the same squircle, sized by class. */
export function ReMark({ className = 'size-5' }: { className?: string; tone?: 'white'; title?: string }) {
  return <ReLogo size={20} className={className} />
}

/** Production X endorsement mark: `dark` on dark grounds (warm white + orange), `ink` on light grounds. */
export function PxMark({ variant = 'ink', height = 14, className }: { variant?: 'dark' | 'ink'; height?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG from /public
  return <img src={variant === 'dark' ? '/brand/px-mark-on-dark.svg' : '/brand/px-mark-mono-ink.svg'} alt="Production X" height={height} width={Math.round(height * 0.97)} style={{ height, width: 'auto' }} className={className} />
}

/** Backwards-compatible name: the logo now stands alone (no "by PX" lockup). */
export function Logo({ size = 36, className }: { size?: number; className?: string; tagline?: boolean }) {
  return <ReLogo size={size} className={className} />
}
