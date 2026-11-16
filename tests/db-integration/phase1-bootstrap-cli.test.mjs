// tests/db-integration/phase1-bootstrap-cli.test.mjs
// Production X — Real Supabase Auth Live AAL2 & Bootstrap CLI Integration Tests
// Exercises the live Supabase Auth service and the actual scripts/bootstrap-super-admin.mjs CLI
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

// Node.js 20 has no native WebSocket, and @supabase/supabase-js constructs its realtime client
// eagerly, throwing "Node.js detected but native WebSocket not found" before any work starts.
// This test suite never opens a realtime channel, so an inert transport is supplied only when
// native WebSocket is unavailable. On Node.js 22+ the default behaviour is unchanged.
class UnusedRealtimeTransport {
  constructor() {
    throw new Error('Realtime is not used by this test suite')
  }
}
const realtimeCompat = globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }

const execFileAsync = promisify(execFile)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
const bootstrapSecret = 'test-secret-at-least-32-chars-long-bootstrap-security-prod-x'

// RFC 6238 TOTP Token Generator
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const output = []
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase())
    if (val === -1) continue
    value = (value << 5) | val
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

function generateTotpCode(secret, timeStepOffset = 0) {
  const key = base32Decode(secret)
  const epoch = Math.floor(Date.now() / 1000)
  const timeStep = Math.floor(epoch / 30) + timeStepOffset

  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(timeStep))

  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return (codeInt % 1000000).toString().padStart(6, '0')
}

