'use client'
// components/support/Parrot.tsx — Rio, RE’s guide: a round, front-facing parrot whose body is a chat bubble.
// Original artwork (not a third-party logo). Colours come from --parrot-* tokens in globals.css. It blinks and
// waves (CSS in globals.css, "rio-"), and keeps still for people who prefer reduced motion.
import { useId } from 'react'

export function Parrot({ className, title, animated = false }: { className?: string; title?: string; animated?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}
      data-animated={animated || undefined}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--parrot-body)" />
          <stop offset="1" stopColor="var(--parrot-body-2)" />
        </linearGradient>
      </defs>
      {/* crest */}
      <g className="rio-crest">
        <path d="M30 11c-2-5-1-9 2-10 1 4 1 7 0 10z" fill="var(--parrot-wing)" />
        <path d="M33 11c1-5 4-8 8-8-1 4-3 7-6 9z" fill="var(--parrot-beak)" />
        <path d="M29 12c-3-3-7-4-9-3 2 3 5 4 8 4z" fill="var(--parrot-wing)" />
      </g>
      {/* wings (behind the body) */}
      <path d="M11 37c-5 1-8 6-7 11 4-1 7-4 9-8z" fill="var(--parrot-wing)" />
      <path className="rio-wing" d="M53 37c5 1 8 6 7 11-4-1-7-4-9-8z" fill="var(--parrot-wing)" />
      {/* body = modern chat bubble with a tail */}
      <path d="M32 11a24 24 0 1 1-13.4 43.9L7 59l3.6-11.1A24 24 0 0 1 32 11z" fill={`url(#b${id})`} />
      {/* tummy */}
      <ellipse cx="32" cy="46" rx="13" ry="9" fill="var(--parrot-belly)" />
      {/* eyes */}
      <g className="rio-eyes">
        <circle cx="23.5" cy="31" r="7" fill="var(--parrot-face)" />
        <circle cx="40.5" cy="31" r="7" fill="var(--parrot-face)" />
        <circle cx="24.5" cy="32" r="4.4" fill="var(--parrot-eye)" />
        <circle cx="39.5" cy="32" r="4.4" fill="var(--parrot-eye)" />
        <circle cx="26" cy="30.3" r="1.6" fill="var(--parrot-face)" />
        <circle cx="41" cy="30.3" r="1.6" fill="var(--parrot-face)" />
        <circle cx="23.2" cy="33.8" r="0.7" fill="var(--parrot-face)" />
        <circle cx="38.2" cy="33.8" r="0.7" fill="var(--parrot-face)" />
      </g>
      {/* blush */}
      <ellipse cx="16.5" cy="39" rx="3.2" ry="2" fill="var(--parrot-blush)" />
      <ellipse cx="47.5" cy="39" rx="3.2" ry="2" fill="var(--parrot-blush)" />
      {/* little hooked beak, smiling */}
      <path d="M28 37.5c2.4-2 5.6-2 8 0-.6 3.6-2.2 5.6-4 6.2-1.8-.6-3.4-2.6-4-6.2z" fill="var(--parrot-beak)" />
      <path d="M29.6 40.6c1.5 1 3.3 1 4.8 0" stroke="var(--parrot-beak-dark)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  )
}
