// types/database.ts
// Supabase database types for Real Estate Growth OS

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgType = 'developer' | 'channel_partner'
export type OrgPlan = 'free' | 'growth' | 'enterprise'
export type MemberRole = 'owner' | 'admin' | 'manager' | 'sales_exec' | 'readonly'

// Standard 5 Project Categories
export type ProjectCategory =
  | 'apartments'
  | 'plotted_developments'
  | 'commercial_sale'
  | 'villas_gated_communities'
  | 'mixed_use'

export type ProjectType = 'residential' | 'commercial' | 'mixed_use' | 'plots'
export type ProjectStatus = 'planning' | 'pre_launch' | 'launched' | 'ongoing' | 'completed'

// Standard 5 Inventory Availability Statuses
export type InventoryStatus =
  | 'available'
  | 'on_hold'
  | 'booked'
  | 'sold'
  | 'blocked'

export type LeadSource =
  | 'website'
  | 'meta_ads'
  | 'google_ads'
  | '99acres'
  | 'housing'
  | 'magicbricks'
  | 'whatsapp'
  | 'referral'
  | 'walk_in'
  | 'csv_import'
  | 'other'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'site_visit_scheduled'
  | 'site_visited'
  | 'negotiation'
  | 'booked'
  | 'lost'
  | 'junk'

export type LeadPriority = 'low' | 'medium' | 'high'
export type ActivityType =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'note_added'
  | 'call_logged'
  | 'site_visit_scheduled'
  | 'site_visited'

