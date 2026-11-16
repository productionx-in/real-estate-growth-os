// components/layout/PageShell.tsx
// Consistent page wrapper with title, description, and optional actions.
interface PageShellProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-[var(--border)] bg-[var(--surface)]">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--foreground)]">{title}</h1>
          {description && (
            <div className="mt-0.5 text-[13px] text-[var(--foreground-muted)]">{description}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 sm:ml-4 flex-wrap">{actions}</div>}
      </div>

      {/* Page content */}
      <div className="flex-1 p-4 md:p-6">{children}</div>
    </div>
  )
}
