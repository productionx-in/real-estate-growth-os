// components/ui/button.tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium cursor-pointer select-none ' +
    'transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out active:scale-[0.98] ' +
    'touch-manipulation disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Design language v3 (app/globals.css): the primary key is a glowing brand gradient, the secondary a clay key.
        primary: 'btn-primary bg-brand text-brand-foreground',
        secondary: 'btn-secondary bg-surface text-foreground border border-default hover:bg-surface-muted',
        ghost: 'text-muted hover:bg-surface-hover hover:text-foreground',
        danger: 'btn-danger bg-danger text-danger-foreground hover:bg-danger-hover',
        link: 'text-brand underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        // Touch screens get a 40–44px target (Apple/Material minimum); mouse users keep the compact size.
        sm: 'h-8 px-2.5 text-[12px] pointer-coarse:h-10 pointer-coarse:px-3',
        md: 'h-9 px-3.5 text-[13px] pointer-coarse:h-11',
        lg: 'h-11 px-5 text-[14px]',
        icon: 'h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next.js Link) with button styling. */
  asChild?: boolean
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Slot>
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 aria-hidden className="animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
