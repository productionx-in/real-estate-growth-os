// lib/marketing/interests.ts — what a website visitor can ask for (demo page ?interest=…). Shared by the server page
// and the client form, so it lives outside the 'use client' module.
export const INTERESTS = [
  { id: 'demo', label: 'A product demo' },
  { id: 'consultation', label: 'A consultation about our sales process' },
  { id: 'migration', label: 'A migration assessment' },
  { id: 'contact', label: 'To talk to the team' },
] as const
export type InterestId = (typeof INTERESTS)[number]['id']