async function runBootstrapCliTests() {
  console.log('===================================================================')
  console.log('STARTING REAL SUPABASE AUTH LIVE AAL2 & BOOTSTRAP CLI TEST SUITE')
  console.log(`Supabase Auth Endpoint: ${supabaseUrl}`)
  console.log('===================================================================\n')

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...realtimeCompat,
  })

  // 1. Setup Isolated Target User in Supabase Auth
  const targetEmail = `bootstrap.superadmin.${Date.now()}@productionx.test`
  const targetPassword = 'VerySecureBootstrapPassword2026!#'

  console.log(`Creating fresh target user in Supabase Auth: ${targetEmail}...`)
  const { data: userData, error: createErr } = await adminClient.auth.admin.createUser({
    email: targetEmail,
    password: targetPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Initial Super Admin' },
  })

  if (createErr || !userData.user) {
    console.error('FATAL: Failed to create target user in Supabase Auth:', createErr)
    process.exit(1)
  }

  const targetUserId = userData.user.id
  console.log(`Created target user: ${targetUserId}`)

  // Create user client to authenticate as target user
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...realtimeCompat,
  })

  // 2. Test Failed Authentication: Wrong Primary Password on CLI
  console.log('\n--- Test 1: Failed Primary Authentication Assurance ---')
  try {
    await execFileAsync('node', ['scripts/bootstrap-super-admin.mjs'], {
      env: {
        ...process.env,
        INITIAL_SUPER_ADMIN_EMAIL: targetEmail,
        INITIAL_SUPER_ADMIN_PASSWORD: 'wrong_password_attempt',
        INITIAL_SUPER_ADMIN_TOTP_CODE: '123456',
        PLATFORM_BOOTSTRAP_SECRET: bootstrapSecret,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    })
    assert.fail('Bootstrap CLI must reject invalid primary password')
  } catch (err) {
    assert.match(err.stderr || err.stdout, /AUTHENTICATION ASSURANCE FAILED|Invalid login credentials/)
    console.log('✓ Test 1 Passed: Wrong primary password strictly rejected with AUTHENTICATION ASSURANCE FAILED')
  }

  // 3. Test Missing Factor: Target user has not enrolled TOTP
  console.log('\n--- Test 2: Missing TOTP Factor Assurance ---')
  try {
    await execFileAsync('node', ['scripts/bootstrap-super-admin.mjs'], {
      env: {
        ...process.env,
        INITIAL_SUPER_ADMIN_EMAIL: targetEmail,
        INITIAL_SUPER_ADMIN_PASSWORD: targetPassword,
        INITIAL_SUPER_ADMIN_TOTP_CODE: '123456',
        PLATFORM_BOOTSTRAP_SECRET: bootstrapSecret,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    })
    assert.fail('Bootstrap CLI must reject user without verified TOTP factor')
  } catch (err) {
    // A numeric non-zero exit code proves the rejection came from the CLI process itself,
    // not from the assert.fail() above (whose AssertionError would also land in this catch).
    assert.equal(typeof err.code, 'number', `CLI must exit with a numeric code (got ${err.code}: ${err.message})`)
    assert.notEqual(err.code, 0, 'CLI must exit non-zero')
    // Exact message emitted by scripts/bootstrap-super-admin.mjs. The previous pattern
    // (/SECURITY VIOLATION.*no verified TOTP factor/) never matched the CLI's actual wording.
    assert.match(
      err.stderr || err.stdout,
      /SECURITY VIOLATION: Target user does not have an active verified TOTP MFA factor enrolled\./
    )
    // The rejection must have no side effect: no platform admin row and bootstrap still open.
    const { data: adminRows, error: adminRowsErr } = await adminClient
      .from('platform_users').select('user_id').eq('user_id', targetUserId)
    assert.equal(adminRowsErr, null, adminRowsErr?.message)
    assert.equal(adminRows.length, 0, 'Rejected user must not be granted a platform role')
    const { data: bootRows, error: bootRowsErr } = await adminClient
      .from('platform_bootstrap_state').select('is_completed')
    assert.equal(bootRowsErr, null, bootRowsErr?.message)
    assert.equal(bootRows.length, 0, 'Rejected bootstrap must not close the bootstrap window')
    console.log('✓ Test 2 Passed: User without enrolled TOTP factor strictly rejected')
  }

  // 4. Enroll & Verify TOTP factor for target user in Supabase Auth
  console.log('\nEnrolling and verifying TOTP factor in Supabase Auth for target user...')
  const { data: signInRes } = await userClient.auth.signInWithPassword({
    email: targetEmail,
    password: targetPassword,
  })
  assert.ok(signInRes.session, 'User must achieve primary session')

  const { data: enrollRes, error: enrollErr } = await userClient.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Production X',
    friendlyName: 'SuperAdminAuthenticator',
  })
  if (enrollErr || !enrollRes) {
    console.error('Failed to enroll TOTP factor in Supabase Auth:', enrollErr)
    process.exit(1)
  }

  const factorId = enrollRes.id
  const totpSecret = enrollRes.totp.secret
  console.log(`Enrolled TOTP factor ID: ${factorId}`)

  // Verify factor with live TOTP code to transition status to 'verified'
  const initialValidCode = generateTotpCode(totpSecret)
  const { error: verifyFactorErr } = await userClient.auth.mfa.challengeAndVerify({
    factorId,
    code: initialValidCode,
  })
  assert.equal(verifyFactorErr, null, 'Initial factor verification must succeed')
  console.log('TOTP factor verified in Supabase Auth.')

  // 5. Test Failed TOTP Challenge: Invalid 6-digit Code on CLI
  console.log('\n--- Test 3: Failed Live TOTP Challenge Assurance ---')
  try {
    await execFileAsync('node', ['scripts/bootstrap-super-admin.mjs'], {
      env: {
        ...process.env,
        INITIAL_SUPER_ADMIN_EMAIL: targetEmail,
        INITIAL_SUPER_ADMIN_PASSWORD: targetPassword,
        INITIAL_SUPER_ADMIN_TOTP_CODE: '000000', // Invalid code
        PLATFORM_BOOTSTRAP_SECRET: bootstrapSecret,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    })
    assert.fail('Bootstrap CLI must reject invalid live TOTP code')
  } catch (err) {
    assert.match(err.stderr || err.stdout, /AUTHENTICATOR ASSURANCE FAILED|Invalid TOTP code/)
    console.log('✓ Test 3 Passed: Invalid live TOTP challenge code strictly rejected')
  }

  // 6. Test Successful Live AAL2 Bootstrap via CLI
  console.log('\n--- Test 4: Successful Live AAL2 Bootstrap via CLI ---')
  const validLiveCode = generateTotpCode(totpSecret)
  const { stdout: cliSuccessOutput } = await execFileAsync('node', ['scripts/bootstrap-super-admin.mjs'], {
    env: {
      ...process.env,
      INITIAL_SUPER_ADMIN_EMAIL: targetEmail,
      INITIAL_SUPER_ADMIN_PASSWORD: targetPassword,
      INITIAL_SUPER_ADMIN_TOTP_CODE: validLiveCode,
      PLATFORM_BOOTSTRAP_SECRET: bootstrapSecret,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
  })

  assert.match(cliSuccessOutput, /Cryptographic AAL2 assurance confirmed live/)
  assert.match(cliSuccessOutput, /Platform Super Admin successfully bootstrapped/)
  console.log('✓ Test 4 Passed: Live AAL2 bootstrap CLI executed successfully under genuine authenticator challenge')

  // 7. Test Repeated Bootstrap Fails Closed
  console.log('\n--- Test 5: Repeated Bootstrap Fails Closed ---')
  try {
    const freshCode = generateTotpCode(totpSecret)
    await execFileAsync('node', ['scripts/bootstrap-super-admin.mjs'], {
      env: {
        ...process.env,
        INITIAL_SUPER_ADMIN_EMAIL: targetEmail,
        INITIAL_SUPER_ADMIN_PASSWORD: targetPassword,
        INITIAL_SUPER_ADMIN_TOTP_CODE: freshCode,
        PLATFORM_BOOTSTRAP_SECRET: bootstrapSecret,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    })
    assert.fail('Second bootstrap must fail closed')
  } catch (err) {
    assert.match(err.stderr || err.stdout, /already exist|permanently closed/)
    console.log('✓ Test 5 Passed: Repeated bootstrap execution strictly prevented by singleton lock')
  }

  console.log('\n===================================================================')
  console.log('ALL REAL SUPABASE AUTH LIVE AAL2 BOOTSTRAP CLI TESTS PASSED CLEANLY!')
  console.log('===================================================================')
}

runBootstrapCliTests().catch((err) => {
  console.error('\nCRITICAL FAILURE IN BOOTSTRAP CLI INTEGRATION TESTS:', err)
  process.exit(1)
})
