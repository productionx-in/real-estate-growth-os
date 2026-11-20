// components/support/Parrot.tsx — REGrow's chat mascot: a parrot whose body is a speech bubble.
// Original artwork (not a third-party logo). Colours come from --parrot-* tokens in globals.css.
export function Parrot({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {/* crest */}
      <path d="M27 9c-3-4-3-7-1-9 2 3 4 5 5 8z" fill="var(--parrot-wing)" />
      <path d="M31 8c-1-4 0-7 3-8 1 3 1 6 0 8z" fill="var(--parrot-wing)" />
      <path d="M35 9c1-4 3-6 6-6 0 3-1 5-3 7z" fill="var(--parrot-wing)" />
      {/* body = speech bubble with a tail */}
      <path d="M32 7a24 24 0 1 1-12.3 44.6L7 56l3.7-11.8A24 24 0 0 1 32 7z" fill="var(--parrot-body)" />
      {/* wing */}
      <path d="M17 31c7 1 12 7 12 16-7-1-13-7-12-16z" fill="var(--parrot-wing)" />
      <path d="M20 36c3 1 5 3 6 6" stroke="var(--parrot-body)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* face patch, eye */}
      <ellipse cx="37" cy="25" rx="9" ry="8" fill="var(--parrot-face)" />
      <circle cx="39" cy="25" r="3.4" fill="var(--parrot-eye)" />
      <circle cx="40.2" cy="23.8" r="1.1" fill="var(--parrot-face)" />
      {/* hooked beak */}
      <path d="M44 27c6-1 11 3 10 10-2-3-5-4-8-4-1-2-1-4-2-6z" fill="var(--parrot-beak)" />
      <path d="M45 33c2 0 4 1 5 3-2 1-4 1-6 0z" fill="var(--parrot-beak-dark)" />
      {/* cheek blush */}
      <circle cx="33" cy="32" r="2.2" fill="var(--parrot-beak)" opacity="0.35" />
    </svg>
  )
}
