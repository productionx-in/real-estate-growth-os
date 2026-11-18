// lib/validations/partners.ts — request shapes for /api/partners (channel partner network, PR 1).
// Only identifiers, choices and free text are accepted from the browser: the buyer's name and phone are read
// from the agency's own lead on the server, and nothing about prices or commission is ever taken from a request.
import { z } from 'zod'

const id = z.string().uuid()
export const OrgOnly = z.object({ orgId: id }).strict()
export const RequestPartnership = z.object({ orgId: id, code: z.string().min(4).max(40) }).strict()
export const StatusChange = z.object({ orgId: id, action: z.enum(['accept', 'reject', 'cancel', 'pause', 'resume', 'end']) }).strict()
export const ShareProject = z.object({
  orgId: id, projectId: id,
  /** null stops sharing the project. */
  visibility: z.enum(['none', 'availability', 'availability_and_price']).nullable(),
}).strict()
export const SubmitRegistration = z.object({
  orgId: id, partnershipId: id, projectId: id, agencyLeadId: id,
  note: z.string().trim().max(1000).nullable().optional(),
  /** The agency user's confirmation that the agency may share this buyer's details (approved decision 6). */
  consent: z.literal(true),
}).strict()
export const ReviewRegistration = z.object({
  orgId: id, accept: z.boolean(), reason: z.string().trim().max(500).nullable().optional(),
}).strict().refine((b) => b.accept || !!b.reason, { message: 'Give a reason for rejecting.', path: ['reason'] })
