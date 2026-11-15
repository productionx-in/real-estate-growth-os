#!/usr/bin/env node
// scripts/bootstrap-super-admin.mjs
// Production X: Secure Platform Super Admin Initial Bootstrap CLI
// Specification: One-time bootstrap, secret validation, fail-closed, no CLI secret bypass
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function bootstrapSuperAdmin() {
  console.log('--- Production X Platform Super Admin Bootstrap ---')

  // 1. Strict Environment Variable Validation
  // Never permit CLI arguments to bypass the bootstrap secret or email
  const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL
  const bootstrapSecret = process.env.PLATFORM_BOOTSTRAP_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!adminEmail) {
    console.error('FATAL ERROR: Missing required INITIAL_SUPER_ADMIN_EMAIL environment variable.')
    process.exit(1)
  }

  if (!bootstrapSecret) {
    console.error('FATAL ERROR: Missing required PLATFORM_BOOTSTRAP_SECRET environment variable.')
    process.exit(1)
  }

  if (bootstrapSecret.length < 32) {
    console.error('SECURITY ERROR: PLATFORM_BOOTSTRAP_SECRET must be at least 32 characters in length.')
    process.exit(1)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('FATAL ERROR: Missing Supabase database credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 2. ONE-TIME BOOTSTRAP CHECK: Fail closed if ANY super_admin already exists
  console.log('Verifying platform initialization status...')
  const { data: existingSuperAdmins, error: adminCheckErr } = await supabase
    .from('platform_users')
    .select('id, user_id, role, is_active')
    .eq('role', 'super_admin')
    .eq('is_active', true)

  if (adminCheckErr) {
    console.error('FATAL ERROR checking existing platform administrators:', adminCheckErr.message)
    process.exit(1)
  }

  if (existingSuperAdmins && existingSuperAdmins.length > 0) {
    console.error('SECURITY ALERT: Platform has already been bootstrapped. Super Admin exists.')
    console.error('One-time bootstrap cannot be re-executed. Future administrative access must be managed by an existing Super Admin.')
    process.exit(1)
  }

  // 3. Exact target identity resolution via paginated search
  console.log(`Resolving exact identity for: ${adminEmail}...`)
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
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
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
    console.log(`User ${adminEmail} does not exist in auth.users. Creating account...`)
    const tempPassword = crypto.randomBytes(24).toString('base64') + '!A1'
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Platform Super Admin' },
    })

    if (createErr || !newUser?.user) {
      console.error('FATAL ERROR creating auth user:', createErr?.message)
      process.exit(1)
    }

    authUser = newUser.user
    console.log(`Auth identity created with ID: ${authUser.id}`)
  } else {
    console.log(`Found existing auth identity: ${authUser.id}`)
  }

  // 4. Resolve or create profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (!profile) {
    const { data: newProf, error: profErr } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: authUser.id,
        full_name: 'Platform Super Admin',
      })
      .select('id')
      .single()

    if (profErr) {
      console.error('FATAL ERROR creating profile:', profErr.message)
      process.exit(1)
    }
    profile = newProf
  }

  // 5. Insert new platform_user record as super_admin with mandatory MFA
  console.log('Establishing platform super_admin user record...')
  const { data: newPlatUser, error: insertErr } = await supabase
    .from('platform_users')
    .insert({
      user_id: authUser.id,
      role: 'super_admin',
      is_active: true,
      mfa_enforced: true,
    })
    .select('id')
    .single()

  if (insertErr || !newPlatUser) {
    console.error('FATAL ERROR inserting platform_user:', insertErr?.message)
    process.exit(1)
  }

  const platformUserId = newPlatUser.id

  // 6. Generate 10 emergency offline MFA recovery codes
  console.log('Generating 10 emergency MFA offline recovery codes...')
  const rawCodes = []
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase()
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
    const codeHash = crypto.createHash('sha256').update(formatted).digest('hex')

    const { error: codeErr } = await supabase.from('platform_mfa_recovery_codes').insert({
      platform_user_id: platformUserId,
      code_hash: codeHash,
      is_used: false,
    })

    if (codeErr) {
      console.error('FATAL ERROR storing MFA recovery codes:', codeErr.message)
      process.exit(1)
    }

    rawCodes.push(formatted)
  }

  // 7. Write immutable audit log entry - NEVER log the bootstrap secret
  console.log('Recording immutable platform audit log...')
  const { error: auditErr } = await supabase.from('platform_audit_logs').insert({
    actor_user_id: authUser.id,
    actor_role: 'super_admin',
    action: 'platform.bootstrap_super_admin',
    target_entity_type: 'platform_user',
    target_entity_id: platformUserId,
    metadata: {
      email: adminEmail,
      mfa_enforced: true,
      recovery_codes_generated: 10,
      bootstrap_method: 'ENVIRONMENT_SECRET_INITIALIZATION',
    },
  })

  if (auditErr) {
    console.error('FATAL ERROR: Failed to record platform bootstrap audit log:', auditErr.message)
    process.exit(1)
  }

  console.log('\n======================================================')
  console.log('SUCCESS: Platform Super Admin successfully bootstrapped!')
  console.log(`User ID:          ${authUser.id}`)
  console.log(`Email:            ${adminEmail}`)
  console.log(`Platform Role:    super_admin`)
  console.log(`MFA Enforced:     true (AAL2 Required)`)
  console.log('\nEMERGENCY MFA RECOVERY CODES (Store securely offline):')
  rawCodes.forEach((c, idx) => console.log(`  ${idx + 1}. ${c}`))
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
