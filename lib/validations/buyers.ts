// lib/validations/buyers.ts
// Zod Validation Schemas for Buyer 360, Payments & KYC Documents

import { z } from 'zod'

const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}$/
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

export const coBuyerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  relationship: z.string().min(2, 'Relationship is required').max(50),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  pan: z.string().regex(panRegex, 'Invalid PAN format').optional().or(z.literal('')),
  is_primary: z.boolean().default(false),
})

export const upsertBuyerSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  fullName: z.string().min(2, 'Full name is required').max(120),
  phone: z.string().regex(phoneRegex, 'Invalid phone number format'),
  email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  alternatePhone: z.string().regex(phoneRegex, 'Invalid alternate phone').optional().nullable().or(z.literal('')),
  panNumber: z.string().regex(panRegex, 'Invalid PAN (must match ABCDE1234F)').optional().nullable().or(z.literal('')),
  aadhaarNumberMasked: z.string().max(20).optional().nullable().or(z.literal('')),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pincode: z.string().max(12).optional().nullable(),
  country: z.string().max(100).default('India'),
  coBuyers: z.array(coBuyerSchema).default([]),
  notes: z.string().max(1000).optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
})

export const recordPaymentSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  bookingId: z.string().uuid('Invalid booking ID'),
  milestoneId: z.string().uuid().optional().nullable(),
  amount: z.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.enum([
    'bank_transfer_neft_rtgs',
    'cheque',
    'upi',
    'demand_draft',
    'credit_card',
    'cash',
  ]),
  referenceNumber: z.string().min(3, 'Payment reference (UTR/cheque) must be at least 3 characters').max(100),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').default(() => new Date().toISOString().split('T')[0]),
  notes: z.string().max(500).optional().nullable(),
})

export const verifyPaymentSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  paymentId: z.string().uuid('Invalid payment ID'),
})

export const milestoneInputSchema = z.object({
  milestone_name: z.string().min(2, 'Milestone name is required').max(120),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  amount_due: z.number().positive('Milestone amount must be greater than zero'),
})

export const generateMilestonesSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  bookingId: z.string().uuid('Invalid booking ID'),
  milestones: z.array(milestoneInputSchema).min(1, 'At least one milestone is required'),
})

export const uploadDocumentSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  buyerId: z.string().uuid('Invalid buyer ID'),
  bookingId: z.string().uuid().optional().nullable(),
  documentType: z.enum([
    'pan_card',
    'aadhaar_card',
    'passport',
    'voter_id',
    'address_proof',
    'sale_agreement',
    'allotment_letter',
    'payment_receipt',
    'noc',
    'other',
  ]),
  title: z.string().min(2).max(150),
  fileName: z.string().min(1).max(200),
  fileKey: z.string().min(1).max(500),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
  mimeType: z.string().min(1).max(100),
})

export const verifyDocumentSchema = z.object({
  orgId: z.string().uuid('Invalid organisation ID'),
  documentId: z.string().uuid('Invalid document ID'),
  status: z.enum(['verified', 'rejected']),
  notes: z.string().max(500).optional().nullable(),
})
