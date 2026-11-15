// lib/validations/sales.ts
// Zod schemas for Sales, Unit Blockings, and Bookings operations.
import { z } from 'zod'

export const PaymentStatusEnum = z.enum(['unverified', 'verified', 'failed', 'refunded'])
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>

export const BlockUnitSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  inventoryId: z.string().uuid({ message: 'Valid inventory ID is required' }),
  leadId: z.string().uuid({ message: 'Valid lead ID is required' }),
  tokenAmount: z.coerce.number().min(0, { message: 'Token amount cannot be negative' }),
  paymentReference: z.string().trim().max(100).optional().nullable(),
  paymentStatus: PaymentStatusEnum.default('unverified'),
  holdDurationHours: z.coerce
    .number()
    .int()
    .min(1, { message: 'Hold duration must be at least 1 hour' })
    .max(720, { message: 'Hold duration cannot exceed 30 days (720 hours)' })
    .default(48),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
})

export type BlockUnitInput = z.infer<typeof BlockUnitSchema>

export const CreateBookingSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  inventoryId: z.string().uuid({ message: 'Valid inventory ID is required' }),
  leadId: z.string().uuid({ message: 'Valid lead ID is required' }),
  blockingId: z.string().uuid().optional().nullable(),
  channelPartnerId: z.string().uuid().optional().nullable(),
  basePrice: z.coerce
    .number()
    .positive({ message: 'Base price must be greater than zero' }),
  additionalCharges: z.coerce
    .number()
    .min(0, { message: 'Additional charges cannot be negative' })
    .default(0),
  bookingAmountReceived: z.coerce
    .number()
    .min(0, { message: 'Booking amount received cannot be negative' }),
  paymentPlan: z
    .enum(['construction_linked', 'time_linked', 'down_payment', 'custom'])
    .default('construction_linked'),
  paymentStatus: z.enum(['unverified', 'partially_verified', 'verified']).default('unverified'),
  idempotencyKey: z.string().trim().max(128).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
})

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>

export const ReleaseBlockingSchema = z.object({
  blockingId: z.string().uuid({ message: 'Valid blocking ID is required' }),
  reason: z.string().trim().max(500).optional().nullable(),
})

export type ReleaseBlockingInput = z.infer<typeof ReleaseBlockingSchema>
