'use client'
// Every primitive in every state, in light and dark. Use it to review changes to components/ui.
import { useEffect, useState } from 'react'
import { Download, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
  EmptyState, Field, Input, Select, Skeleton, Spinner, StatCard, Textarea,
} from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { PlotMap } from '@/components/plots/PlotMap'
import { sampleLayout } from '@/lib/plots/sample'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  )
}

const SWATCHES = [
  ['background', 'bg-background'], ['surface', 'bg-surface'], ['surface-muted', 'bg-surface-muted'], ['surface-hover', 'bg-surface-hover'],
  ['brand', 'bg-brand'], ['brand-light', 'bg-brand-light'], ['success', 'bg-success'], ['warning', 'bg-warning'],
  ['danger', 'bg-danger'], ['info', 'bg-info'], ['border', 'bg-[var(--border)]'], ['border-strong', 'bg-[var(--border-strong)]'],
] as const

export function Gallery() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    return () => { delete document.documentElement.dataset.theme }
  }, [dark])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-default bg-surface px-6 py-3">
        <div>
          <h1 className="text-[15px] font-semibold">RE by PX design system</h1>
          <p className="text-[12px] text-muted">components/ui · tokens in app/globals.css · not available in production</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDark((d) => !d)} aria-pressed={dark}>
          {dark ? 'Light theme' : 'Dark theme'}
        </Button>
      </header>

      <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <Section title="Colour tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {SWATCHES.map(([name, cls]) => (
              <div key={name} className="overflow-hidden rounded-lg border border-default">
                <div className={`h-12 ${cls}`} />
                <p className="bg-surface px-2 py-1.5 font-mono text-[11px] text-muted">--{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <Card className="space-y-2 p-5">
            <p className="text-[22px] font-semibold">Page title · 22 semibold</p>
            <p className="text-[15px] font-semibold">Section title · 15 semibold</p>
            <p className="text-[14px]">Body · 14 regular — Inter, tabular figures for numbers: <span className="tabular-nums">₹1,24,50,000</span></p>
            <p className="text-[13px] text-muted">Secondary · 13 muted</p>
            <p className="text-[12px] text-subtle">Hint · 12 subtle</p>
          </Card>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button><Plus aria-hidden />New lead</Button>
            <Button variant="secondary"><Download aria-hidden />Export</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger"><Trash2 aria-hidden />Delete</Button>
            <Button variant="link">View details</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Tooltip content="Edit lead"><Button variant="ghost" size="icon" aria-label="Edit lead"><Pencil aria-hidden /></Button></Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button><Button size="md">Medium</Button><Button size="lg">Large · 44px touch target</Button>
          </div>
        </Section>

        <Section title="Form fields">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Buyer name" required hint="As it appears on their ID"><Input placeholder="Asha Rao" /></Field>
            <Field label="Phone" required error="Enter a 10-digit mobile number"><Input defaultValue="98765" inputMode="tel" /></Field>
            <Field label="Source">
              <Select defaultValue="website">
                <option value="website">Website</option><option value="meta_ads">Meta Ads</option><option value="walk_in">Walk-in</option>
              </Select>
            </Field>
            <Field label="Budget (₹ lakh)"><Input disabled value="Calculated from unit" readOnly /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea placeholder="Prefers east-facing 3 BHK, site visit on Saturday" /></Field>
          </Card>
        </Section>

        <Section title="Badges and alerts">
          <div className="flex flex-wrap gap-2">
            <Badge>New</Badge><Badge tone="brand">Qualified</Badge><Badge tone="success">Booked</Badge>
            <Badge tone="warning">Follow-up due</Badge><Badge tone="danger">Missed SLA</Badge><Badge tone="info">Site visit</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert tone="info" title="Import running">4,120 of 6,000 rows processed.</Alert>
            <Alert tone="success" title="Lead assigned">Ravi will be notified on his phone.</Alert>
            <Alert tone="warning" title="Renewal due">This workspace is in its grace period.</Alert>
            <Alert tone="danger" title="Couldn’t save">The phone number is already on another lead.</Alert>
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Median first response" value="4 min" hint="90% within 11 min" tone="good" />
            <StatCard label="Never contacted" value="3" hint="of 128 leads" tone="bad" />
            <StatCard label="Site visits" value="18" />
            <StatCard label="Bookings" value="4" hint="₹3.2 Cr" />
          </div>
          <Card>
            <CardHeader>
              <div><CardTitle>Lead routing</CardTitle><CardDescription>Round-robin across 4 sales executives</CardDescription></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Routing actions"><MoreHorizontal aria-hidden /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Rule</DropdownMenuLabel>
                  <DropdownMenuItem><Pencil aria-hidden />Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive><Trash2 aria-hidden />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="text-[13px] text-muted">Leads from Meta Ads for Skyline Towers go to the Whitefield team.</CardContent>
            <CardFooter>
              <Dialog>
                <DialogTrigger asChild><Button variant="danger" size="sm">Delete rule</Button></DialogTrigger>
                <DialogContent title="Delete this routing rule?" description="New leads will fall through to the next rule. Leads already assigned are not changed.">
                  <DialogFooter>
                    <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                    <DialogClose asChild><Button variant="danger">Delete rule</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Interactive plot map (add-on) · sample layout">
          <PlotMap mode="public" {...sampleLayout()} showPrices contact={{ phone: '+91 90000 00000', projectName: 'Sample Enclave', orgName: 'Sample Developers' }} />
        </Section>

        <Section title="Loading and empty states">
          <Card className="space-y-3 p-5">
            <Spinner label="Loading leads" />
            <Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /><Skeleton className="h-24 rounded-xl" />
          </Card>
          <Card>
            <EmptyState icon={Users} title="No leads yet" description="Connect a lead source or add one by hand. New enquiries appear here within seconds."
              action={<Button size="sm"><Plus aria-hidden />Add lead</Button>} />
          </Card>
        </Section>
      </div>
    </main>
  )
}
