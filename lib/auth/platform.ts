// lib/auth/platform.ts
// REGrow: Platform-Level Authorization Guard, Super Admin MFA Verification & Audit Logger
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

export type PlatformRole = 'super_admin' | 'sales_rep' | 'finance_admin' | 'support_agent' | 'platform_admin' | 'auditor'

export interface PlatformUserRecord {
  id: string
  user_id: string
  role: PlatformRole
  is_active: boolean
  mfa_enforced: boolean
  created_at: string
  updated_at: string
}

export interface PlatformAuthContext {
  user: {
    id: string
    email?: string
  }
  profile: {
    id: string
    full_name: string
  }
  platformUser: PlatformUserRecord
  aal: 'aal1' | 'aal2'
}

/**
 * Server-authoritative platform authentication and role verification.
 * Verifies active platform membership and enforces MFA AAL2 assurance where required.
 */
export async function authenticatePlatformAdmin(
  allowedRoles: PlatformRole[] = ['super_admin'],
  requireMfaAal2: boolean = false
): Promise<
  | { success: true; auth: PlatformAuthContext }
  | { success: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorised. Platform authentication required.' },
        { status: 401 }
      ),
    }
  }

  const service = createServiceClient()

  // 1. Query platform_users table for active platform record
  const { data: platformUser, error: platError } = await service
    .from('platform_users')
    .select('id, user_id, role, is_active, mfa_enforced, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (platError || !platformUser) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not possess platform administration privileges.' },
        { status: 403 }
      ),
    }
  }

  const role = platformUser.role as PlatformRole
  if (!allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Forbidden. Role '${role}' lacks authority for this platform action.` },
        { status: 403 }
      ),
    }
  }

  // 2. Cryptographic MFA Assurance Level Verification
  let currentAal: 'aal1' | 'aal2' = 'aal1'
  try {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData?.currentLevel === 'aal2') {
      currentAal = 'aal2'
    }
  } catch (mfaErr) {
    console.warn('Unable to verify MFA assurance level via Supabase Auth:', mfaErr)
  }

  if (requireMfaAal2 && currentAal !== 'aal2') {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'MFA AAL2 Required: This administrative mutation requires an active Multi-Factor Authenticated session.',
          code: 'MFA_AAL2_REQUIRED',
        },
        { status: 403 }
      ),
    }
  }

  // 3. Resolve actor profile
  let { data: profile } = await service
    .from('profiles')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Platform Administrator'

    const { data: newProfile } = await service
      .from('profiles')
      .insert({ auth_user_id: user.id, full_name: fullName })
      .select('id, full_name')
      .single()

    profile = newProfile || { id: user.id, full_name: fullName }
  }

  return {
    success: true,
    auth: {
      user: { id: user.id, email: user.email },
      profile: { id: profile.id, full_name: profile.full_name },
      platformUser: platformUser as PlatformUserRecord,
      aal: currentAal,
    },
  }
}

/**
 * Append-only tamper-proof platform audit logger.
 * Writes directly via service role to ensure immutable audit log retention.
 * Fails visibly if audit log cannot be persisted.
 */
export async function logPlatformAction(params: {
  actorUserId: string
  actorRole: PlatformRole
  action: string
  targetEntityType: string
  targetEntityId: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Sanitize metadata: NEVER log service credentials, passwords, raw tokens or secrets
    const sanitizedMetadata: Record<string, unknown> = {}
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        const lowerKey = key.toLowerCase()
        if (
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('password') ||
          lowerKey.includes('credential') ||
          lowerKey.includes('key')
        ) {
          sanitizedMetadata[key] = '[REDACTED]'
        } else {
          sanitizedMetadata[key] = value
        }
      }
    }

    const service = createServiceClient()
    const { data, error } = await service
      .from('platform_audit_logs')
      .insert({
        actor_user_id: params.actorUserId,
        actor_role: params.actorRole,
        action: params.action,
        target_entity_type: params.targetEntityType,
        target_entity_id: params.targetEntityId,
        metadata: sanitizedMetadata as Json,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('CRITICAL AUDIT FAILURE: Failed to write to platform_audit_logs:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data.id }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown audit log error'
    console.error('CRITICAL AUDIT FAILURE: Unhandled exception in logPlatformAction:', err)
    return { success: false, error: errorMsg }
  }
}

/** Every platform role may open the console; what each can do inside is checked per action. */
export const CONSOLE_ROLES: PlatformRole[] = ['super_admin', 'platform_admin', 'support_agent', 'finance_admin', 'sales_rep', 'auditor']
/** Roles that may read the platform audit trail. */
export const PLATFORM_AUDIT_READERS: PlatformRole[] = ['super_admin', 'auditor']

export type ConsoleAccess =
  | { state: 'signed_out' }
  | { state: 'not_staff' }
  | { state: 'mfa_required'; role: PlatformRole }
  | { state: 'ok'; userId: string; email?: string; label: string; role: PlatformRole }

/**
 * For console PAGES (server components). Same checks as authenticatePlatformAdmin — active platform user,
 * and an MFA-verified (AAL2) session for every console screen — but returns a state for the page to render.
 */
export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { state: 'signed_out' }
  const service = createServiceClient()
  const { data: pu } = await service
    .from('platform_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!pu) return { state: 'not_staff' }
  const role = pu.role as PlatformRole
  let aal: string | null = null
  try {
    aal = (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel ?? null
  } catch {
    aal = null
  }
  if (aal !== 'aal2') return { state: 'mfa_required', role }
  const { data: profile } = await service.from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
  return { state: 'ok', userId: user.id, email: user.email, label: profile?.full_name || user.email || 'REGrow staff', role }
}
