// types/database.ts
// Hand-authored until: npx supabase gen types typescript --project-id <ref> > types/database.ts

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
export type ProjectType = 'residential' | 'commercial' | 'mixed_use' | 'plots'
export type ProjectStatus = 'planning' | 'pre_launch' | 'launched' | 'ongoing' | 'completed'
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
          type: ProjectType
          status: ProjectStatus
          location: string | null
          city: string | null
          description: string | null
          brochure_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          slug: string
          type?: ProjectType
          status?: ProjectStatus
          location?: string | null
          city?: string | null
          description?: string | null
          brochure_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          slug?: string
          type?: ProjectType
          status?: ProjectStatus
          location?: string | null
          city?: string | null
          description?: string | null
          brochure_url?: string | null
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
      project_type: ProjectType
      project_status: ProjectStatus
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

// Convenience type for Supabase table access
type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]
