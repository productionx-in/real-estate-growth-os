// lib/dal/integrations.ts
// Data Access Layer for CRM Integration Connections, Project Mappings, and Event Logs.
// Server-only functions running through Supabase client with RLS enforcement.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type {
  IntegrationConnectionRecord,
  IntegrationProjectMappingRecord,
  IntegrationEventLogRecord,
  IntegrationProvider,
  IntegrationConnectionStatus,
  MappingIdentifierType,
  ProcessingStatus,
} from '@/lib/integrations/types'
import type { Json } from '@/types/database'

// ── Connections ─────────────────────────────────────────────────────────────

export async function getIntegrationConnections(
  orgId: string
): Promise<IntegrationConnectionRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching integration connections:', error)
    return []
  }

  // Redact credential_ref before returning to any client-facing caller
  const sanitized = (data ?? []).map((conn) => ({
    ...conn,
    credential_ref: conn.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
  }))

  return sanitized as unknown as IntegrationConnectionRecord[]
}

export async function getIntegrationConnectionById(
  connectionId: string,
  orgId: string
): Promise<IntegrationConnectionRecord | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('Error fetching integration connection by ID:', error)
    return null
  }

  return {
    ...data,
    credential_ref: data.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
  } as unknown as IntegrationConnectionRecord
}

export async function createIntegrationConnection(
  orgId: string,
  params: {
    provider: IntegrationProvider
    name: string
    external_account_id?: string | null
    status?: IntegrationConnectionStatus
    credential_ref?: string | null
    connected_by?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<{ connection: IntegrationConnectionRecord | null; error: string | null }> {
  const supabase = await createClient()

  // Guard: NEVER allow plaintext secret tokens in credential_ref
  // Only Vault/KMS URI references (e.g. vault://..., kms://...) are allowed.
  if (params.credential_ref) {
    const trimmed = params.credential_ref.trim()
    const isValidRef = trimmed.startsWith('vault://') || trimmed.startsWith('kms://') || trimmed.startsWith('secret://')
    if (!isValidRef) {
      return {
        connection: null,
        error:
          'Plaintext secrets and unapproved formats are strictly forbidden. Credentials must use a formal reference identifier (vault:// or kms://).',
      }
    }
  }

  const { data, error } = await supabase
    .from('integration_connections')
    .insert({
      org_id: orgId,
      provider: params.provider,
      name: params.name,
      external_account_id: params.external_account_id ?? null,
      status: params.status ?? 'not_connected',
      credential_ref: params.credential_ref ?? null,
      connected_by: params.connected_by ?? null,
      metadata: (params.metadata ?? {}) as Json,
    })
    .select()
    .single()

  if (error || !data) {
    return { connection: null, error: error?.message ?? 'Failed to create connection' }
  }

  return {
    connection: {
      ...data,
      credential_ref: data.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
    } as unknown as IntegrationConnectionRecord,
    error: null,
  }
}

// ── Project Mappings ────────────────────────────────────────────────────────

export async function getProjectMappings(
  orgId: string,
  connectionId?: string
): Promise<IntegrationProjectMappingRecord[]> {
  const supabase = await createClient()
  let query = supabase
    .from('integration_project_mappings')
    .select(`
      *,
      project:projects(id, name, slug)
    `)
    .eq('org_id', orgId)

  if (connectionId) {
    query = query.eq('connection_id', connectionId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching project mappings:', error)
    return []
  }
  return (data as unknown as IntegrationProjectMappingRecord[]) ?? []
}

export async function createProjectMapping(
  orgId: string,
  params: {
    connection_id: string
    project_id: string
    external_identifier_type: MappingIdentifierType
    external_identifier_value: string
    description?: string | null
  }
): Promise<{ mapping: IntegrationProjectMappingRecord | null; error: string | null }> {
  const supabase = await createClient()

  // Verify connection belongs to this organisation
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('id, org_id')
    .eq('id', params.connection_id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!conn) {
    return { mapping: null, error: 'Connection does not exist in the specified organisation' }
  }

  // Verify target project belongs to this organisation
  const { data: proj } = await supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', params.project_id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!proj) {
    return { mapping: null, error: 'Target project does not exist in the specified organisation' }
  }

  const { data, error } = await supabase
    .from('integration_project_mappings')
    .insert({
      org_id: orgId,
      connection_id: params.connection_id,
      project_id: params.project_id,
      external_identifier_type: params.external_identifier_type,
      external_identifier_value: params.external_identifier_value.trim(),
      description: params.description?.trim() ?? null,
    })
    .select(`
      *,
      project:projects(id, name, slug)
    `)
    .single()

  if (error || !data) {
    return { mapping: null, error: error?.message ?? 'Failed to create project mapping' }
  }

  return { mapping: data as unknown as IntegrationProjectMappingRecord, error: null }
}

export async function deleteProjectMapping(
  mappingId: string,
  orgId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('integration_project_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('org_id', orgId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, error: null }
}

// ── Event Logs ──────────────────────────────────────────────────────────────

export async function logIntegrationEvent(
  orgId: string,
  params: {
    provider: string
    event_type: string
    processing_status: ProcessingStatus
    connection_id?: string | null
    lead_id?: string | null
    external_event_id?: string | null
    error_message?: string | null
    processed_at?: string | null
  }
): Promise<{ log: IntegrationEventLogRecord | null; error: string | null }> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('integration_event_logs')
    .insert({
      org_id: orgId,
      provider: params.provider,
      event_type: params.event_type,
      processing_status: params.processing_status,
      connection_id: params.connection_id ?? null,
      lead_id: params.lead_id ?? null,
      external_event_id: params.external_event_id ?? null,
      error_message: params.error_message ?? null,
      processed_at: params.processed_at ?? new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) {
    return { log: null, error: error?.message ?? 'Failed to log event' }
  }

  return { log: data as unknown as IntegrationEventLogRecord, error: null }
}

export async function getIntegrationEventLogs(
  orgId: string,
  options?: {
    connectionId?: string
    limit?: number
  }
): Promise<IntegrationEventLogRecord[]> {
  const supabase = await createClient()
  let query = supabase
    .from('integration_event_logs')
    .select('*')
    .eq('org_id', orgId)

  if (options?.connectionId) {
    query = query.eq('connection_id', options.connectionId)
  }

  const { data, error } = await query
    .order('received_at', { ascending: false })
    .limit(options?.limit ?? 50)

  if (error) {
    console.error('Error fetching integration event logs:', error)
    return []
  }
  return (data as unknown as IntegrationEventLogRecord[]) ?? []
}
