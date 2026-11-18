// lib/partners/rules.ts — channel partner network (PR 1) rules shared by the API and the UI. No server imports.
// The database functions (migration 20260058) enforce every rule again; this file only mirrors them for
// early answers and for what the UI offers.
import type { MemberRole } from '@/types/database'

export type PartnershipStatus = 'invited' | 'active' | 'paused' | 'rejected' | 'cancelled' | 'ended'
export type PartnerAction = 'accept' | 'reject' | 'cancel' | 'pause' | 'resume' | 'end'
export type InventoryVisibility = 'none' | 'availability' | 'availability_and_price'
export type RegistrationStatus = 'submitted' | 'accepted' | 'rejected' | 'conflicted' | 'withdrawn' | 'expired'

/** A newly shared project shows availability without prices (approved decision 4). */
export const DEFAULT_VISIBILITY: InventoryVisibility = 'availability'
/** Buyer protection, from acceptance (approved decision 1); each partnership can override it. */
export const DEFAULT_PROTECTION_DAYS = 60

export const VISIBILITY_LABEL: Record<InventoryVisibility, string> = {
  none: 'Project only (no inventory)',
  availability: 'Availability, no prices',
  availability_and_price: 'Availability and prices',
}
export const STATUS_LABEL: Record<PartnershipStatus, string> = {
  invited: 'Request sent', active: 'Active', paused: 'Paused', rejected: 'Declined', cancelled: 'Withdrawn', ended: 'Ended',
}
export const REGISTRATION_LABEL: Record<RegistrationStatus, string> = {
  submitted: 'Under review', accepted: 'Accepted', rejected: 'Rejected', conflicted: 'Already registered',
  withdrawn: 'Withdrawn', expired: 'Protection ended',
}

/** Partnership changes and project sharing: organisation owners and admins. */
export const canManagePartnerships = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin'
/** Register buyers (agency) and review registrations (developer): owners, admins and managers (approved decision 2). */
export const canRegisterOrReview = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin' || role === 'manager'

/** Which actions this side may take on a partnership in this state (mirrors partner_set_status). */
export function allowedActions(status: PartnershipStatus, side: 'developer' | 'agency', pausedByMe: boolean): PartnerAction[] {
  switch (status) {
    case 'invited': return side === 'agency' ? ['accept', 'reject'] : ['cancel']
    case 'active': return ['pause', 'end']
    case 'paused': return pausedByMe ? ['resume', 'end'] : ['end']
    default: return []
  }
}

/** The statement the agency user confirms before a buyer's details go to a developer (stored with its version). */
export const CONSENT_VERSION = 'cp-share-v1'
export function consentStatement(agency: string, developer: string, project: string): string {
  return `I confirm that ${agency} is authorised to share this buyer's name, phone number and the note below with ${developer}, `
    + `to register the buyer for ${project}.`
}

/** "RGP-ABCD234567": what agencies hand out; tolerant of spaces and case when typed. */
export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.toUpperCase().replace(/\s+/g, '')
  return /^RGP-[2-9A-HJKMNP-Z]{10}$/.test(c) ? c : null
}
