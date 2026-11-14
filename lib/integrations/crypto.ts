// lib/integrations/crypto.ts
// Secure AES-256-GCM token encryption and decryption for integration credentials.
// Ensures access tokens, refresh tokens, and secrets are NEVER stored in plaintext.
// Formats storage references as 'vault://aes256gcm:<iv>:<tag>:<ciphertext>' to comply
// with database check constraints on credential_ref.

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16
const PREFIX = 'vault://aes256gcm:'

/**
 * Derives a deterministic 32-byte encryption key from environment secrets.
 * Priority: ENCRYPTION_KEY -> META_APP_SECRET -> SUPABASE_SERVICE_ROLE_KEY -> fallback salt.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY || process.env.META_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (envKey && envKey.length >= 32 && !envKey.startsWith('YOUR_')) {
    // If it's a 64-char hex string, decode it
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex')
    }
    // Otherwise derive 32 bytes using SHA-256 with salt
    return crypto.createHash('sha256').update(`growth-os-vault-salt:${envKey}`).digest()
  }

  // Fallback for development/testing if no custom secret is provided
  // Uses a fixed internal seed for predictable testing
  return crypto.createHash('sha256').update('real-estate-growth-os-internal-vault-seed-2026').digest()
}

/**
 * Encrypts a plaintext credential string into a secure vault URI reference.
 * Output format: vault://aes256gcm:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Credential to encrypt must be a non-empty string')
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypts a vault URI reference back to plaintext.
 * Throws an error if the tag is invalid, tampered with, or format is malformed.
 */
export function decryptCredential(encryptedRef: string): string {
  if (!encryptedRef || typeof encryptedRef !== 'string') {
    throw new Error('Encrypted reference must be a non-empty string')
  }

  if (!isEncryptedCredentialRef(encryptedRef)) {
    throw new Error('Invalid credential reference format. Expected vault://aes256gcm:... format')
  }

  const raw = encryptedRef.slice(PREFIX.length)
  const parts = raw.split(':')

  if (parts.length !== 3) {
    throw new Error('Malformed vault credential reference payload')
  }

  const [ivHex, authTagHex, cipherTextHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Verifies if a given string matches the AES-256-GCM vault URI format.
 */
export function isEncryptedCredentialRef(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== 'string') return false
  return ref.startsWith(PREFIX)
}
