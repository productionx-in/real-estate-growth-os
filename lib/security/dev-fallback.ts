// lib/security/dev-fallback.ts — fixed development-only values must never be used by a production deployment.
// Local development and tests may fall back to a fixed seed; Vercel production (VERCEL_ENV=production) refuses, so a
// missing secret fails loudly instead of silently protecting data with a value that is public in this repository.
export function isProductionDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'production'
}

export function devOnlyFallback(name: string, value: string, env: Record<string, string | undefined> = process.env): string {
  if (isProductionDeployment(env)) {
    throw new Error(`${name} is not configured. Set it in the hosting environment (docs/operations/ENVIRONMENT.md).`)
  }
  return value
}
