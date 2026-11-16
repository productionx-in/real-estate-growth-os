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
export type PlatformRole = 'super_admin' | 'sales_rep' | 'finance_admin' | 'support_agent'
export type OnboardingRequestStatus = 'draft' | 'pending_approval' | 'approved' | 'provisioned' | 'rejected'

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
      platform_users: {
        Row: {
          id: string
          user_id: string
          role: PlatformRole
          is_active: boolean
          mfa_enforced: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: PlatformRole
          is_active?: boolean
          mfa_enforced?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: PlatformRole
          is_active?: boolean
          mfa_enforced?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_mfa_recovery_codes: {
        Row: {
          id: string
          platform_user_id: string
          code_hash: string
          is_used: boolean
          used_at: string | null
          used_by_ip: string | null
          created_at: string
        }
        Insert: {
          id?: string
          platform_user_id: string
          code_hash: string
          is_used?: boolean
          used_at?: string | null
          used_by_ip?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          platform_user_id?: string
          code_hash?: string
          is_used?: boolean
          used_at?: string | null
          used_by_ip?: string | null
          created_at?: string
        }
        Relationships: []
      }
      platform_audit_logs: {
        Row: {
          id: string
          actor_user_id: string
          actor_role: PlatformRole
          action: string
          target_entity_type: string
          target_entity_id: string
          metadata: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id: string
          actor_role: PlatformRole
          action: string
          target_entity_type: string
          target_entity_id: string
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_user_id?: string
          actor_role?: PlatformRole
          action?: string
          target_entity_type?: string
          target_entity_id?: string
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      customer_onboarding_requests: {
        Row: {
          id: string
          requested_by: string
          company_name: string
          company_type: OrgType
          admin_email: string
          admin_name: string
          admin_phone: string | null
          commercial_notes: string | null
          requested_plan_code: string
          requested_seats: number
          requested_billing_cycle: string
          approved_plan_code: string | null
          approved_seats: number | null
          approved_billing_cycle: string | null
          status: OnboardingRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          provisioned_org_id: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requested_by?: string | null
          company_name: string
          company_type: OrgType
          admin_email: string
          admin_name: string
          admin_phone?: string | null
          commercial_notes?: string | null
          requested_plan_code: string
          requested_seats: number
          requested_billing_cycle?: string
          approved_plan_code?: string | null
          approved_seats?: number | null
          approved_billing_cycle?: string | null
          status?: OnboardingRequestStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          provisioned_org_id?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          requested_by?: string
          company_name?: string
          company_type?: OrgType
          admin_email?: string
          admin_name?: string
          admin_phone?: string | null
          commercial_notes?: string | null
          requested_plan_code?: string
          requested_seats?: number
          requested_billing_cycle?: string
          approved_plan_code?: string | null
          approved_seats?: number | null
          approved_billing_cycle?: string | null
          status?: OnboardingRequestStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          provisioned_org_id?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          code: string
          name: string
          target_org_type: OrgType
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          target_org_type: OrgType
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          target_org_type?: OrgType
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plan_versions: {
        Row: {
          id: string
          plan_id: string
          version_number: number
          is_current: boolean
          included_seats: number
          max_projects: number | null
          max_inventory_units: number | null
          max_storage_bytes: number | null
          max_integrations: number | null
          intelligence_credits_monthly: number | null
          currency: string
          base_price_monthly_cents: number
          base_price_annual_cents: number
          additional_seat_price_cents: number
          features: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          version_number: number
          is_current?: boolean
          included_seats: number
          max_projects?: number | null
          max_inventory_units?: number | null
          max_storage_bytes?: number | null
          max_integrations?: number | null
          intelligence_credits_monthly?: number | null
          currency?: string
          base_price_monthly_cents?: number
          base_price_annual_cents?: number
          additional_seat_price_cents?: number
          features?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          version_number?: number
          is_current?: boolean
          included_seats?: number
          max_projects?: number | null
          max_inventory_units?: number | null
          max_storage_bytes?: number | null
          max_integrations?: number | null
          intelligence_credits_monthly?: number | null
          currency?: string
          base_price_monthly_cents?: number
          base_price_annual_cents?: number
          additional_seat_price_cents?: number
          features?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      org_subscription_seat_purchases: {
        Row: {
          id: string
          org_id: string
          subscription_id: string
          seats_added: number
          purchased_at: string
          status: string
        }
        Insert: {
          id?: string
          org_id: string
          subscription_id: string
          seats_added: number
          purchased_at?: string
          status?: string
        }
        Update: {
          id?: string
          org_id?: string
          subscription_id?: string
          seats_added?: number
          purchased_at?: string
          status?: string
        }
        Relationships: []
      }
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
          status: 'active' | 'deactivated' | 'suspended'
          deactivated_at: string | null
          deactivated_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          profile_id: string
          role?: MemberRole
          invited_by?: string | null
          joined_at?: string
          status?: 'active' | 'deactivated' | 'suspended'
          deactivated_at?: string | null
          deactivated_by?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          role?: MemberRole
          invited_by?: string | null
          joined_at?: string
          status?: 'active' | 'deactivated' | 'suspended'
          deactivated_at?: string | null
          deactivated_by?: string | null
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
      org_subscriptions: {
        Row: {
          id: string
          org_id: string
          plan_tier: string
          included_seats: number
          additional_seats: number
          status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
          billing_cycle: 'monthly' | 'annual'
          current_period_start: string
          current_period_end: string
          plan_version_id: string | null
          grace_period_ends_at: string | null
          is_read_only: boolean
          read_only_reason: string | null
          canceled_at: string | null
          cancel_at_period_end: boolean
          last_verified_payment_id: string | null
          restored_at: string | null
          restored_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          plan_tier?: string
          included_seats?: number
          additional_seats?: number
          status?: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
          billing_cycle?: 'monthly' | 'annual'
          current_period_start?: string
          current_period_end?: string
          plan_version_id?: string | null
          grace_period_ends_at?: string | null
          is_read_only?: boolean
          read_only_reason?: string | null
          canceled_at?: string | null
          cancel_at_period_end?: boolean
          last_verified_payment_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          plan_tier?: string
          included_seats?: number
          additional_seats?: number
          status?: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
          billing_cycle?: 'monthly' | 'annual'
          current_period_start?: string
          current_period_end?: string
          plan_version_id?: string | null
          grace_period_ends_at?: string | null
          is_read_only?: boolean
          read_only_reason?: string | null
          canceled_at?: string | null
          cancel_at_period_end?: boolean
          last_verified_payment_id?: string | null
          restored_at?: string | null
          restored_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_subscriptions_org_id_fkey'
            columns: ['org_id']
            isOneToOne: true
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      org_invitations: {
        Row: {
          id: string
          org_id: string
          email: string
          role: MemberRole
          invited_by: string
          token_hash: string
          status: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role?: MemberRole
          invited_by: string
          token_hash: string
          status?: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          role?: MemberRole
          invited_by?: string
          token_hash?: string
          status?: 'pending' | 'accepted' | 'expired' | 'revoked'
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_invitations_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_invitations_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_invitations_accepted_by_fkey'
            columns: ['accepted_by']
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
          phone_e164: string | null
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
          provider: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'developer_api' | 'manual' | 'other'
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
          provider: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'developer_api' | 'manual' | 'other'
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
          provider?: 'meta_ads' | 'google_ads' | 'website_webhook' | 'whatsapp_cloud' | 'property_portal_99acres' | 'property_portal_magicbricks' | 'property_portal_housing' | 'developer_api' | 'manual' | 'other'
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
          external_identifier_type:
            | 'campaign_id'
            | 'form_id'
            | 'page_id'
            | 'account_default'
            | 'phone_number_id'
            | 'portal_project_id'
            | 'portal_listing_id'
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
          external_identifier_type:
            | 'campaign_id'
            | 'form_id'
            | 'page_id'
            | 'account_default'
            | 'phone_number_id'
            | 'portal_project_id'
            | 'portal_listing_id'
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
          external_identifier_type?:
            | 'campaign_id'
            | 'form_id'
            | 'page_id'
            | 'account_default'
            | 'phone_number_id'
            | 'portal_project_id'
            | 'portal_listing_id'
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
      developer_api_keys: {
        Row: {
          id: string
          org_id: string
          name: string
          key_hash: string
          key_prefix: string
          permissions: string[]
          is_active: boolean
          last_used_at: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          key_hash: string
          key_prefix: string
          permissions?: string[]
          is_active?: boolean
          last_used_at?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          key_hash?: string
          key_prefix?: string
          permissions?: string[]
          is_active?: boolean
          last_used_at?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'developer_api_keys_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      webhook_subscriptions: {
        Row: {
          id: string
          org_id: string
          url: string
          event_types: string[]
          secret_ref: string | null
          is_active: boolean
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          url: string
          event_types?: string[]
          secret_ref?: string | null
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          url?: string
          event_types?: string[]
          secret_ref?: string | null
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'webhook_subscriptions_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      webhook_delivery_logs: {
        Row: {
          id: string
          org_id: string
          subscription_id: string
          event_type: string
          payload: Json
          response_status: number | null
          response_body: string | null
          attempt: number
          success: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          subscription_id: string
          event_type: string
          payload: Json
          response_status?: number | null
          response_body?: string | null
          attempt?: number
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          subscription_id?: string
          event_type?: string
          payload?: Json
          response_status?: number | null
          response_body?: string | null
          attempt?: number
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'webhook_delivery_logs_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'webhook_delivery_logs_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'webhook_subscriptions'
            referencedColumns: ['id']
          }
        ]
      }
      whatsapp_conversations: {
        Row: {
          id: string
          org_id: string
          connection_id: string
          lead_id: string | null
          wa_id: string
          phone_number_id: string
          status: 'open' | 'closed' | 'paused'
          is_opted_out: boolean
          opted_out_at: string | null
          last_inbound_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          connection_id: string
          lead_id?: string | null
          wa_id: string
          phone_number_id: string
          status?: 'open' | 'closed' | 'paused'
          is_opted_out?: boolean
          opted_out_at?: string | null
          last_inbound_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          connection_id?: string
          lead_id?: string | null
          wa_id?: string
          phone_number_id?: string
          status?: 'open' | 'closed' | 'paused'
          is_opted_out?: boolean
          opted_out_at?: string | null
          last_inbound_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'whatsapp_conversations_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'whatsapp_conversations_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'whatsapp_conversations_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      whatsapp_messages: {
        Row: {
          id: string
          org_id: string
          conversation_id: string | null
          lead_id: string | null
          wamid: string
          direction: 'inbound' | 'outbound'
          message_type: string
          body: string | null
          referral_metadata: Record<string, unknown> | null
          delivery_status: 'sent' | 'delivered' | 'read' | 'failed'
          received_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          conversation_id?: string | null
          lead_id?: string | null
          wamid: string
          direction: 'inbound' | 'outbound'
          message_type?: string
          body?: string | null
          referral_metadata?: Record<string, unknown> | null
          delivery_status?: 'sent' | 'delivered' | 'read' | 'failed'
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          conversation_id?: string | null
          lead_id?: string | null
          wamid?: string
          direction?: 'inbound' | 'outbound'
          message_type?: string
          body?: string | null
          referral_metadata?: Record<string, unknown> | null
          delivery_status?: 'sent' | 'delivered' | 'read' | 'failed'
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'whatsapp_messages_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'whatsapp_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'whatsapp_conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'whatsapp_messages_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          }
        ]
      }
      whatsapp_templates: {
        Row: {
          id: string
          org_id: string
          connection_id: string
          template_name: string
          language: string
          category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          status: string
          components: unknown
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          connection_id: string
          template_name: string
          language?: string
          category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          status?: string
          components?: unknown
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          connection_id?: string
          template_name?: string
          language?: string
          category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          status?: string
          components?: unknown
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'whatsapp_templates_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'whatsapp_templates_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          }
        ]
      }
      site_visits: {
        Row: {
          id: string
          org_id: string
          project_id: string
          lead_id: string
          assigned_to: string | null
          scheduled_at: string
          status: string
          outcome: string | null
          notes: string | null
          rating: number | null
          visitor_count: number
          cab_required: boolean
          cab_details: Json
          checked_in_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          lead_id: string
          assigned_to?: string | null
          scheduled_at: string
          status?: string
          outcome?: string | null
          notes?: string | null
          rating?: number | null
          visitor_count?: number
          cab_required?: boolean
          cab_details?: Json
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          lead_id?: string
          assigned_to?: string | null
          scheduled_at?: string
          status?: string
          outcome?: string | null
          notes?: string | null
          rating?: number | null
          visitor_count?: number
          cab_required?: boolean
          cab_details?: Json
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_partners: {
        Row: {
          id: string
          org_id: string
          firm_name: string
          rera_registration_number: string | null
          contact_person: string
          phone: string
          email: string | null
          pan_number: string | null
          gst_number: string | null
          tier: string
          status: string
          default_commission_rate: number
          bank_details: Json
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          firm_name: string
          rera_registration_number?: string | null
          contact_person: string
          phone: string
          email?: string | null
          pan_number?: string | null
          gst_number?: string | null
          tier?: string
          status?: string
          default_commission_rate?: number
          bank_details?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          firm_name?: string
          rera_registration_number?: string | null
          contact_person?: string
          phone?: string
          email?: string | null
          pan_number?: string | null
          gst_number?: string | null
          tier?: string
          status?: string
          default_commission_rate?: number
          bank_details?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_blockings: {
        Row: {
          id: string
          org_id: string
          project_id: string
          inventory_id: string
          lead_id: string
          blocked_by: string | null
          status: string
          token_amount: number
          payment_reference: string | null
          expires_at: string
          remarks: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          inventory_id: string
          lead_id: string
          blocked_by?: string | null
          status?: string
          token_amount?: number
          payment_reference?: string | null
          expires_at: string
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          inventory_id?: string
          lead_id?: string
          blocked_by?: string | null
          status?: string
          token_amount?: number
          payment_reference?: string | null
          expires_at?: string
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          org_id: string
          project_id: string
          inventory_id: string
          lead_id: string
          blocking_id: string | null
          channel_partner_id: string | null
          booking_number: string
          booking_date: string
          status: string
          base_price: number
          additional_charges: number
          total_amount: number
          booking_amount_received: number
          payment_plan: string
          documents: Json
          remarks: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          inventory_id: string
          lead_id: string
          blocking_id?: string | null
          channel_partner_id?: string | null
          booking_number: string
          booking_date?: string
          status?: string
          base_price: number
          additional_charges?: number
          total_amount: number
          booking_amount_received?: number
          payment_plan?: string
          documents?: Json
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          inventory_id?: string
          lead_id?: string
          blocking_id?: string | null
          channel_partner_id?: string | null
          booking_number?: string
          booking_date?: string
          status?: string
          base_price?: number
          additional_charges?: number
          total_amount?: number
          booking_amount_received?: number
          payment_plan?: string
          documents?: Json
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_partner_commissions: {
        Row: {
          id: string
          org_id: string
          booking_id: string
          channel_partner_id: string
          commission_type: string
          commission_rate: number
          gross_commission_amount: number
          tds_percentage: number
          net_commission_amount: number
          status: string
          milestones: Json
          paid_amount: number
          payment_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          booking_id: string
          channel_partner_id: string
          commission_type?: string
          commission_rate: number
          gross_commission_amount: number
          tds_percentage?: number
          net_commission_amount: number
          status?: string
          milestones?: Json
          paid_amount?: number
          payment_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          booking_id?: string
          channel_partner_id?: string
          commission_type?: string
          commission_rate?: number
          gross_commission_amount?: number
          tds_percentage?: number
          net_commission_amount?: number
          status?: string
          milestones?: Json
          paid_amount?: number
          payment_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          id: string
          org_id: string
          project_id: string
          lead_id: string
          inventory_id: string | null
          channel_partner_id: string | null
          assigned_to: string | null
          stage: string
          deal_value: number | null
          probability: number
          expected_close_date: string | null
          loss_reason: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          lead_id: string
          inventory_id?: string | null
          channel_partner_id?: string | null
          assigned_to?: string | null
          stage?: string
          deal_value?: number | null
          probability?: number
          expected_close_date?: string | null
          loss_reason?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          lead_id?: string
          inventory_id?: string | null
          channel_partner_id?: string | null
          assigned_to?: string | null
          stage?: string
          deal_value?: number | null
          probability?: number
          expected_close_date?: string | null
          loss_reason?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_microsites: {
        Row: {
          id: string
          org_id: string
          project_id: string
          slug: string
          custom_domain: string | null
          title: string
          tagline: string | null
          description: string | null
          hero_image_url: string | null
          virtual_tour_url: string | null
          master_plan_url: string | null
          brochure_url: string | null
          video_url: string | null
          accent_color: string | null
          theme: string
          features: Json
          faqs: Json
          is_published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          slug: string
          custom_domain?: string | null
          title: string
          tagline?: string | null
          description?: string | null
          hero_image_url?: string | null
          virtual_tour_url?: string | null
          master_plan_url?: string | null
          brochure_url?: string | null
          video_url?: string | null
          accent_color?: string | null
          theme?: string
          features?: Json
          faqs?: Json
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          slug?: string
          custom_domain?: string | null
          title?: string
          tagline?: string | null
          description?: string | null
          hero_image_url?: string | null
          virtual_tour_url?: string | null
          master_plan_url?: string | null
          brochure_url?: string | null
          video_url?: string | null
          accent_color?: string | null
          theme?: string
          features?: Json
          faqs?: Json
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_workflows: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          trigger_event: string
          filter_conditions: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          trigger_event: string
          filter_conditions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          trigger_event?: string
          filter_conditions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_workflow_steps: {
        Row: {
          id: string
          workflow_id: string
          step_order: number
          action_type: string
          action_config: Json
          created_at: string
        }
        Insert: {
          id?: string
          workflow_id: string
          step_order: number
          action_type: string
          action_config?: Json
          created_at?: string
        }
        Update: {
          id?: string
          workflow_id?: string
          step_order?: number
          action_type?: string
          action_config?: Json
          created_at?: string
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          id: string
          org_id: string
          workflow_id: string
          target_id: string
          target_type: string
          status: string
          current_step_order: number
          execution_log: Json
          error_message: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          workflow_id: string
          target_id: string
          target_type?: string
          status?: string
          current_step_order?: number
          execution_log?: Json
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          workflow_id?: string
          target_id?: string
          target_type?: string
          status?: string
          current_step_order?: number
          execution_log?: Json
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      lead_touchpoints: {
        Row: {
          id: string
          org_id: string
          lead_id: string
          project_id: string | null
          channel: string
          touchpoint_type: string
          campaign_name: string | null
          campaign_id: string | null
          ad_name: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          referrer_url: string | null
          landing_page: string | null
          channel_partner_id: string | null
          metadata: Json
          occurred_at: string
        }
        Insert: {
          id?: string
          org_id: string
          lead_id: string
          project_id?: string | null
          channel: string
          touchpoint_type: string
          campaign_name?: string | null
          campaign_id?: string | null
          ad_name?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          referrer_url?: string | null
          landing_page?: string | null
          channel_partner_id?: string | null
          metadata?: Json
          occurred_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          lead_id?: string
          project_id?: string | null
          channel?: string
          touchpoint_type?: string
          campaign_name?: string | null
          campaign_id?: string | null
          ad_name?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          referrer_url?: string | null
          landing_page?: string | null
          channel_partner_id?: string | null
          metadata?: Json
          occurred_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          timezone: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          timezone?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          name?: string
          description?: string | null
          timezone?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'teams_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organisations'
            referencedColumns: ['id']
          }
        ]
      }
      team_members: {
        Row: {
          id: string
          org_id: string
          team_id: string
          profile_id: string
          weight: number
          daily_capacity: number | null
          is_on_duty: boolean
          last_assigned_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          team_id: string
          profile_id: string
          weight?: number
          daily_capacity?: number | null
          is_on_duty?: boolean
          last_assigned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          team_id?: string
          profile_id?: string
          weight?: number
          daily_capacity?: number | null
          is_on_duty?: boolean
          last_assigned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      member_leaves: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          starts_on: string
          ends_on: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          profile_id: string
          starts_on: string
          ends_on: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          org_id?: string
          profile_id?: string
          starts_on?: string
          ends_on?: string
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'member_leaves_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      routing_rules: {
        Row: {
          id: string
          org_id: string
          name: string
          priority: number
          is_active: boolean
          match_project_ids: string[]
          match_sources: LeadSource[]
          match_connection_ids: string[]
          match_campaign_ids: string[]
          match_form_ids: string[]
          team_id: string
          strategy: string
          sticky_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          priority?: number
          is_active?: boolean
          match_project_ids?: string[]
          match_sources?: LeadSource[]
          match_connection_ids?: string[]
          match_campaign_ids?: string[]
          match_form_ids?: string[]
          team_id: string
          strategy?: string
          sticky_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          name?: string
          priority?: number
          is_active?: boolean
          match_project_ids?: string[]
          match_sources?: LeadSource[]
          match_connection_ids?: string[]
          match_campaign_ids?: string[]
          match_form_ids?: string[]
          team_id?: string
          strategy?: string
          sticky_days?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'routing_rules_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          }
        ]
      }
      lead_routing_decisions: {
        Row: {
          id: string
          org_id: string
          lead_id: string
          decided_at: string
          outcome: string
          assigned_to: string | null
          rule_id: string | null
          team_id: string | null
          strategy: string | null
          detail: Json
        }
        Insert: {
          id?: string
          org_id: string
          lead_id: string
          decided_at?: string
          outcome: string
          assigned_to?: string | null
          rule_id?: string | null
          team_id?: string | null
          strategy?: string | null
          detail?: Json
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'lead_routing_decisions_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_routing_decisions_rule_id_fkey'
            columns: ['rule_id']
            isOneToOne: false
            referencedRelation: 'routing_rules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_routing_decisions_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_routing_decisions_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          org_id: string
          recipient_profile_id: string
          type: string
          title: string
          body: string
          lead_id: string | null
          data: Json
          dedupe_key: string
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          recipient_profile_id: string
          type: string
          title: string
          body: string
          lead_id?: string | null
          data?: Json
          dedupe_key: string
          created_at?: string
          read_at?: string | null
        }
        Update: {
          org_id?: string
          recipient_profile_id?: string
          type?: string
          title?: string
          body?: string
          lead_id?: string | null
          data?: Json
          dedupe_key?: string
          created_at?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_recipient_profile_id_fkey'
            columns: ['recipient_profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_success_at: string | null
          failure_count: number
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_success_at?: string | null
          failure_count?: number
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          last_success_at?: string | null
          failure_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      notification_deliveries: {
        Row: {
          id: string
          notification_id: string
          channel: string
          status: string
          provider_message_id: string | null
          detail: string | null
          created_at: string
        }
        Insert: {
          id?: string
          notification_id: string
          channel: string
          status: string
          provider_message_id?: string | null
          detail?: string | null
          created_at?: string
        }
        Update: {
          notification_id?: string
          channel?: string
          status?: string
          provider_message_id?: string | null
          detail?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notification_deliveries_notification_id_fkey'
            columns: ['notification_id']
            isOneToOne: false
            referencedRelation: 'notifications'
            referencedColumns: ['id']
          }
        ]
      }
      scheduled_jobs: {
        Row: {
          id: string
          org_id: string | null
          kind: string
          payload: Json
          run_at: string
          status: string
          attempts: number
          max_attempts: number
          locked_until: string | null
          last_error: string | null
          dedupe_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          kind: string
          payload?: Json
          run_at?: string
          status?: string
          attempts?: number
          max_attempts?: number
          locked_until?: string | null
          last_error?: string | null
          dedupe_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string | null
          kind?: string
          payload?: Json
          run_at?: string
          status?: string
          attempts?: number
          max_attempts?: number
          locked_until?: string | null
          last_error?: string | null
          dedupe_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
