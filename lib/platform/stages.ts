// lib/platform/stages.ts — REGrow's own sales pipeline stages: labels and badge tones. Plain data, safe to import from
// server pages and client components alike (a constant exported from a 'use client' file is a client reference on the
// server, not the object — that left every stage badge on the pipeline empty).
export const STAGE_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', qualified: 'Qualified', demo_scheduled: 'Demo scheduled', demo_done: 'Demo done',
  trial_started: 'Trial started', negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
}

export type StageTone = 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'danger'
/** New is grey; early conversations blue; demos brand; a running trial amber (needs converting); won green; lost red. */
export const STAGE_TONE: Record<string, StageTone> = {
  new: 'neutral', contacted: 'info', interested: 'info', qualified: 'info', demo_scheduled: 'brand', demo_done: 'brand',
  trial_started: 'warning', negotiation: 'brand', won: 'success', lost: 'danger',
}

/** Stages at which a workspace should exist for the prospect. */
export const WORKSPACE_STAGES = ['trial_started', 'negotiation', 'won']
