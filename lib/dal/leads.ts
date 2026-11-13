// lib/dal/leads.ts
// Data Access Layer — server-only lead queries.
// All queries run through the authenticated Supabase client so RLS applies.
import { createClient } from '@/lib/supabase/server'
import type { LeadFormValues } from '@/lib/validations/lead'
import type { LeadStatus, Json } from '@/types/database'

export async function getLeadById(leadId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      project:projects(id, name, slug),
      assignee:profiles!leads_assigned_to_fkey(id, full_name, avatar_url)
    `)
    .eq('id', leadId)
    .single()

  if (error) return null
  return data
}

export async function getLeadActivities(leadId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lead_activities')
    .select(`
      id, type, note, metadata, created_at,
      actor:profiles!lead_activities_actor_id_fkey(id, full_name)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function createLead(orgId: string, values: LeadFormValues, actorProfileId: string) {
  const supabase = await createClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      org_id: orgId,
      name: values.name,
      phone: values.phone,
      email: values.email || null,
      source: values.source,
      status: values.status ?? 'new',
      priority: values.priority ?? 'medium',
      project_id: values.project_id || null,
      budget_min: values.budget_min ?? null,
      budget_max: values.budget_max ?? null,
      notes: values.notes || null,
      custom_fields: {},
      // Attribution fields (Stage 3G)
      source_platform: values.source_platform ?? null,
      campaign_name: values.campaign_name ?? null,
      campaign_id: values.campaign_id ?? null,
      ad_name: values.ad_name ?? null,
      ad_id: values.ad_id ?? null,
      form_name: values.form_name ?? null,
      form_id: values.form_id ?? null,
      external_lead_id: values.external_lead_id ?? null,
      source_url: values.source_url || null,
      connection_id: values.connection_id ?? null,
      source_metadata: (values.source_metadata ?? {}) as Json,
      is_duplicate: values.is_duplicate ?? false,
      duplicate_of_id: values.duplicate_of_id ?? null,
    })
    .select()
    .single()

  if (error || !lead) return { lead: null, error: error?.message ?? 'Failed to create lead' }

  // Log creation activity
  await supabase.from('lead_activities').insert({
    lead_id: lead.id,
    actor_id: actorProfileId,
    type: 'created',
    note: 'Lead created',
    metadata: { source: values.source },
  })

  return { lead, error: null }
}

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
  actorProfileId: string,
  note?: string
) {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single()

  const { error } = await supabase
    .from('leads')
    .update({ status: newStatus })
    .eq('id', leadId)

  if (error) return { error: error.message }

  await supabase.from('lead_activities').insert({
    lead_id: leadId,
    actor_id: actorProfileId,
    type: 'status_changed',
    note: note ?? null,
    metadata: {
      from: current?.status,
      to: newStatus,
    },
  })

  return { error: null }
}

export async function addLeadNote(leadId: string, note: string, actorProfileId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('lead_activities').insert({
    lead_id: leadId,
    actor_id: actorProfileId,
    type: 'note_added',
    note,
    metadata: {},
  })
  return { error: error?.message ?? null }
}
