// lib/platform/route-auth.ts — staff API guard: an active platform role in the allowed list and an MFA-verified
// (AAL2) session, then the acting staff member for lib/platform/portal.ts (which checks the role again).
import { authenticatePlatformAdmin, type PlatformRole } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { CAN, type Actor, type Db } from './portal'

export async function staffActor(what: keyof typeof CAN) {
  const auth = await authenticatePlatformAdmin([...CAN[what]] as PlatformRole[], true)
  if (!auth.success) return auth
  const actor: Actor & { label: string } = { userId: auth.auth.user.id, role: auth.auth.platformUser.role as Actor['role'], label: auth.auth.profile.full_name }
  return { success: true as const, actor, db: createServiceClient() as unknown as Db }
}
