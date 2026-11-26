// lib/platform/people.ts — RE by PX staff managing the people who use customer workspaces (server only).
//
// Two levels, deliberately separate:
//  * Workspace access (Platform Owner or platform admin): suspend or restore one person's membership of one
//    workspace. Their open leads go to the unassigned queue; when it was their last active workspace they are
//    signed out. The customer sees the change in their own audit log, attributed to RE by PX.
//  * Sign-in account (Platform Owner only): block or unblock signing in to RE by PX at all, or delete the account.
//    Deleting removes them from every workspace and erases their personal details and sign-in for good; work they
//    did inside a customer's workspace stays with that customer as "Deleted user". Never staff; never a sole owner.
// Every action needs a reason and is written to the platform audit log. Staff accounts are managed on the
// Staff page, never here. Nobody can act on their own account.
import { createServiceClient } from '@/lib/supabase/server'
import { logPlatformAction, type PlatformRole } from '@/lib/auth/platform'
import { recordOrgAudit } from '@/lib/dal/org-audit'
import { revokeSessionsIfNoActiveMembership } from '@/lib/dal/invitations'

type Result<T = unknown> = { success: true; data: T } | { success: false; error: string; status: number }
const fail = (error: string, status = 400): Result<never> => ({ success: false, error, status })
export interface StaffActor { userId: string; role: PlatformRole; label: string }

export const MEMBER_ADMINS: PlatformRole[] = ['super_admin', 'platform_admin']
export const ACCOUNT_ADMINS: PlatformRole[] = ['super_admin']
const FOREVER = '876000h' // ~100 years: Supabase's way of saying "blocked until unblocked"

export interface PersonRow {
  memberId: string; profileId: string; userId: string | null; name: string; email: string; role: string; status: string
  lastSignIn: string | null; blocked: boolean; staff: boolean
}

/** The people in one workspace, with their sign-in state. Account details only — no business data. */
export async function listWorkspacePeople(orgId: string): Promise<PersonRow[]> {
  const db = createServiceClient()
  const { data: members } = await db.from('org_members').select('id, profile_id, role, status').eq('org_id', orgId).order('joined_at', { ascending: true })
  const rows: PersonRow[] = []
  for (const m of members ?? []) {
    const { data: p } = await db.from('profiles').select('auth_user_id, full_name').eq('id', m.profile_id).maybeSingle()
    const acct = p?.auth_user_id ? await accountState(p.auth_user_id) : null
    rows.push({
      memberId: m.id, profileId: m.profile_id, userId: p?.auth_user_id ?? null, name: p?.full_name || acct?.email || 'Unnamed',
      email: acct?.email ?? '—', role: m.role, status: m.status, lastSignIn: acct?.lastSignIn ?? null, blocked: acct?.blocked ?? false, staff: acct?.staff ?? false,
    })
  }
  return rows
}

export interface AccountView {
  userId: string; email: string; name: string; lastSignIn: string | null; createdAt: string | null; blocked: boolean; staff: boolean
  workspaces: { orgId: string; name: string; role: string; status: string }[]
}

/** One sign-in account by e-mail, with the workspaces it belongs to. */
export async function findAccount(email: string): Promise<AccountView | null> {
  const db = createServiceClient()
  const { data: id } = await db.rpc('platform_account_id_by_email' as never, { p_email: email.trim().toLowerCase() } as never)
  if (!id) return null
  return getAccount(id as string)
}

export async function getAccount(userId: string): Promise<AccountView | null> {
  const db = createServiceClient()
  const acct = await accountState(userId)
  if (!acct) return null
  const { data: p } = await db.from('profiles').select('id, full_name').eq('auth_user_id', userId).maybeSingle()
  const workspaces: AccountView['workspaces'] = []
  if (p) {
    const { data: ms } = await db.from('org_members').select('org_id, role, status').eq('profile_id', p.id)
    for (const m of ms ?? []) {
      const { data: o } = await db.from('organisations').select('name').eq('id', m.org_id).maybeSingle()
      workspaces.push({ orgId: m.org_id, name: o?.name ?? '—', role: m.role, status: m.status })
    }
  }
  return { userId, email: acct.email, name: p?.full_name || acct.email, lastSignIn: acct.lastSignIn, createdAt: acct.createdAt, blocked: acct.blocked, staff: acct.staff, workspaces }
}

