// lib/auth/password-policy.ts — one password rule for every place a password is set.
// Matches the production Supabase Auth password requirement (lower, upper, digit, symbol), so a password REGrow
// accepts is never then refused by Supabase.
export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with upper- and lower-case letters, a number and a symbol.`

/** Returns a user-facing problem with the password, or null when it is acceptable. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > 128) return 'Use at most 128 characters.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Use upper- and lower-case letters, a number and a symbol.'
  }
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating a single character.'
  const local = email?.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'Don’t include your email address in the password.'
  return null
}
