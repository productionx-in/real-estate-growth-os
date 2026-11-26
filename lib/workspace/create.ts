// lib/workspace/create.ts — may this signed-in person create a new organisation workspace? Server-only.
// Today only RE by PX super admins can (POST /api/orgs refuses everyone else); self-service sign-up will extend
// this. The page uses it only to decide what to show — the API checks again.
import { createServiceClient } from '@/lib/supabase/server'

export async function canCreateOrganisation(authUserId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from('platform_users').select('role, is_active').eq('user_id', authUserId).eq('is_active', true).maybeSingle()
  return data?.role === 'super_admin'
}
