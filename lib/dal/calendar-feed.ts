// lib/dal/calendar-feed.ts — private calendar subscription links (calendar_feeds, 20260112). The secret is 256
// random bits shown once; only its SHA-256 is stored. A link works only while its owner is an active member of the
// workspace, and shows only that person's own follow-ups and site visits.
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'

// calendar_feeds is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feeds = () => (createServiceClient() as unknown as { from: (t: string) => any }).from('calendar_feeds')
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function hasFeed(orgId: string, profileId: string): Promise<boolean> {
  const { data } = await feeds().select('id').eq('org_id', orgId).eq('profile_id', profileId).maybeSingle()
  return !!data
}

/** A new link (replacing any earlier one, which stops working). Returns the secret token. */
export async function issueFeed(orgId: string, profileId: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('base64url')
  const { error } = await feeds().upsert({ org_id: orgId, profile_id: profileId, token_hash: hash(token), created_at: new Date().toISOString(), last_used_at: null }, { onConflict: 'org_id,profile_id' })
  return error ? null : token
}

export async function revokeFeed(orgId: string, profileId: string): Promise<void> {
  await feeds().delete().eq('org_id', orgId).eq('profile_id', profileId)
}

/** Whose calendar a link opens, or null (unknown link, or the person is no longer an active member). */
export async function resolveFeed(token: string): Promise<{ orgId: string; profileId: string; orgSlug: string; orgName: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const { data: feed } = await feeds().select('id, org_id, profile_id').eq('token_hash', hash(token)).maybeSingle()
  if (!feed) return null
  const db = createServiceClient()
  const [{ data: member }, { data: org }] = await Promise.all([
    db.from('org_members').select('status').eq('org_id', feed.org_id).eq('profile_id', feed.profile_id).maybeSingle(),
    db.from('organisations').select('slug, name').eq('id', feed.org_id).maybeSingle(),
  ])
  if (!member || member.status !== 'active' || !org) return null
  await feeds().update({ last_used_at: new Date().toISOString() }).eq('id', feed.id)
  return { orgId: feed.org_id, profileId: feed.profile_id, orgSlug: org.slug, orgName: org.name }
}