export interface Database {
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string
          name: string
          slug: string
          type: OrgType
          plan: OrgPlan
          logo_url: string | null
          website: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          type?: OrgType
          plan?: OrgPlan
          logo_url?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          type?: OrgType
          plan?: OrgPlan
          logo_url?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          auth_user_id: string
          full_name: string
          avatar_url: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id: string
          full_name: string
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string
          full_name?: string
          avatar_url?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          role: MemberRole
          invited_by: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          org_id: string
          profile_id: string
          role?: MemberRole
          invited_by?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          role?: MemberRole
          invited_by?: string | null
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_members_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      projects: {
        Row: {
          id: string
          org_id: string
          name: string
          slug: string
          code: string | null
          type: ProjectType
          category: ProjectCategory
          status: ProjectStatus
          location: string | null
          city: string | null
          description: string | null
          brochure_url: string | null
          rera_number: string | null
          total_area_value: number | null
          total_area_unit: string | null
          total_units_count: number | null
          approval_authority: string | null
          launch_date: string | null
          completion_date: string | null
          amenities: Json
          specifications: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          slug: string
          code?: string | null
          type?: ProjectType
          category?: ProjectCategory
          status?: ProjectStatus
          location?: string | null
          city?: string | null
          description?: string | null
          brochure_url?: string | null
          rera_number?: string | null
          total_area_value?: number | null
          total_area_unit?: string | null
          total_units_count?: number | null
          approval_authority?: string | null
          launch_date?: string | null
          completion_date?: string | null
          amenities?: Json
          specifications?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          slug?: string
          code?: string | null
          type?: ProjectType
          category?: ProjectCategory
          status?: ProjectStatus
          location?: string | null
          city?: string | null
          description?: string | null
          brochure_url?: string | null
          rera_number?: string | null
          total_area_value?: number | null
          total_area_unit?: string | null
          total_units_count?: number | null
          approval_authority?: string | null
          launch_date?: string | null
          completion_date?: string | null
          amenities?: Json
          specifications?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'projects_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      project_hierarchy_nodes: {
        Row: {
          id: string
          org_id: string
          project_id: string
          parent_id: string | null
          node_type: string
          name: string
          code: string | null
          sequence_order: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          parent_id?: string | null
          node_type: string
          name: string
          code?: string | null
          sequence_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          parent_id?: string | null
          node_type?: string
          name?: string
          code?: string | null
          sequence_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_hierarchy_nodes_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      inventory_items: {
        Row: {
          id: string
          org_id: string
          project_id: string
          hierarchy_node_id: string | null
          import_reference_id: string | null
          unit_number: string
          category: ProjectCategory
          status: InventoryStatus
          area_value: number
          area_unit: string
          carpet_area: number | null
          built_up_area: number | null
          super_built_up_area: number | null
          plot_area: number | null
          plot_dimensions: string | null
          road_width_ft: number | null
          is_corner_plot: boolean
          facing: string | null
          bhk_config: string | null
          floor_number: number | null
          tower_name: string | null
          commercial_asset_type: string | null
          bedrooms: number | null
          bathrooms: number | null
          balconies: number | null
          parking_spaces: number | null
          furnishing_status: string | null
          base_rate: number | null
          total_price: number | null
          pricing_breakup: Json
          images: Json
          documents: Json
          internal_notes: string | null
          custom_attributes: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          hierarchy_node_id?: string | null
          import_reference_id?: string | null
          unit_number: string
          category: ProjectCategory
          status?: InventoryStatus
          area_value: number
          area_unit?: string
          carpet_area?: number | null
          built_up_area?: number | null
          super_built_up_area?: number | null
          plot_area?: number | null
          plot_dimensions?: string | null
          road_width_ft?: number | null
          is_corner_plot?: boolean
          facing?: string | null
          bhk_config?: string | null
          floor_number?: number | null
          tower_name?: string | null
          commercial_asset_type?: string | null
          bedrooms?: number | null
          bathrooms?: number | null
          balconies?: number | null
          parking_spaces?: number | null
          furnishing_status?: string | null
          base_rate?: number | null
          total_price?: number | null
          pricing_breakup?: Json
          images?: Json
          documents?: Json
          internal_notes?: string | null
          custom_attributes?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          hierarchy_node_id?: string | null
          import_reference_id?: string | null
          unit_number?: string
          category?: ProjectCategory
          status?: InventoryStatus
          area_value?: number
          area_unit?: string
          carpet_area?: number | null
          built_up_area?: number | null
          super_built_up_area?: number | null
          plot_area?: number | null
          plot_dimensions?: string | null
          road_width_ft?: number | null
          is_corner_plot?: boolean
          facing?: string | null
          bhk_config?: string | null
          floor_number?: number | null
          tower_name?: string | null
          commercial_asset_type?: string | null
          bedrooms?: number | null
          bathrooms?: number | null
          balconies?: number | null
          parking_spaces?: number | null
          furnishing_status?: string | null
          base_rate?: number | null
          total_price?: number | null
          pricing_breakup?: Json
          images?: Json
          documents?: Json
          internal_notes?: string | null
          custom_attributes?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_items_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inventory_items_hierarchy_node_id_fkey'
            columns: ['hierarchy_node_id']
            isOneToOne: false
            referencedRelation: 'project_hierarchy_nodes'
            referencedColumns: ['id']
          }
        ]
      }
      inventory_status_history: {
        Row: {
          id: string
          inventory_id: string
          org_id: string
          previous_status: InventoryStatus | null
          new_status: InventoryStatus
          changed_by: string
          reason: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          inventory_id: string
          org_id: string
          previous_status?: InventoryStatus | null
          new_status: InventoryStatus
          changed_by: string
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'inventory_status_history_inventory_id_fkey'
            columns: ['inventory_id']
            isOneToOne: false
            referencedRelation: 'inventory_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inventory_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      leads: {
        Row: {
          id: string
          org_id: string
          project_id: string | null
          assigned_to: string | null
          name: string
          email: string | null
          phone: string
          source: LeadSource
          status: LeadStatus
          priority: LeadPriority
          budget_min: number | null
          budget_max: number | null
          notes: string | null
          custom_fields: Json
          source_platform: string | null
          campaign_name: string | null
          campaign_id: string | null
          ad_name: string | null
          ad_id: string | null
          form_name: string | null
          form_id: string | null
          external_lead_id: string | null
          source_url: string | null
          connection_id: string | null
          source_metadata: Json
          idempotency_key: string | null
          is_duplicate: boolean
          duplicate_of_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id?: string | null
          assigned_to?: string | null
          name: string
          email?: string | null
          phone: string
          source?: LeadSource
          status?: LeadStatus
          priority?: LeadPriority
          budget_min?: number | null
          budget_max?: number | null
          notes?: string | null
          custom_fields?: Json
          source_platform?: string | null
          campaign_name?: string | null
          campaign_id?: string | null
          ad_name?: string | null
          ad_id?: string | null
          form_name?: string | null
          form_id?: string | null
          external_lead_id?: string | null
          source_url?: string | null
          connection_id?: string | null
          source_metadata?: Json
          idempotency_key?: string | null
          is_duplicate?: boolean
          duplicate_of_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string | null
          assigned_to?: string | null
          name?: string
          email?: string | null
          phone?: string
          source?: LeadSource
          status?: LeadStatus
          priority?: LeadPriority
          budget_min?: number | null
          budget_max?: number | null
          notes?: string | null
          custom_fields?: Json
          source_platform?: string | null
          campaign_name?: string | null
          campaign_id?: string | null
          ad_name?: string | null
          ad_id?: string | null
          form_name?: string | null
          form_id?: string | null
          external_lead_id?: string | null
          source_url?: string | null
          connection_id?: string | null
          source_metadata?: Json
          idempotency_key?: string | null
          is_duplicate?: boolean
          duplicate_of_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leads_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leads_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leads_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      lead_activities: {
        Row: {
          id: string
          lead_id: string
          actor_id: string
          type: ActivityType
          note: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          actor_id: string
          type: ActivityType
          note?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'lead_activities_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      lead_assignments: {
        Row: {
          id: string
          lead_id: string
          assigned_to: string
          assigned_by: string
          assigned_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          assigned_to: string
          assigned_by: string
          assigned_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'lead_assignments_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      inventory_import_history: {
        Row: {
          id: string
          org_id: string
          project_id: string
          reference_id: string
          file_name: string
          file_type: 'csv' | 'xlsx'
          initiated_by: string | null
          total_rows: number
          successful_rows: number
          failed_rows: number
          status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
          error_summary: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          reference_id: string
          file_name: string
          file_type: 'csv' | 'xlsx'
          initiated_by?: string | null
          total_rows?: number
          successful_rows?: number
          failed_rows?: number
          status?: 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
          error_summary?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          reference_id?: string
          file_name?: string
          file_type?: 'csv' | 'xlsx'
          initiated_by?: string | null
          total_rows?: number
          successful_rows?: number
          failed_rows?: number
          status?: 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
          error_summary?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_import_history_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inventory_import_history_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      integration_connections: {
        Row: {
          id: string
          org_id: string
          provider: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'manual' | 'other'
          name: string
          external_account_id: string | null
          status: 'not_connected' | 'connected' | 'error' | 'disabled'
          connected_by: string | null
          last_sync_at: string | null
          last_error: string | null
          credential_ref: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          provider: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'manual' | 'other'
          name: string
          external_account_id?: string | null
          status?: 'not_connected' | 'connected' | 'error' | 'disabled'
          connected_by?: string | null
          last_sync_at?: string | null
          last_error?: string | null
          credential_ref?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          provider?: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'manual' | 'other'
          name?: string
          external_account_id?: string | null
          status?: 'not_connected' | 'connected' | 'error' | 'disabled'
          connected_by?: string | null
          last_sync_at?: string | null
          last_error?: string | null
          credential_ref?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integration_connections_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      integration_project_mappings: {
        Row: {
          id: string
          org_id: string
          connection_id: string
          project_id: string
          external_identifier_type: 'campaign_id' | 'form_id' | 'page_id' | 'account_default'
          external_identifier_value: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          connection_id: string
          project_id: string
          external_identifier_type: 'campaign_id' | 'form_id' | 'page_id' | 'account_default'
          external_identifier_value: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          connection_id?: string
          project_id?: string
          external_identifier_type?: 'campaign_id' | 'form_id' | 'page_id' | 'account_default'
          external_identifier_value?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integration_project_mappings_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'integration_project_mappings_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          }
        ]
      }
      integration_event_logs: {
        Row: {
          id: string
          org_id: string
          connection_id: string | null
          provider: string
          event_type: string
          external_event_id: string | null
          processing_status: 'received' | 'processed' | 'duplicate' | 'unmapped' | 'failed'
          error_message: string | null
          lead_id: string | null
          received_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          connection_id?: string | null
          provider: string
          event_type: string
          external_event_id?: string | null
          processing_status: 'received' | 'processed' | 'duplicate' | 'unmapped' | 'failed'
          error_message?: string | null
          lead_id?: string | null
          received_at?: string
          processed_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          connection_id?: string | null
          provider?: string
          event_type?: string
          external_event_id?: string | null
          processing_status?: 'received' | 'processed' | 'duplicate' | 'unmapped' | 'failed'
          error_message?: string | null
          lead_id?: string | null
          received_at?: string
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'integration_event_logs_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      org_type: OrgType
      org_plan: OrgPlan
      member_role: MemberRole
      project_category: ProjectCategory
      project_type: ProjectType
      project_status: ProjectStatus
      inventory_status: InventoryStatus
      lead_source: LeadSource
      lead_status: LeadStatus
      lead_priority: LeadPriority
      activity_type: ActivityType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]
