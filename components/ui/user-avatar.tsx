// components/ui/user-avatar.tsx — a person's profile photo, or their initials on the brand colour when they have none
// (or the photo fails to load). One component everywhere a person appears.
'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { initials } from '@/lib/profile/photo'

export function UserAvatar({ name, src, size = 32, className }: { name: string | null | undefined; src?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- photos come from the avatars bucket at any size; next/image adds nothing here
    return <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} className={cn('shrink-0 rounded-full object-cover ring-2 ring-[var(--surface)]', className)} style={style} />
  }
  return <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-brand font-semibold text-brand-foreground', className)} style={style}>{initials(name)}</span>
}