async function accountState(userId: string) {
  const db = createServiceClient()
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error || !data?.user) return null
  const u = data.user as { email?: string; last_sign_in_at?: string | null; created_at?: string; banned_until?: string | null }
  const { data: staff } = await db.from('platform_users').select('id').eq('user_id', userId).maybeSingle()
  return {
    email: u.email ?? '—', lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at ?? null,
    blocked: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()), staff: Boolean(staff),
  }
}

async function staffProfileId(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from('profiles').select('id').eq('auth_user_id', userId).maybeSingle()
  return data?.id ?? null
}

/** Suspend or restore one person's access to one workspace. */
export async function setMemberAccess(actor: StaffActor, orgId: string, memberId: string, action: 'suspend' | 'restore', reason: string): Promise<Result<{ status: string; leadsUnassigned: number; signedOut: boolean }>> {
  if (!MEMBER_ADMINS.includes(actor.role)) return fail('Not permitted.', 403)
  const db = createServiceClient()
  const { data: m } = await db.from('org_members').select('id, profile_id, role, status').eq('id', memberId).eq('org_id', orgId).maybeSingle()
  if (!m) return fail('This person is not in this workspace.', 404)
  const { data: p } = await db.from('profiles').select('auth_user_id, full_name').eq('id', m.profile_id).maybeSingle()
  if (p?.auth_user_id === actor.userId) return fail('You cannot change your own access.', 403)
  const { data: org } = await db.from('organisations').select('lifecycle_state').eq('id', orgId).maybeSingle()
  const actorProfile = await staffProfileId(actor.userId)
  let leadsUnassigned = 0
  let signedOut = false

  if (action === 'suspend') {
    if (m.status !== 'active') return fail('This person’s access is already off.', 409)
    if (m.role === 'owner') {
      const { count } = await db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('role', 'owner').eq('status', 'active')
      if ((count ?? 0) <= 1) return fail('This is the workspace’s only owner. Make someone else an owner first, or deactivate the whole workspace.', 409)
    }
    const { data: open } = await db.from('leads').select('id').eq('org_id', orgId).eq('assigned_to', m.profile_id).not('status', 'in', '("booked","lost","junk")')
    const ids = (open ?? []).map((l: { id: string }) => l.id)
    if (ids.length) {
      const { error } = await db.from('leads').update({ assigned_to: null, updated_at: new Date().toISOString() }).in('id', ids)
      if (error) return fail(`Could not move their leads: ${error.message}`)
      leadsUnassigned = ids.length
    }
    const { error } = await db.from('org_members').update({ status: 'deactivated', deactivated_at: new Date().toISOString(), deactivated_by: actorProfile }).eq('id', m.id)
    if (error) return fail(error.message)
    signedOut = await revokeSessionsIfNoActiveMembership(m.profile_id)
  } else {
    if (m.status === 'active') return fail('This person already has access.', 409)
    if (org?.lifecycle_state === 'deactivated') return fail('The workspace itself is deactivated. Reactivate the workspace first.', 409)
    const { data: sub } = await db.from('org_subscriptions').select('included_seats, additional_seats').eq('org_id', orgId).maybeSingle()
    if (sub && m.role !== 'readonly') {
      const { count } = await db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active').neq('role', 'readonly')
      if ((count ?? 0) >= (sub.included_seats ?? 0) + (sub.additional_seats ?? 0)) return fail('All paid seats are in use. Free a seat or add seats first.', 409)
    }
    const { error } = await db.from('org_members').update({ status: 'active', deactivated_at: null, deactivated_by: null }).eq('id', m.id)
    if (error) return fail(error.message)
  }

  const what = action === 'suspend' ? 'member.deactivated' : 'member.reactivated'
  await recordOrgAudit({
    orgId, action: what, actorKind: 'platform', actorUserId: actor.userId, actorProfileId: actorProfile, actorLabel: `${actor.label} (RE by PX)`,
    targetType: 'member', targetId: m.id, metadata: { profile_id: m.profile_id, role: m.role, reason, leads_unassigned: leadsUnassigned, sessions_revoked: signedOut },
  })
  await logPlatformAction({ actorUserId: actor.userId, actorRole: actor.role, action: `customer_${what}`, targetEntityType: 'org_members', targetEntityId: m.id, metadata: { org_id: orgId, name: p?.full_name ?? null, role: m.role, reason, leads_unassigned: leadsUnassigned } })
  return { success: true, data: { status: action === 'suspend' ? 'deactivated' : 'active', leadsUnassigned, signedOut } }
}

