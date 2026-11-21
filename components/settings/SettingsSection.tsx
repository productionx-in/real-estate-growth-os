// components/settings/SettingsSection.tsx — the building blocks of a settings page: its heading, and titled cards.
export function SettingsHeader({ title, description, scope }: { title: string; description: string; scope: 'you' | 'org' }) {
  return (
    <header className="mb-5">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">{description}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{scope === 'you' ? 'Just you' : 'Applies to everyone in the workspace'}</p>
    </header>
  )
}

export function SettingsCard({ title, description, children, id, tone }: { title: string; description?: string; children: React.ReactNode; id?: string; tone?: 'danger' }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined}
      className={`scroll-mt-20 rounded-xl border bg-surface shadow-2xs ${tone === 'danger' ? 'border-danger/40' : 'border-default'}`}>
      <div className="border-b border-default px-5 py-4">
        <h2 id={id ? `${id}-title` : undefined} className="text-[14px] font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-muted">{description}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}
