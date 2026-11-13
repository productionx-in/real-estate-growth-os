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
import type { Json, TablesUpdate } from '@/types/database'

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

export async function updateIntegrationConnection(
  connectionId: string,
  orgId: string,
  updates: {
    name?: string
    status?: IntegrationConnectionStatus
    external_account_id?: string | null
    last_sync_at?: string | null
    last_error?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<{ connection: IntegrationConnectionRecord | null; error: string | null }> {
  const supabase = await createClient()

  const updatePayload: TablesUpdate<'integration_connections'> = {}
  if (updates.name !== undefined) updatePayload.name = updates.name.trim()
  if (updates.status !== undefined) updatePayload.status = updates.status
  if (updates.external_account_id !== undefined) updatePayload.external_account_id = updates.external_account_id
  if (updates.last_sync_at !== undefined) updatePayload.last_sync_at = updates.last_sync_at
  if (updates.last_error !== undefined) updatePayload.last_error = updates.last_error
  if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata as Json

  const { data, error } = await supabase
    .from('integration_connections')
    .update(updatePayload)
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .select()
    .maybeSingle()

  if (error || !data) {
    return { connection: null, error: error?.message ?? 'Connection not found or update failed' }
  }

  return {
    connection: {
      ...data,
      credential_ref: data.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
    } as unknown as IntegrationConnectionRecord,
    error: null,
  }
}

/**
 * Disconnects an integration connection safely without deleting historical leads or attribution.
 * Sets the connection status to 'disabled' and logs an audit event.
 */
export async function disconnectIntegrationConnection(
  connectionId: string,
  orgId: string
): Promise<{ success: boolean; error: string | null }> {
  const result = await updateIntegrationConnection(connectionId, orgId, {
    status: 'disabled',
    last_error: null,
  })

  if (!result.connection || result.error) {
    return { success: false, error: result.error ?? 'Failed to disconnect integration' }
  }

  // Safely record disconnect in event logs
  await logIntegrationEvent(orgId, {
    connection_id: connectionId,
    provider: result.connection.provider,
    event_type: 'connection_disconnected',
    processing_status: 'processed',
    error_message: 'Connection disabled by user. Historical leads preserved.',
  })

  return { success: true, error: null }
}

/**
 * Reconnects an integration connection, resetting error state to readiness.
 */
export async function reconnectIntegrationConnection(
  connectionId: string,
  orgId: string,
  metadata?: Record<string, unknown>
): Promise<{ connection: IntegrationConnectionRecord | null; error: string | null }> {
  const result = await updateIntegrationConnection(connectionId, orgId, {
    status: 'connected',
    last_error: null,
    last_sync_at: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  })

  if (!result.connection || result.error) {
    return { connection: null, error: result.error ?? 'Failed to reconnect integration' }
  }

  // Safely record reconnect in event logs
  await logIntegrationEvent(orgId, {
    connection_id: connectionId,
    provider: result.connection.provider,
    event_type: 'connection_reconnected',
    processing_status: 'processed',
  })

  return result
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

export async function updateProjectMapping(
  mappingId: string,
  orgId: string,
  updates: {
    project_id?: string
    description?: string | null
  }
): Promise<{ mapping: IntegrationProjectMappingRecord | null; error: string | null }> {
  const supabase = await createClient()

  if (updates.project_id) {
    // Verify target project belongs to this organisation
    const { data: proj } = await supabase
      .from('projects')
      .select('id, org_id')
      .eq('id', updates.project_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!proj) {
      return { mapping: null, error: 'Target project does not exist in the specified organisation' }
    }
  }

  const payload: TablesUpdate<'integration_project_mappings'> = {}
  if (updates.project_id !== undefined) payload.project_id = updates.project_id
  if (updates.description !== undefined) payload.description = updates.description?.trim() ?? null

  const { data, error } = await supabase
    .from('integration_project_mappings')
    .update(payload)
    .eq('id', mappingId)
    .eq('org_id', orgId)
    .select(`
      *,
      project:projects(id, name, slug)
    `)
    .single()

  if (error || !data) {
    return { mapping: null, error: error?.message ?? 'Failed to update project mapping' }
  }

  return { mapping: data as unknown as IntegrationProjectMappingRecord, error: null }
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
