// lib/auth/permissions.ts
// Single source of truth for role- and membership-status-based permission rules.
// Deliberately dependency-free (no Next.js / Supabase imports) so the exact production rules
// can be unit-tested directly (tests/permissions.test.mjs).
import type { MemberRole } from '@/types/database'

/** Only an `active` membership grants access. `deactivated`, `suspended`, null or unknown values never do. */
export function isActiveMembership(status: string | null | undefined): boolean {
  return status === 'active'
}

/** Roles allowed to create or change sales records (site visits, deals, holds, bookings). */
export const SALES_WRITE_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'sales_exec']

/**
 * Roles allowed to manage channel partners. Channel-partner records carry bank details, PAN/GST and
 * commission rates, so they are restricted to management roles.
 */
export const CHANNEL_PARTNER_ADMIN_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager']

export function canWriteSales(role: MemberRole | null | undefined): boolean {
  return !!role && SALES_WRITE_ROLES.includes(role)
}

export function canManageChannelPartners(role: MemberRole | null | undefined): boolean {
  return !!role && CHANNEL_PARTNER_ADMIN_ROLES.includes(role)
}
