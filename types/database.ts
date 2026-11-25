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
export type MemberRole = 'owner' | 'admin' | 'manager' | 'team_lead' | 'sales_exec' | 'post_sales' | 'readonly'
export type SupportGrantStatus = 'pending' | 'approved' | 'denied' | 'revoked' | 'cancelled'
export type PlatformRole = 'super_admin' | 'sales_manager' | 'sales_rep' | 'finance_admin' | 'support_agent' | 'platform_admin' | 'auditor'
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
export type OrgLifecycleState = 'pending_setup' | 'active' | 'grace' | 'suspended' | 'deactivated'

export type ActivityType =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'note_added'
  | 'call_logged'
  | 'site_visit_scheduled'
  | 'site_visited'
  | 'whatsapp_logged'
  | 'follow_up_scheduled'
  | 'follow_up_completed'
  | 'details_updated'

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
          source: 'platform' | 'public'
          id: string
          requested_by: string | null
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
          source?: 'platform' | 'public'
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
          source?: 'platform' | 'public'
          id?: string
          requested_by?: string | null
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
        Relationships: [
          { foreignKeyName: 'subscription_plan_versions_plan_id_fkey'; columns: ['plan_id']; isOneToOne: false; referencedRelation: 'subscription_plans'; referencedColumns: ['id'] }
        ]
      }
      org_subscription_invoices: {
        Row: {
          id: string
          org_id: string
          subscription_id: string
          invoice_number: string
          currency: string
          amount_cents: number
          status: 'issued' | 'paid' | 'void' | 'canceled'
          due_date: string | null
          paid_at: string | null
          payment_reference: string | null
          created_at: string
          updated_at: string
          invoice_type: 'subscription' | 'renewal' | 'additional_seats'
          seat_quantity: number | null
          unit_price_cents: number | null
          subtotal_cents: number | null
          tax_cents: number
          plan_version_id: string | null
          billing_cycle: 'monthly' | 'annual' | null
          gateway: 'razorpay' | null
          gateway_order_id: string | null
          checkout_by: string | null
          issued_by_profile: string | null
          gst_rate_bps: number | null
          cgst_cents: number | null
          sgst_cents: number | null
          igst_cents: number | null
          supplier_gstin: string | null
          supplier_legal_name: string | null
          supplier_state_code: string | null
          sac_code: string | null
          customer_gstin: string | null
          customer_legal_name: string | null
          place_of_supply: string | null
        }
        Insert: never
        Update: {
          status?: 'issued' | 'paid' | 'void' | 'canceled'
          updated_at?: string
          gateway?: 'razorpay' | null
          gateway_order_id?: string | null
          checkout_by?: string | null
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
          lifecycle_state: OrgLifecycleState
          lifecycle_reason: string | null
          lifecycle_changed_at: string | null
          is_demo: boolean
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
          lifecycle_state?: OrgLifecycleState
          lifecycle_reason?: string | null
          lifecycle_changed_at?: string | null
          is_demo?: boolean
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
          lifecycle_state?: OrgLifecycleState
          lifecycle_reason?: string | null
          lifecycle_changed_at?: string | null
          is_demo?: boolean
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
          lifecycle_saved_role: MemberRole | null
          lifecycle_suspended: boolean
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
          lifecycle_saved_role?: MemberRole | null
          lifecycle_suspended?: boolean
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
          lifecycle_saved_role?: MemberRole | null
          lifecycle_suspended?: boolean
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
          latitude: number | null
          longitude: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          assigned_at: string | null
          first_action_at: string | null
          sla_due_at: string | null
          sla_state: 'pending' | 'nudged' | 'met' | 'breached' | null
          next_follow_up_at: string | null
          source: LeadSource
          status: LeadStatus
          priority: LeadPriority
          budget_min: number | null
          budget_max: number | null
          req_configurations: string[]
          req_categories: string[]
          req_locations: string[]
          req_facing: string[]
          req_min_area: number | null
          req_max_area: number | null
          requirements_updated_at: string | null
          received_at: string | null
          source_submitted_at: string | null
          tags: string[]
          merged_into_id: string | null
          merged_at: string | null
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
          assigned_at?: string | null
          first_action_at?: string | null
          sla_due_at?: string | null
          sla_state?: 'pending' | 'nudged' | 'met' | 'breached' | null
          next_follow_up_at?: string | null
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
          req_configurations?: string[]
          req_categories?: string[]
          req_locations?: string[]
          req_facing?: string[]
          req_min_area?: number | null
          req_max_area?: number | null
          requirements_updated_at?: string | null
          received_at?: string | null
          source_submitted_at?: string | null
          tags?: string[]
          merged_into_id?: string | null
          merged_at?: string | null
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
          assigned_at?: string | null
          first_action_at?: string | null
          sla_due_at?: string | null
          sla_state?: 'pending' | 'nudged' | 'met' | 'breached' | null
          next_follow_up_at?: string | null
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
          req_configurations?: string[]
          req_categories?: string[]
          req_locations?: string[]
          req_facing?: string[]
          req_min_area?: number | null
          req_max_area?: number | null
          requirements_updated_at?: string | null
          received_at?: string | null
          source_submitted_at?: string | null
          tags?: string[]
          merged_into_id?: string | null
          merged_at?: string | null
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
          file_type: 'csv' | 'xlsx' | 'generated'
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
          file_type: 'csv' | 'xlsx' | 'generated'
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
          file_type?: 'csv' | 'xlsx' | 'generated'
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
          last_auto_reply_at: string | null
          opted_out_at: string | null
          last_inbound_at: string | null
          contact_name: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_direction: 'inbound' | 'outbound' | null
          unread_count: number
          last_read_at: string | null
          last_read_by: string | null
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
          last_auto_reply_at?: string | null
          opted_out_at?: string | null
          last_inbound_at?: string | null
          contact_name?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_direction?: 'inbound' | 'outbound' | null
          unread_count?: number
          last_read_at?: string | null
          last_read_by?: string | null
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
          last_auto_reply_at?: string | null
          opted_out_at?: string | null
          last_inbound_at?: string | null
          contact_name?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_direction?: 'inbound' | 'outbound' | null
          unread_count?: number
          last_read_at?: string | null
          last_read_by?: string | null
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
          sent_by: string | null
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
          sent_by?: string | null
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
          sent_by?: string | null
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
          accompanied_by: string | null
          meeting_link: string | null
          cancel_reason: string | null
          checkin_lat: number | null
          checkin_lng: number | null
          checkin_distance_m: number | null
          created_by: string | null
          updated_by: string | null
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
          accompanied_by?: string | null
          meeting_link?: string | null
          cancel_reason?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_distance_m?: number | null
          created_by?: string | null
          updated_by?: string | null
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
          accompanied_by?: string | null
          meeting_link?: string | null
          cancel_reason?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          checkin_distance_m?: number | null
          created_by?: string | null
          updated_by?: string | null
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
      lead_response_settings: {
        Row: {
          org_id: string
          first_response_minutes: number
          nudge_minutes: number
          reassign_on_breach: boolean
          workday_start: string
          workday_end: string
          timezone: string
          updated_at: string
        }
        Insert: {
          org_id: string
          first_response_minutes?: number
          nudge_minutes?: number
          reassign_on_breach?: boolean
          workday_start?: string
          workday_end?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          first_response_minutes?: number
          nudge_minutes?: number
          reassign_on_breach?: boolean
          workday_start?: string
          workday_end?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_tasks: {
        Row: {
          id: string
          org_id: string
          lead_id: string
          assigned_to: string | null
          kind: 'call' | 'whatsapp' | 'meeting' | 'site_visit' | 'other'
          due_at: string
          note: string | null
          status: 'open' | 'done' | 'cancelled'
          created_by: string | null
          created_at: string
          completed_at: string | null
          reminded_at: string | null
          overdue_alerted_at: string | null
          site_visit_id: string | null
        }
        Insert: {
          id?: string
          org_id: string
          lead_id: string
          assigned_to?: string | null
          kind?: 'call' | 'whatsapp' | 'meeting' | 'site_visit' | 'other'
          due_at: string
          note?: string | null
          status?: 'open' | 'done' | 'cancelled'
          created_by?: string | null
          created_at?: string
          completed_at?: string | null
          reminded_at?: string | null
          overdue_alerted_at?: string | null
          site_visit_id?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          lead_id?: string
          assigned_to?: string | null
          kind?: 'call' | 'whatsapp' | 'meeting' | 'site_visit' | 'other'
          due_at?: string
          note?: string | null
          status?: 'open' | 'done' | 'cancelled'
          created_by?: string | null
          created_at?: string
          completed_at?: string | null
          reminded_at?: string | null
          overdue_alerted_at?: string | null
          site_visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'lead_tasks_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_tasks_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          }
        ]
      }
      org_module_entitlements: {
        Row: { org_id: string; module: string; enabled: boolean; reason: string | null; updated_by: string | null; updated_at: string }
        Insert: { org_id: string; module: string; enabled: boolean; reason?: string | null; updated_by?: string | null }
        Update: { enabled?: boolean; reason?: string | null; updated_by?: string | null }
        Relationships: []
      }
      support_access_grants: {
        Row: {
          id: string
          org_id: string
          requested_by: string
          requested_by_label: string
          reason: string
          access_level: 'read_only'
          duration_minutes: number
          status: SupportGrantStatus
          emergency: boolean
          decided_by_profile: string | null
          decided_by_user: string | null
          decided_at: string | null
          decision_note: string | null
          expires_at: string | null
          revoked_at: string | null
          revoked_by_user: string | null
          created_at: string
        }
        Insert: {
          org_id: string
          requested_by: string
          requested_by_label: string
          reason: string
          duration_minutes: number
        }
        Update: Partial<{ status: SupportGrantStatus }>
        Relationships: []
      }
      org_audit_logs: {
        Row: {
          id: string
          org_id: string
          actor_kind: 'member' | 'platform' | 'support' | 'system'
          actor_user_id: string | null
          actor_profile_id: string | null
          actor_label: string | null
          action: string
          target_type: string | null
          target_id: string | null
          metadata: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          actor_kind: 'member' | 'platform' | 'support' | 'system'
          actor_user_id?: string | null
          actor_profile_id?: string | null
          actor_label?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      organisation_state_events: {
        Row: {
          id: string
          org_id: string
          from_state: string
          to_state: string
          reason: string
          actor_user_id: string | null
          actor_kind: 'platform' | 'system' | 'member'
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          from_state: string
          to_state: string
          reason: string
          actor_user_id?: string | null
          actor_kind: 'platform' | 'system' | 'member'
          created_at?: string
        }
        Update: never
        Relationships: []
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
      saved_views: {
        Row: {
          id: string
          org_id: string
          owner_id: string
          entity: string
          name: string
          layout: string
          filters: Json
          shared: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          owner_id: string
          entity?: string
          name: string
          layout?: string
          filters?: Json
          shared?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          layout?: string
          filters?: Json
          shared?: boolean
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'saved_views_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      document_templates: {
        Row: {
          id: string
          org_id: string
          name: string
          kind: string
          body: string
          letterhead: boolean
          archived: boolean
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          kind?: string
          body: string
          letterhead?: boolean
          archived?: boolean
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          kind?: string
          body?: string
          letterhead?: boolean
          archived?: boolean
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_documents: {
        Row: {
          id: string
          org_id: string
          lead_id: string
          template_id: string | null
          unit_id: string | null
          title: string
          body: string
          share_token: string
          expires_at: string
          revoked_at: string | null
          view_count: number
          first_viewed_at: string | null
          last_viewed_at: string | null
          letterhead: Json | null
          edited: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          lead_id: string
          template_id?: string | null
          unit_id?: string | null
          title: string
          body: string
          share_token: string
          expires_at: string
          revoked_at?: string | null
          view_count?: number
          first_viewed_at?: string | null
          last_viewed_at?: string | null
          letterhead?: Json | null
          edited?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          revoked_at?: string | null
          view_count?: number
          first_viewed_at?: string | null
          last_viewed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'lead_documents_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      org_addons: {
        Row: {
          org_id: string
          addon: string
          enabled: boolean
          setup_fee_paise: number
          monthly_fee_paise: number
          included_layouts: number
          notes: string | null
          updated_by: string | null
          enabled_at: string | null
          updated_at: string
        }
        Insert: {
          org_id: string
          addon: string
          enabled?: boolean
          setup_fee_paise?: number
          monthly_fee_paise?: number
          included_layouts?: number
          notes?: string | null
          updated_by?: string | null
          enabled_at?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          setup_fee_paise?: number
          monthly_fee_paise?: number
          included_layouts?: number
          notes?: string | null
          updated_by?: string | null
          enabled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_addons: {
        Row: {
          id: string
          org_id: string
          project_id: string
          addon: string
          status: string
          valid_until: string | null
          setup_fee_paise: number
          monthly_fee_paise: number
          notes: string | null
          status_reason: string | null
          requested_by: string | null
          requested_at: string | null
          activated_at: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          addon: string
          status?: string
          valid_until?: string | null
          setup_fee_paise?: number
          monthly_fee_paise?: number
          notes?: string | null
          status_reason?: string | null
          requested_by?: string | null
          requested_at?: string | null
          activated_at?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          valid_until?: string | null
          setup_fee_paise?: number
          monthly_fee_paise?: number
          notes?: string | null
          status_reason?: string | null
          requested_by?: string | null
          requested_at?: string | null
          activated_at?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_addon_events: {
        Row: {
          id: string
          org_id: string
          project_id: string
          addon: string
          from_status: string | null
          to_status: string
          valid_until: string | null
          reason: string | null
          actor_user: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          addon: string
          from_status?: string | null
          to_status: string
          valid_until?: string | null
          reason?: string | null
          actor_user?: string | null
          created_at?: string
        }
        Update: {
          org_id?: string
          project_id?: string
          addon?: string
          from_status?: string | null
          to_status?: string
          valid_until?: string | null
          reason?: string | null
          actor_user?: string | null
          created_at?: string
        }
        Relationships: []
      }
      plot_map_documents: {
        Row: {
          id: string
          org_id: string
          project_id: string
          layout_id: string
          kind: string
          file_name: string
          byte_size: number
          storage_path: string
          sha256: string | null
          status: string
          error: string | null
          page_count: number | null
          pages: Json
          uploaded_by: string | null
          checked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          layout_id: string
          kind: string
          file_name: string
          byte_size: number
          storage_path: string
          sha256?: string | null
          status?: string
          error?: string | null
          page_count?: number | null
          pages?: Json
          uploaded_by?: string | null
          checked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          project_id?: string
          layout_id?: string
          kind?: string
          file_name?: string
          byte_size?: number
          storage_path?: string
          sha256?: string | null
          status?: string
          error?: string | null
          page_count?: number | null
          pages?: Json
          uploaded_by?: string | null
          checked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plot_map_versions: {
        Row: {
          rendered_at: string | null
          id: string
          org_id: string
          project_id: string
          layout_id: string
          document_id: string
          version_no: number
          page: number
          rotation: number
          status: string
          render_status: string
          render_error: string | null
          image_path: string
          thumb_path: string
          image_width: number | null
          image_height: number | null
          render: Json
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          rendered_at?: string | null
          id?: string
          org_id: string
          project_id: string
          layout_id: string
          document_id: string
          version_no: number
          page: number
          rotation?: number
          status?: string
          render_status?: string
          render_error?: string | null
          image_path: string
          thumb_path: string
          image_width?: number | null
          image_height?: number | null
          render?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          rendered_at?: string | null
          org_id?: string
          project_id?: string
          layout_id?: string
          document_id?: string
          version_no?: number
          page?: number
          rotation?: number
          status?: string
          render_status?: string
          render_error?: string | null
          image_path?: string
          thumb_path?: string
          image_width?: number | null
          image_height?: number | null
          render?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plot_map_shapes: {
        Row: {
          id: string
          org_id: string
          project_id: string
          version_id: string
          label: string
          kind: string
          points: Json
          unit_id: string | null
          linked_by: string | null
          linked_at: string | null
          source: string
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          version_id: string
          label: string
          kind?: string
          points: Json
          unit_id?: string | null
          linked_by?: string | null
          linked_at?: string | null
          source?: string
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          project_id?: string
          version_id?: string
          label?: string
          kind?: string
          points?: Json
          unit_id?: string | null
          linked_by?: string | null
          linked_at?: string | null
          source?: string
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plot_map_reviews: {
        Row: {
          id: string
          org_id: string
          project_id: string
          version_id: string
          action: string
          from_status: string
          to_status: string
          comment: string | null
          actor: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          version_id: string
          action: string
          from_status: string
          to_status: string
          comment?: string | null
          actor?: string | null
          created_at?: string
        }
        Update: {
          org_id?: string
          project_id?: string
          version_id?: string
          action?: string
          from_status?: string
          to_status?: string
          comment?: string | null
          actor?: string | null
          created_at?: string
        }
        Relationships: []
      }
      plot_map_setup_blockers: {
        Row: {
          id: string
          org_id: string
          project_id: string
          stage: string
          waiting_on: string
          reason: string
          raised_by: string | null
          raised_at: string
          resolved_by: string | null
          resolved_at: string | null
          resolution: string | null
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          stage: string
          waiting_on: string
          reason: string
          raised_by?: string | null
          raised_at?: string
          resolved_by?: string | null
          resolved_at?: string | null
          resolution?: string | null
        }
        Update: {
          org_id?: string
          project_id?: string
          stage?: string
          waiting_on?: string
          reason?: string
          raised_by?: string | null
          raised_at?: string
          resolved_by?: string | null
          resolved_at?: string | null
          resolution?: string | null
        }
        Relationships: []
      }
      plot_map_staff_access: {
        Row: {
          id: string
          org_id: string
          project_id: string
          granted_by: string | null
          granted_at: string
          expires_at: string
          revoked_by: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          granted_by?: string | null
          granted_at?: string
          expires_at: string
          revoked_by?: string | null
          revoked_at?: string | null
        }
        Update: {
          revoked_by?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      plot_map_setup_assignments: {
        Row: {
          project_id: string
          org_id: string
          assignee_user: string | null
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          project_id: string
          org_id: string
          assignee_user?: string | null
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: {
          project_id?: string
          org_id?: string
          assignee_user?: string | null
          assigned_by?: string | null
          assigned_at?: string
        }
        Relationships: []
      }
      plot_layouts: {
        Row: {
          embed_domains: string[]
          published_version_id: string | null
          id: string
          org_id: string
          project_id: string
          name: string
          view_box: string
          geometry: Json
          status: string
          share_token: string | null
          share_enabled: boolean
          show_prices: boolean
          published_at: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          embed_domains?: string[]
          published_version_id?: string | null
          id?: string
          org_id: string
          project_id: string
          name: string
          view_box?: string
          geometry?: Json
          status?: string
          share_token?: string | null
          share_enabled?: boolean
          show_prices?: boolean
          published_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          embed_domains?: string[]
          published_version_id?: string | null
          name?: string
          view_box?: string
          geometry?: Json
          status?: string
          share_token?: string | null
          share_enabled?: boolean
          show_prices?: boolean
          published_at?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plot_layout_links: {
        Row: {
          layout_id: string
          org_id: string
          shape_key: string
          unit_id: string
        }
        Insert: {
          layout_id: string
          org_id: string
          shape_key: string
          unit_id: string
        }
        Update: {

        }
        Relationships: []
      }
      org_business_profiles: {
        Row: {
          org_id: string
          legal_name: string | null
          address: string | null
          city: string | null
          state: string | null
          pincode: string | null
          gstin: string | null
          pan: string | null
          rera_number: string | null
          phone: string | null
          email: string | null
          website: string | null
          logo_url: string | null
          signatory_name: string | null
          signatory_title: string | null
          bank_account_name: string | null
          bank_name: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          footer_note: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          org_id: string
          legal_name?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          gstin?: string | null
          pan?: string | null
          rera_number?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          logo_url?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          bank_account_name?: string | null
          bank_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          footer_note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          legal_name?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          gstin?: string | null
          pan?: string | null
          rera_number?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          logo_url?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          bank_account_name?: string | null
          bank_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          footer_note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
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
      plot_map_staff_access_active: {
        Args: { p_project: string }
        Returns: boolean
      }
      save_plot_map_shapes_as_staff: {
        Args: { p_org: string; p_version: string; p_actor: string | null; p_shapes: Json }
        Returns: number
      }
      plot_map_embed_origins: {
        Args: { p_token: string }
        Returns: string[]
      }
      plot_map_version_action: {
        Args: { p_org: string; p_version: string; p_actor: string; p_action: string; p_comment: string | null }
        Returns: string
      }
      save_plot_map_shapes: {
        Args: { p_org: string; p_version: string; p_actor: string; p_shapes: Json }
        Returns: number
      }
      next_plot_map_version_no: {
        Args: { p_layout: string }
        Returns: number
      }
      project_addon_state: {
        Args: { p_project: string; p_addon: string }
        Returns: string
      }
      lead_pipeline_timing: { Args: { p_org: string; p_from: string; p_to: string }; Returns: Json }
      merge_leads: { Args: { p_org: string; p_target: string; p_source: string; p_actor_profile: string }; Returns: Json }
      billing_start_trial: { Args: { p_org: string; p_plan_code: string; p_actor_profile: string | null }; Returns: string }
      billing_issue_plan_invoice: { Args: { p_org: string; p_plan_code: string; p_cycle: string; p_actor_profile: string | null }; Returns: string }
      billing_issue_seat_invoice: { Args: { p_org: string; p_seats: number; p_actor_profile: string | null }; Returns: string }
      billing_issue_renewal_invoice: { Args: { p_org: string; p_actor_profile: string | null }; Returns: string }
      billing_settle_gateway_payment: { Args: { p_order_id: string; p_payment_id: string; p_amount_cents: number; p_currency: string }; Returns: Json }
      record_document_view: {
        Args: { p_token: string }
        Returns: { id: string; org_id: string; lead_id: string; title: string; body: string; created_by: string | null; created_at: string }[]
      }
      log_lead_outcome: {
        Args: {
          p_lead: string
          p_actor: string
          p_outcome: string
          p_new_status: LeadStatus
          p_note: string | null
          p_follow_up_at: string | null
          p_follow_up_kind: string
        }
        Returns: Json
      }
      lead_response_report: {
        Args: { p_org: string; p_from: string; p_to: string }
        Returns: Json
      }
      set_organisation_lifecycle: {
        Args: { p_org: string; p_state: OrgLifecycleState; p_reason: string; p_actor_user: string | null; p_actor_kind?: string; p_actor_label?: string | null }
        Returns: Json
      }
      set_module_entitlement: {
        Args: { p_org: string; p_module: string; p_enabled: boolean; p_reason: string; p_actor: string; p_label: string }
        Returns: Json
      }
      request_support_access: {
        Args: { p_org: string; p_user: string; p_label: string; p_reason: string; p_minutes: number }
        Returns: string
      }
      decide_support_access: {
        Args: { p_grant: string; p_profile: string; p_user: string; p_label: string; p_approve: boolean; p_note?: string | null }
        Returns: Json
      }
      emergency_support_access: {
        Args: { p_grant: string; p_user: string; p_label: string; p_reason: string; p_minutes: number }
        Returns: Json
      }
      end_support_access: {
        Args: { p_grant: string; p_side: 'customer' | 'platform'; p_user: string; p_profile: string | null; p_label: string }
        Returns: string
      }
      active_support_grant: {
        Args: { p_org: string; p_user: string }
        Returns: string | null
      }
      revoke_user_sessions: {
        Args: { p_auth_user: string }
        Returns: number
      }
      process_lead_responses: {
        Args: { p_now?: string }
        Returns: Json
      }
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
