// lib/jobs/customer-emails.ts — email.customer_lifecycle (hourly, migration 20260068): finds what happened to each
// customer's account and e-mails the workspace's active owners and admins about it, once.
//
//   welcome          an owner joined the workspace (activation finished); says when a trial is running
//   member_joined    a team member joined: a welcome to them, with their role and first steps
//   plan_active      a paid plan became active
//   trial_ending     7, 3 and 1 day(s) before a trial ends (only the nearest milestone, once each)
//   trial_ended      a trial's end date passed in the last 3 days without a paid plan
//   invoice_issued   an invoice was issued
//   payment_received a payment was captured (receipt)
//   payment_failed   a payment attempt failed
//   workspace_state  the workspace became read-only, deactivated, in grace, or active again
//
// Each e-mail has a dedupe key in customer_email_log, written before sending, so a retry or an overlapping run can
// never send it twice. Events are looked at for 2–3 days only, so turning e-mail on later doesn't send old news.
// While e-mail isn't configured nothing is sent or recorded, so it goes out on the first run after it is.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmailAdapter, isReservedTestAddress } from '@/lib/email/adapter'
import { customerEmails, type CustomerEmailKind, type Rendered } from '@/lib/email/customer'
import { appUrl } from '@/lib/site/urls'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
const DAY = 86_400_000

export interface PendingEmail {
  orgId: string; kind: CustomerEmailKind; key: string; render: (url: (path: string) => string, orgName: string, slug: string) => Rendered; includeSuspended?: boolean
  /** Send only to this person (a profile id) instead of the workspace's owners and admins. */
  toProfile?: string
}
const planName = (tier: string | null | undefined) => (tier ? tier.charAt(0).toUpperCase() + tier.slice(1).replace(/_/g, ' ') : null)

/** Which trial milestone applies now (7, 3 or 1 days left), or null. */
export function trialMilestone(endsAt: string, now = Date.now()): 7 | 3 | 1 | null {
  const left = (new Date(endsAt).getTime() - now) / DAY
  if (left <= 0) return null
  if (left <= 1) return 1
  if (left <= 3) return 3
  if (left <= 7) return 7
  return null
}

