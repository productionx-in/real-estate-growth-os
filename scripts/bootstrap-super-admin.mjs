#!/usr/bin/env node
// scripts/bootstrap-super-admin.mjs
// Production X: Secure Platform Super Admin Initial Bootstrap CLI
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function bootstrapSuperAdmin() {
  console.log('--- Production X Platform Super Admin Bootstrap ---')

  const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL
  const bootstrapSecret = process.env.PLATFORM_BOOTSTRAP_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!adminEmail || !bootstrapSecret) {
    console.error('ERROR: Missing required environment variables.')
    console.error('Required:')
    console.error('  INITIAL_SUPER_ADMIN_EMAIL   (e.g., security@productionx.ai)')
    console.error('  PLATFORM_BOOTSTRAP_SECRET   (Secret authorization token for initial setup)')
    console.error('  NEXT_PUBLIC_SUPABASE_URL    (Supabase project URL)')
    console.error('  SUPABASE_SERVICE_ROLE_KEY   (Supabase service-role API key)')
    process.exit(1)
  }

  if (bootstrapSecret.length < 32) {
    console.error('SECURITY ERROR: PLATFORM_BOOTSTRAP_SECRET must be at least 32 characters in length.')
    process.exit(1)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('ERROR: Missing Supabase database credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Searching for Supabase Auth identity: ${adminEmail}...`)
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    console.error('ERROR querying auth.users:', listErr.message)
    process.exit(1)
  }

  let authUser = userList?.users?.find(
    (u) => u.email?.toLowerCase() === adminEmail.toLowerCase()
  )

  if (!authUser) {
    console.log(`User ${adminEmail} does not exist in auth.users. Creating account...`)
    const tempPassword = crypto.randomBytes(24).toString('base64') + '!A1'
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Platform Super Admin' },
    })

    if (createErr || !newUser.user) {
      console.error('ERROR creating auth user:', createErr?.message)
      process.exit(1)
    }

    authUser = newUser.user
    console.log(`Auth identity created with ID: ${authUser.id}`)
    console.log(`Temporary setup password generated. Super Admin must reset password and enroll MFA.`)
  } else {
    console.log(`Found existing auth identity: ${authUser.id}`)
  }

  // Ensure profile exists
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
      console.error('ERROR creating profile:', profErr.message)
      process.exit(1)
    }
    profile = newProf
  }

  // Create or elevate platform_users record to super_admin
  const { data: existingPlatformUser } = await supabase
    .from('platform_users')
    .select('id, role, is_active')
    .eq('user_id', authUser.id)
    .maybeSingle()

  let platformUserId = existingPlatformUser?.id

  if (existingPlatformUser) {
    console.log(`Updating existing platform_user record to super_admin...`)
    const { error: updateErr } = await supabase
      .from('platform_users')
      .update({
        role: 'super_admin',
        is_active: true,
        mfa_enforced: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingPlatformUser.id)

    if (updateErr) {
      console.error('ERROR updating platform_users:', updateErr.message)
      process.exit(1)
    }
  } else {
    console.log(`Inserting new platform_user record as super_admin...`)
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
      console.error('ERROR inserting platform_user:', insertErr?.message)
      process.exit(1)
    }
    platformUserId = newPlatUser.id
  }

  // Generate 10 offline recovery codes
  console.log('Generating 10 emergency MFA offline recovery codes...')
  const rawCodes = []
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase()
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
    const codeHash = crypto.createHash('sha256').update(formatted).digest('hex')

    await supabase.from('platform_mfa_recovery_codes').insert({
      platform_user_id: platformUserId,
      code_hash: codeHash,
      is_used: false,
    })
    rawCodes.push(formatted)
  }

  // Write immutable audit log entry
  await supabase.from('platform_audit_logs').insert({
    actor_user_id: authUser.id,
    actor_role: 'super_admin',
    action: 'platform.bootstrap_super_admin',
    target_entity_type: 'platform_user',
    target_entity_id: platformUserId,
    metadata: {
      email: adminEmail,
      mfa_enforced: true,
      recovery_codes_generated: 10,
    },
  })

  console.log('\n======================================================')
  console.log('SUCCESS: Platform Super Admin successfully bootstrapped!')
  console.log(`User ID:          ${authUser.id}`)
  console.log(`Email:            ${adminEmail}`)
  console.log(`Platform Role:    super_admin`)
  console.log(`MFA Enforced:     true`)
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