/** Block, unblock or delete a customer's sign-in account. Platform Owner only. */
export async function changeAccount(actor: StaffActor, userId: string, action: 'block' | 'unblock' | 'delete', reason: string): Promise<Result<{ action: string }>> {
  if (!ACCOUNT_ADMINS.includes(actor.role)) return fail('Only the Platform Owner can block or delete sign-in accounts.', 403)
  if (userId === actor.userId) return fail('You cannot change your own account.', 403)
  const db = createServiceClient()
  const acct = await getAccount(userId)
  if (!acct) return fail('Account not found.', 404)
  if (acct.staff) return fail('This is a RE by PX staff account. Manage it on the Staff page.', 409)

  if (action === 'block' || action === 'unblock') {
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: action === 'block' ? FOREVER : 'none' } as never)
    if (error) return fail(`Could not ${action} the account: ${error.message}`)
    if (action === 'block') await db.rpc('revoke_user_sessions', { p_auth_user: userId })
  } else {
    // Permanent delete, like closing a social account: they leave every workspace, their personal details are
    // erased and the sign-in is gone. Work they did inside a customer's workspace stays with that customer.
    const p = await db.from('profiles').select('id').eq('auth_user_id', userId).maybeSingle()
    const profileId = p.data?.id as string | undefined
    for (const w of acct.workspaces.filter((w) => w.role === 'owner' && w.status === 'active')) {
      const { count } = await db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', w.orgId).eq('role', 'owner').eq('status', 'active')
      if ((count ?? 0) <= 1) return fail(`${acct.name} is the only owner of ${w.name}. Make someone else an owner there first, or deactivate or delete that workspace.`, 409)
    }
    await db.rpc('revoke_user_sessions', { p_auth_user: userId })
    if (profileId) {
      const { error } = await db.from('org_members').delete().eq('profile_id', profileId)
      if (error) return fail(`Could not remove them from their workspaces: ${error.message}`)
    }
    const { error: delErr } = await db.auth.admin.deleteUser(userId)
    if (delErr) {
      // Their name is on records a workspace keeps (lead history, assignments): erase the person, keep the record.
      if (profileId) await db.from('profiles').update({ full_name: 'Deleted user', phone: null, avatar_url: null, updated_at: new Date().toISOString() }).eq('id', profileId)
      const { error } = await db.auth.admin.updateUserById(userId, {
        email: `deleted-${userId}@deleted.invalid`, email_confirm: true, user_metadata: { full_name: 'Deleted user' }, ban_duration: FOREVER,
        password: unusablePassword(),
      } as never)
      if (error) return fail(`Could not erase the account: ${error.message}`)
    }
  }
  await logPlatformAction({ actorUserId: actor.userId, actorRole: actor.role, action: `account.${action === 'delete' ? 'deleted' : action === 'block' ? 'blocked' : 'unblocked'}`, targetEntityType: 'auth_users', targetEntityId: userId, metadata: { email: action === 'delete' ? maskEmail(acct.email) : acct.email, reason, workspaces_left: action === 'delete' ? acct.workspaces.length : undefined } })
  return { success: true, data: { action } }
}

/** "ravi@acme.com" -> "ra***@acme.com": enough to recognise in the audit log, not enough to keep the person. */
export function maskEmail(email: string) {
  const [u, d] = email.split('@')
  return d ? `${u.slice(0, 2)}***@${d}` : '***'
}

/** A long random password that meets the strictest Supabase policy (lower, upper, digit, symbol). Never shown or
 *  stored: it only makes sure the old password stops working. */
export function unusablePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = Array.from(bytes, (b) => b.toString(36)).join('')
  return `Xx9!${body}#Zq7`
}