/** Everything that should be e-mailed now, before checking what was already sent. */
export async function collectPending(db: Db, now = Date.now()): Promise<PendingEmail[]> {
  const since2 = new Date(now - 2 * DAY).toISOString()
  const since3 = new Date(now - 3 * DAY).toISOString()
  const nowIso = new Date(now).toISOString()
  const out: PendingEmail[] = []

  const { data: owners } = await db.from('org_members').select('org_id, joined_at').eq('role', 'owner').eq('status', 'active').gte('joined_at', since2)
  for (const o of owners ?? []) {
    const { data: sub } = await db.from('org_subscriptions').select('status, plan_tier, current_period_end').eq('org_id', o.org_id).maybeSingle()
    const trialEndsAt = sub?.status === 'trial' ? (sub.current_period_end as string | null) : null
    out.push({ orgId: o.org_id, kind: 'welcome', key: `welcome:${o.org_id}`,
      render: (u, name, slug) => customerEmails.welcome({ orgName: name, url: u(`/${slug}`), trialEndsAt, plan: planName(sub?.plan_tier) }) })
  }

  // A team member (not the owner) accepted their invitation: welcome them, personally.
  const { data: joined } = await db.from('org_members').select('id, org_id, profile_id, role').neq('role', 'owner').eq('status', 'active').gte('joined_at', since2)
  for (const m of joined ?? []) {
    const { data: p } = await db.from('profiles').select('full_name').eq('id', m.profile_id).maybeSingle()
    const firstName = (p?.full_name ?? '').trim().split(/\s+/)[0] || 'there'
    out.push({ orgId: m.org_id, kind: 'member_joined', key: `member_joined:${m.id}`, toProfile: m.profile_id,
      render: (u, name, slug) => customerEmails.member_joined({ orgName: name, firstName, role: m.role, url: u(`/${slug}/today`) }) })
  }

  // A paid plan became active (staff activation or a payment).
  const { data: active } = await db.from('org_subscriptions').select('org_id, plan_tier, included_seats, additional_seats, current_period_end, activated_at').eq('status', 'active').gte('activated_at', since2)
  for (const a of active ?? []) {
    out.push({ orgId: a.org_id, kind: 'plan_active', key: `plan_active:${a.org_id}:${String(a.activated_at).slice(0, 10)}`, includeSuspended: true,
      render: (u, name, slug) => customerEmails.plan_active({ orgName: name, plan: planName(a.plan_tier), seats: (a.included_seats ?? 0) + (a.additional_seats ?? 0) || null, renewsAt: a.current_period_end, url: u(`/${slug}/billing`) }) })
  }

  const { data: trials } = await db.from('org_subscriptions').select('org_id, status, current_period_end').in('status', ['trial', 'expired', 'canceled']).not('current_period_end', 'is', null)
  for (const t of trials ?? []) {
    const end = t.current_period_end as string
    const m = t.status === 'trial' ? trialMilestone(end, now) : null
    if (m) {
      out.push({ orgId: t.org_id, kind: 'trial_ending', key: `trial_ending:${t.org_id}:${end.slice(0, 10)}:${m}`,
        render: (u, name, slug) => customerEmails.trial_ending({ orgName: name, endsAt: end, daysLeft: Math.max(1, Math.ceil((new Date(end).getTime() - now) / DAY)), url: u(`/${slug}/billing`) }) })
    } else if (end < nowIso && end >= since3) {
      out.push({ orgId: t.org_id, kind: 'trial_ended', key: `trial_ended:${t.org_id}:${end.slice(0, 10)}`, includeSuspended: true,
        render: (u, name, slug) => customerEmails.trial_ended({ orgName: name, url: u(`/${slug}/billing`) }) })
    }
  }

  const { data: invoices } = await db.from('org_subscription_invoices').select('id, org_id, invoice_number, amount_cents, due_date, status, created_at').eq('status', 'issued').gte('created_at', since2)
  for (const i of invoices ?? []) {
    out.push({ orgId: i.org_id, kind: 'invoice_issued', key: `invoice:${i.id}`, includeSuspended: true,
      render: (u, name, slug) => customerEmails.invoice_issued({ orgName: name, invoiceNumber: i.invoice_number, amountCents: i.amount_cents, dueDate: i.due_date, url: u(`/${slug}/billing/invoices/${i.id}`) }) })
  }

  const { data: payments } = await db.from('org_subscription_payments').select('id, org_id, invoice_id, amount_cents, payment_reference, status, created_at').eq('status', 'captured').gte('created_at', since2)
  for (const p of payments ?? []) {
    const inv = p.invoice_id ? (await db.from('org_subscription_invoices').select('invoice_number').eq('id', p.invoice_id).maybeSingle()).data : null
    out.push({ orgId: p.org_id, kind: 'payment_received', key: `payment:${p.id}`, includeSuspended: true,
      render: (u, name, slug) => customerEmails.payment_received({ orgName: name, amountCents: p.amount_cents, reference: p.payment_reference, invoiceNumber: inv?.invoice_number ?? null, url: u(`/${slug}/billing`) }) })
  }

  const { data: failed } = await db.from('payment_attempts').select('id, org_id, invoice_id, amount_cents, status, updated_at').eq('status', 'failed').gte('updated_at', since2)
  for (const f of failed ?? []) {
    const inv = f.invoice_id ? (await db.from('org_subscription_invoices').select('invoice_number').eq('id', f.invoice_id).maybeSingle()).data : null
    out.push({ orgId: f.org_id, kind: 'payment_failed', key: `payment_failed:${f.id}`, includeSuspended: true,
      render: (u, name, slug) => customerEmails.payment_failed({ orgName: name, amountCents: f.amount_cents, invoiceNumber: inv?.invoice_number ?? null, url: u(`/${slug}/billing`) }) })
  }

  const { data: states } = await db.from('organisation_state_events').select('id, org_id, from_state, to_state, reason, created_at').in('to_state', ['suspended', 'deactivated', 'grace', 'active']).gte('created_at', since2)
  for (const s of states ?? []) {
    if (s.to_state === 'active' && !['suspended', 'deactivated', 'grace'].includes(s.from_state)) continue // e.g. first activation: the welcome covers it
    out.push({ orgId: s.org_id, kind: 'workspace_state', key: `state:${s.id}`, includeSuspended: true,
      render: (u, name, slug) => customerEmails.workspace_state({ orgName: name, to: s.to_state, reason: s.reason, url: s.to_state === 'deactivated' ? u('/contact') : u(`/${slug}`) }) })
  }
  return out
}

