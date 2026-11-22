// lib/listings/access.ts — listings are for agencies (channel-partner workspaces). Routes call this after
// authorising the member, so a developer workspace cannot create listings through the API either.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function requireAgency(orgId: string): Promise<NextResponse | null> {
  const { data } = await createServiceClient().from('organisations').select('type').eq('id', orgId).maybeSingle()
  return data?.type === 'channel_partner' ? null : NextResponse.json({ error: 'Listings are for agency workspaces.' }, { status: 403 })
}
