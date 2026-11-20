'use client'
// components/auth/PasswordInput.tsx — a password field with a show/hide button, used on every sign-in and
// set-password screen. The button never submits the form and keeps the caret where it was.
import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function PasswordInput({ className, ...props }, ref) {
    const [show, setShow] = React.useState(false)
    return (
      <div className="relative">
        <input ref={ref} type={show ? 'text' : 'password'} {...props}
          className={cn('w-full py-2 pl-3 pr-11 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-brand-light transition-colors placeholder:text-[var(--foreground-subtle)] disabled:opacity-60', className)} />
        <button type="button" onClick={() => setShow((s) => !s)} onMouseDown={(e) => e.preventDefault()}
          aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-[var(--foreground-subtle)] hover:text-[var(--foreground)]">
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    )
  },
)