/** The e-mail addresses of a workspace's owners and admins (active; also suspended ones for billing and state news). */
export async function recipientsFor(db: Db, orgId: string, includeSuspended = false): Promise<string[]> {
  const statuses = includeSuspended ? ['active', 'suspended'] : ['active']
  const { data: members } = await db.from('org_members').select('profile_id').eq('org_id', orgId).in('role', ['owner', 'admin']).in('status', statuses)
  const emails = new Set<string>()
  for (const m of members ?? []) {
    const { data: p } = await db.from('profiles').select('auth_user_id').eq('id', m.profile_id).maybeSingle()
    if (!p?.auth_user_id) continue
    const { data } = await db.auth.admin.getUserById(p.auth_user_id)
    const u = data?.user as { email?: string; banned_until?: string | null } | undefined
    if (!u?.email || isReservedTestAddress(u.email)) continue // erased accounts end in .invalid
    if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) continue // deactivated accounts
    emails.add(u.email)
  }
  return [...emails]
}

/** One person's usable e-mail address, as a list (empty for erased, deactivated or test accounts). */
export async function emailOf(db: Db, profileId: string): Promise<string[]> {
  const { data: p } = await db.from('profiles').select('auth_user_id').eq('id', profileId).maybeSingle()
  if (!p?.auth_user_id) return []
  const { data } = await db.auth.admin.getUserById(p.auth_user_id)
  const u = data?.user as { email?: string; banned_until?: string | null } | undefined
  if (!u?.email || isReservedTestAddress(u.email)) return []
  if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) return []
  return [u.email]
}

export async function customerLifecycleEmails(_job: unknown, db: Db): Promise<void> {
  if (!process.env.RESEND_API_KEY && process.env.VERCEL_ENV === 'production') return // nothing configured: try next hour
  const base = appUrl()
  if (!base) return // links need the app's address (NEXT_PUBLIC_APP_URL or the Vercel production URL)
  const url = (path: string) => `${base}${path}`
  const pending = await collectPending(db)
  if (!pending.length) return

  const { data: sent } = await db.from('customer_email_log').select('dedupe_key').in('dedupe_key', pending.map((p) => p.key))
  const done = new Set((sent ?? []).map((s: { dedupe_key: string }) => s.dedupe_key))
  const todo = pending.filter((p) => !done.has(p.key))

  const mailer = getEmailAdapter()
  for (const p of todo) {
    const { data: org } = await db.from('organisations').select('name, slug').eq('id', p.orgId).maybeSingle()
    if (!org) continue
    const to = p.toProfile ? await emailOf(db, p.toProfile) : await recipientsFor(db, p.orgId, p.includeSuspended)
    // Claim the key first: a second run (or a retry) can't send the same e-mail again.
    const { error: claim } = await db.from('customer_email_log').insert({ org_id: p.orgId, kind: p.kind, dedupe_key: p.key, recipients: to.length, status: to.length ? 'sent' : 'skipped', detail: to.length ? null : 'no owner or admin with a usable e-mail' })
    if (claim) continue // already claimed by another run
    if (!to.length) continue
    const msg = p.render(url, org.name, org.slug)
    let ok = 0
    const errors: string[] = []
    for (const addr of to) {
      const r = await mailer.sendEmail({ to: addr, subject: msg.subject, html: msg.html, text: msg.text })
      if (r.success) ok++
      else errors.push(r.error ?? 'send failed')
    }
    if (ok < to.length) {
      await db.from('customer_email_log').update({ status: ok ? 'partial' : 'skipped', recipients: ok, detail: errors[0]?.slice(0, 300) ?? null }).eq('dedupe_key', p.key)
    }
  }
}
