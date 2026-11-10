// components/layout/PageShell.tsx
// Consistent page wrapper with title, description, and optional actions.
interface PageShellProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--border)] bg-[var(--surface)]">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--foreground)]">{title}</h1>
          {description && (
            <div className="mt-0.5 text-[13px] text-[var(--foreground-muted)]">{description}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
      </div>

      {/* Page content */}
      <div className="flex-1 p-6">{children}</div>
    </div>
  )
}
