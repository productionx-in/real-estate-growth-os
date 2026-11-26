// components/brand/BuildingLoader.tsx — RE's loading moment: a tower rising floor by floor beside a crane, windows
// lighting up as each floor lands. Pure SVG + CSS (GPU transforms only); still frame with reduced motion.
import { cn } from '@/lib/utils/cn'

const FLOORS = 6

export function BuildingLoader({ label = 'Loading…', className, size = 120 }: { label?: string; className?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-3', className)}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className="re-build overflow-visible">
        {/* crane */}
        <g className="re-crane" style={{ transformOrigin: '92px 22px' }}>
          <path d="M92 108 V22" stroke="var(--logo-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M60 22 H112" stroke="var(--logo-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M92 22 L100 14 L108 22" stroke="var(--logo-ink)" strokeWidth="1.5" fill="none" />
          <path className="re-cable" d="M68 22 V40" stroke="var(--logo-signal)" strokeWidth="1.2" />
          <rect className="re-cable" x="63" y="40" width="10" height="5" rx="1" fill="var(--logo-signal)" />
        </g>
        {/* tower */}
        {Array.from({ length: FLOORS }, (_, i) => (
          <g key={i} className="re-floor" style={{ animationDelay: `${i * 0.28}s` }}>
            <rect x="22" y={96 - i * 13} width="40" height="12" rx="2" fill={i === FLOORS - 1 ? 'var(--logo-signal)' : 'var(--logo-ink)'} />
            {[28, 38, 48].map((x) => (
              <rect key={x} className="re-window" style={{ animationDelay: `${i * 0.28 + 0.25}s` }} x={x} y={99 - i * 13} width="6" height="5" rx="1" fill="#fbbf24" />
            ))}
          </g>
        ))}
        <path d="M8 109 H114" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[13px] font-medium text-muted">{label}</span>
    </div>
  )
}
