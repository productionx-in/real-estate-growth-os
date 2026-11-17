// lib/auth/password-policy.ts — one password rule for every place a password is set.
export const PASSWORD_MIN_LENGTH = 10

/** Returns a user-facing problem with the password, or null when it is acceptable. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > 128) return 'Use at most 128 characters.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.'
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating a single character.'
  const local = email?.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'Don’t include your email address in the password.'
  return null
}
