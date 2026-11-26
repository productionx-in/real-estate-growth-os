#!/usr/bin/env node
// scripts/bootstrap-super-admin.mjs
// RE: Secure Platform Super Admin Initial Bootstrap CLI
// Specification:
// - Atomic database-level one-time lock (pg_advisory_xact_lock)
// - Fails closed if active super_admin already exists
// - Required INITIAL_SUPER_ADMIN_EMAIL and PLATFORM_BOOTSTRAP_SECRET (min 32 chars)
// - Exact email match verification against auth.users identity
// - Verified TOTP factor confirmation belonging strictly to the target user before assignment
// - Atomic assignment and audit record creation inside single database transaction
// - Explicit recovery guidance for existing authorised Super Admins
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Node.js 20 has no native WebSocket, and @supabase/supabase-js constructs its realtime client
// eagerly, throwing "Node.js detected but native WebSocket not found" before any work starts.
// This CLI never opens a realtime channel, so an inert transport is supplied only when
// native WebSocket is unavailable. On Node.js 22+ the default behaviour is unchanged.
class UnusedRealtimeTransport {
  constructor() {
    throw new Error('Realtime is not used by this CLI')
  }
}
const realtimeCompat = globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }

async function bootstrapSuperAdmin() {
  console.log('--- RE Platform Super Admin Bootstrap ---')

  // 1. Strict Environment Variable Validation
  const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL
  const bootstrapSecret = process.env.PLATFORM_BOOTSTRAP_SECRET
  const adminPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD
  const totpCode = process.env.INITIAL_SUPER_ADMIN_TOTP_CODE
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!adminEmail) {
    console.error('FATAL ERROR: Missing required INITIAL_SUPER_ADMIN_EMAIL environment variable.')
    process.exit(1)
  }

  const normalizedTargetEmail = adminEmail.trim().toLowerCase()

  if (!bootstrapSecret) {
    console.error('FATAL ERROR: Missing required PLATFORM_BOOTSTRAP_SECRET environment variable.')
    process.exit(1)
  }

  if (bootstrapSecret.length < 32) {
    console.error('SECURITY ERROR: PLATFORM_BOOTSTRAP_SECRET must be at least 32 characters in length.')
    process.exit(1)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'FATAL ERROR: Missing Supabase database credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
    )
    process.exit(1)
  }

  if (!anonKey) {
    console.error(
      'FATAL ERROR: Missing Supabase client key (NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY) required for live target user authentication assurance.'
    )
    process.exit(1)
  }

  if (!adminPassword || !totpCode) {
    console.error('SECURITY ERROR: Bootstrap requires live authentication and authenticator assurance.')
    console.error('Static database factor checks alone are insufficient to prove active account and authenticator possession at bootstrap time.')
    console.error('Please supply INITIAL_SUPER_ADMIN_PASSWORD and the current 6-digit INITIAL_SUPER_ADMIN_TOTP_CODE.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...realtimeCompat,
  })

  // 2. Resolve exact target identity in auth.users via paginated search
  console.log(`Resolving exact identity for: ${normalizedTargetEmail}...`)
  let authUser = null
  let page = 1
  const perPage = 100
  let hasMore = true

  while (hasMore) {
    const { data: userPage, error: listErr } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (listErr) {
      console.error('FATAL ERROR querying auth.users:', listErr.message)
      process.exit(1)
    }

    const found = userPage?.users?.find(
      (u) => u.email?.trim().toLowerCase() === normalizedTargetEmail
    )

    if (found) {
      authUser = found
      break
    }

    if (!userPage?.users || userPage.users.length < perPage) {
      hasMore = false
    } else {
      page++
    }
  }

  if (!authUser) {
    console.error(`FATAL ERROR: Target user '${normalizedTargetEmail}' was not found in auth.users.`)
    console.error('The target user account must be created and enrolled with MFA before bootstrap.')
    process.exit(1)
  }

  // Exact target verification
  if (authUser.email?.trim().toLowerCase() !== normalizedTargetEmail) {
    console.error('SECURITY ERROR: Resolved Auth user email does not strictly match INITIAL_SUPER_ADMIN_EMAIL.')
    process.exit(1)
  }

  console.log(`Located verified auth identity: ${authUser.id}`)

  // 3. Cryptographic Live Authentication & Authenticator (AAL2) Assurance
  // The operator cannot silently elevate an unverified user. The target user must authenticate live
  // with primary credentials and submit a valid 6-digit TOTP challenge code to establish active AAL2.
  console.log('Establishing live user client for target authentication assurance...')
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...realtimeCompat,
  })

  console.log(`Authenticating target user live via primary credentials: ${normalizedTargetEmail}...`)
  const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
    email: normalizedTargetEmail,
    password: adminPassword,
  })

  if (signInErr || !signInData?.user) {
    console.error('AUTHENTICATION ASSURANCE FAILED: Target user primary password authentication failed:', signInErr?.message)
    process.exit(1)
  }

  if (signInData.user.id !== authUser.id) {
    console.error('SECURITY VIOLATION: Authenticated user ID does not match resolved target user ID.')
    process.exit(1)
  }

  console.log('Target primary credentials verified. Querying enrolled MFA factors...')
  const { data: factorsData, error: mfaError } = await userClient.auth.mfa.listFactors()

  if (mfaError) {
    console.error('FATAL ERROR querying user MFA factors:', mfaError.message)
    process.exit(1)
  }

  const verifiedTotpFactor = factorsData?.totp?.find((f) => f.status === 'verified')

  if (!verifiedTotpFactor) {
    console.error('SECURITY VIOLATION: Target user does not have an active verified TOTP MFA factor enrolled.')
    console.error('RE requires verified TOTP MFA before platform Super Admin assignment.')
    console.error('Please enroll and verify an authenticator factor in Supabase Auth before bootstrapping.')
    process.exit(1)
  }

  console.log(`Challenging authenticator factor (${verifiedTotpFactor.id}) with live 6-digit code...`)
  const { data: challengeData, error: challengeErr } = await userClient.auth.mfa.challengeAndVerify({
    factorId: verifiedTotpFactor.id,
    code: totpCode.trim(),
  })

  if (challengeErr) {
    console.error('AUTHENTICATOR ASSURANCE FAILED: Live TOTP verification failed:', challengeErr.message)
    process.exit(1)
  }

  const { data: aalData } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel !== 'aal2') {
    console.error(`SECURITY VIOLATION: Session failed to achieve AAL2 assurance (level: ${aalData?.currentLevel || 'aal1'}).`)
    process.exit(1)
  }

  console.log('SUCCESS: Cryptographic AAL2 assurance confirmed live. Target user has proven account and authenticator possession.')

  // 4. ATOMIC DATABASE-LEVEL ONE-TIME BOOTSTRAP STORED PROCEDURE
  // Acquires exclusive advisory transaction lock and fails closed if super_admin already exists
  // Atomically commits platform_admin assignment and platform_audit_logs record
  console.log('Executing atomic database-level bootstrap under exclusive advisory lock...')
  const { data: bootstrapResult, error: rpcErr } = await supabase.rpc(
    'bootstrap_initial_super_admin_atomic',
    {
      p_target_user_id: authUser.id,
      p_target_email: normalizedTargetEmail,
      p_has_verified_totp: true,
    }
  )

  if (rpcErr) {
    console.error('FATAL ERROR in bootstrap stored procedure:', rpcErr.message)
    if (rpcErr.message.includes('already exist')) {
      console.log('\n[RECOVERY GUIDANCE]')
      console.log('An active Super Admin already exists in the system. The initial bootstrap door is locked.')
      console.log('To manage platform administrators, have an existing Super Admin use the Platform Admin API.')
    } else if (rpcErr.message.includes('Privilege escalation rejected')) {
      console.log('\n[RECOVERY GUIDANCE]')
      console.log('Target user is already an existing platform administrator.')
      console.log('To change administrator roles, an authorized Super Admin must update roles via the Platform Admin API.')
    }
    process.exit(1)
  }

  const result = Array.isArray(bootstrapResult) ? bootstrapResult[0] : bootstrapResult
  if (!result || result.status !== 'bootstrapped') {
    console.error('BOOTSTRAP FAILED: Database rejected initial bootstrap assignment.')
    process.exit(1)
  }

  console.log('\n======================================================')
  console.log('SUCCESS: Platform Super Admin successfully bootstrapped!')
  console.log(`User ID:          ${authUser.id}`)
  console.log(`Email:            ${normalizedTargetEmail}`)
  console.log(`Platform Admin ID: ${result.admin_id}`)
  console.log(`Audit Record ID:  ${result.audit_id}`)
  console.log(`Platform Role:    super_admin`)
  console.log(`MFA Verified:     true (AAL2 Active)`)
  console.log('======================================================\n')
}

// Execute if run directly
if (process.argv[1]?.endsWith('bootstrap-super-admin.mjs')) {
  bootstrapSuperAdmin().catch((err) => {
    console.error('Unhandled fatal error in bootstrap script:', err)
    process.exit(1)
  })
}

export { bootstrapSuperAdmin }
