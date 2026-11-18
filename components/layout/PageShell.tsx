// components/layout/PageShell.tsx
// Consistent page wrapper: optional back link, title, description and actions, then the content.
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface PageShellProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Where "back" goes (e.g. a lead → the lead list). Shown above the title. */
  back?: { href: string; label: string }
  children: React.ReactNode
}

export function PageShell({ title, description, actions, back, children }: PageShellProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-default bg-surface px-4 py-4 md:px-6 md:py-5">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden className="size-3.5" /> {back.label}
          </Link>
        )}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-foreground md:text-[20px]">{title}</h1>
            {description && <div className="mt-1 text-[13px] text-muted">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-4">{actions}</div>}
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6">{children}</div>
    </div>
  )
}
