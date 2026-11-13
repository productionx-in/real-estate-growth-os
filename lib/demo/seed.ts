// lib/demo/seed.ts
// Seeds starter demonstration data for newly created real estate workspaces
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryStatus, LeadStatus, LeadPriority, LeadSource } from '@/types/database'

export async function seedWorkspaceDemoData(orgId: string, profileId?: string) {
  const service = createServiceClient()

  try {
    // 1. Create Apartment Project: "Apex Heights"
    const { data: aptProject } = await service
      .from('projects')
      .insert({
        org_id: orgId,
        name: 'Apex Heights',
        slug: 'apex-heights',
        code: 'APX-H',
        category: 'apartments',
        type: 'residential',
        status: 'launched',
        city: 'Hyderabad',
        location: 'Financial District, Gachibowli',
        description: 'Luxury high-rise residential community featuring 2 & 3 BHK apartments with clubhouse and sports amenities.',
        rera_number: 'P02400008765',
        total_area_value: 4.5,
        total_area_unit: 'acres',
        total_units_count: 24,
        approval_authority: 'HMDA & RERA',
        launch_date: '2026-01-15',
        completion_date: '2028-12-31',
      })
      .select()
      .single()

    if (aptProject) {
      // Create Towers
      const { data: towerA } = await service
        .from('project_hierarchy_nodes')
        .insert({
          org_id: orgId,
          project_id: aptProject.id,
          node_type: 'tower',
          name: 'Tower A',
          code: 'T-A',
          sequence_order: 1,
        })
        .select()
        .single()

      const { data: towerB } = await service
        .from('project_hierarchy_nodes')
        .insert({
          org_id: orgId,
          project_id: aptProject.id,
          node_type: 'tower',
          name: 'Tower B',
          code: 'T-B',
          sequence_order: 2,
        })
        .select()
        .single()

      // Units in Tower A
      const towerAUnits: { unit: string; floor: number; bhk: string; facing: string; area: number; price: number; status: InventoryStatus }[] = [
        { unit: '101', floor: 1, bhk: '2 BHK', facing: 'East', area: 1250, price: 8500000, status: 'available' },
        { unit: '102', floor: 1, bhk: '3 BHK', facing: 'North', area: 1650, price: 11200000, status: 'booked' },
        { unit: '201', floor: 2, bhk: '2 BHK', facing: 'East', area: 1250, price: 8600000, status: 'available' },
        { unit: '202', floor: 2, bhk: '3 BHK', facing: 'North', area: 1650, price: 11300000, status: 'on_hold' },
        { unit: '301', floor: 3, bhk: '2 BHK', facing: 'East', area: 1250, price: 8700000, status: 'sold' },
        { unit: '302', floor: 3, bhk: '3 BHK', facing: 'North', area: 1650, price: 11400000, status: 'available' },
        { unit: '401', floor: 4, bhk: '2 BHK', facing: 'East', area: 1250, price: 8800000, status: 'available' },
        { unit: '402', floor: 4, bhk: '3.5 BHK', facing: 'East', area: 1950, price: 13500000, status: 'booked' },
      ]

      for (const u of towerAUnits) {
        await service.from('inventory_items').insert({
          org_id: orgId,
          project_id: aptProject.id,
          hierarchy_node_id: towerA?.id || null,
          category: 'apartments',
          unit_number: u.unit,
          tower_name: 'Tower A',
          floor_number: u.floor,
          bhk_config: u.bhk,
          facing: u.facing,
          area_value: u.area,
          area_unit: 'sq_ft',
          carpet_area: Math.round(u.area * 0.72),
          built_up_area: u.area,
          base_rate: Math.round(u.price / u.area),
          total_price: u.price,
          status: u.status,
          internal_notes: `Standard sample inventory record for ${u.bhk} in Tower A.`,
        })
      }

      // Units in Tower B
      const towerBUnits: { unit: string; floor: number; bhk: string; facing: string; area: number; price: number; status: InventoryStatus }[] = [
        { unit: '101', floor: 1, bhk: '3 BHK', facing: 'East', area: 1650, price: 11200000, status: 'available' },
        { unit: '102', floor: 1, bhk: '3 BHK', facing: 'West', area: 1650, price: 11200000, status: 'blocked' },
        { unit: '201', floor: 2, bhk: '3 BHK', facing: 'East', area: 1650, price: 11300000, status: 'available' },
        { unit: '202', floor: 2, bhk: '3 BHK', facing: 'West', area: 1650, price: 11300000, status: 'sold' },
      ]

      for (const u of towerBUnits) {
        await service.from('inventory_items').insert({
          org_id: orgId,
          project_id: aptProject.id,
          hierarchy_node_id: towerB?.id || null,
          category: 'apartments',
          unit_number: u.unit,
          tower_name: 'Tower B',
          floor_number: u.floor,
          bhk_config: u.bhk,
          facing: u.facing,
          area_value: u.area,
          area_unit: 'sq_ft',
          carpet_area: Math.round(u.area * 0.72),
          built_up_area: u.area,
          base_rate: Math.round(u.price / u.area),
          total_price: u.price,
          status: u.status,
        })
      }
    }

    // 2. Create Plotted Development Project: "Greenfield Meadows"
    const { data: plotProject } = await service
      .from('projects')
      .insert({
        org_id: orgId,
        name: 'Greenfield Meadows',
        slug: 'greenfield-meadows',
        code: 'GF-MDW',
        category: 'plotted_developments',
        type: 'plots',
        status: 'ongoing',
        city: 'Hyderabad',
        location: 'Bengaluru Highway, Shadnagar',
        description: 'HMDA & RERA approved premium gated community villa plots with wide blacktop roads and underground cabling.',
        rera_number: 'P02400009123',
        total_area_value: 12.0,
        total_area_unit: 'acres',
        total_units_count: 16,
        approval_authority: 'HMDA',
        launch_date: '2025-11-01',
        completion_date: '2027-06-30',
      })
      .select()
      .single()

    if (plotProject) {
      const { data: blockA } = await service
        .from('project_hierarchy_nodes')
        .insert({
          org_id: orgId,
          project_id: plotProject.id,
          node_type: 'block',
          name: 'Block A',
          code: 'BLK-A',
          sequence_order: 1,
        })
        .select()
        .single()

      const plots: { unit: string; area: number; price: number; facing: string; corner: boolean; road: number; status: InventoryStatus }[] = [
        { unit: 'Plot 1', area: 200, price: 4000000, facing: 'East', corner: true, road: 40, status: 'available' },
        { unit: 'Plot 2', area: 167, price: 3340000, facing: 'East', corner: false, road: 33, status: 'available' },
        { unit: 'Plot 3', area: 167, price: 3340000, facing: 'North', corner: false, road: 33, status: 'on_hold' },
        { unit: 'Plot 4', area: 220, price: 4400000, facing: 'North', corner: true, road: 40, status: 'booked' },
        { unit: 'Plot 5', area: 167, price: 3340000, facing: 'West', corner: false, road: 33, status: 'available' },
        { unit: 'Plot 6', area: 167, price: 3340000, facing: 'West', corner: false, road: 33, status: 'sold' },
      ]

      for (const p of plots) {
        await service.from('inventory_items').insert({
          org_id: orgId,
          project_id: plotProject.id,
          hierarchy_node_id: blockA?.id || null,
          category: 'plotted_developments',
          unit_number: p.unit,
          area_value: p.area,
          area_unit: 'sq_yards',
          plot_area: p.area,
          facing: p.facing,
          is_corner_plot: p.corner,
          road_width_ft: p.road,
          base_rate: Math.round(p.price / p.area),
          total_price: p.price,
          status: p.status,
        })
      }
    }

    // 3. Create Sample Leads
    const sampleLeads: {
      name: string
      phone: string
      email: string
      status: LeadStatus
      priority: LeadPriority
      source: LeadSource
      budget_min: number
      budget_max: number
      project_id: string | null
      notes: string
    }[] = [
      {
        name: 'Rajesh Kumar',
        phone: '+91 98490 12345',
        email: 'rajesh.kumar@example.com',
        status: 'site_visit_scheduled',
        priority: 'high',
        source: 'meta_ads',
        budget_min: 8000000,
        budget_max: 12000000,
        project_id: aptProject?.id || null,
        notes: 'Interested in 3 BHK in Tower A with East facing. Site visit scheduled for Sunday.',
      },
      {
        name: 'Priya Sharma',
        phone: '+91 98765 43210',
        email: 'priya.sharma@example.com',
        status: 'negotiation',
        priority: 'high',
        source: 'walk_in',
        budget_min: 10000000,
        budget_max: 14000000,
        project_id: aptProject?.id || null,
        notes: 'Requested final pricing sheet with parking charges included.',
      },
      {
        name: 'Venkat Rao',
        phone: '+91 94400 55667',
        email: 'venkat.rao@example.com',
        status: 'booked',
        priority: 'medium',
        source: 'referral',
        budget_min: 3000000,
        budget_max: 4500000,
        project_id: plotProject?.id || null,
        notes: 'Booking token received for Plot 4 in Greenfield Meadows.',
      },
      {
        name: 'Sneha Reddy',
        phone: '+91 91234 56789',
        email: 'sneha.reddy@example.com',
        status: 'contacted',
        priority: 'medium',
        source: 'google_ads',
        budget_min: 8500000,
        budget_max: 9500000,
        project_id: aptProject?.id || null,
        notes: 'Enquired about loan eligibility and pre-approval offers.',
      },
      {
        name: 'Anand Verma',
        phone: '+91 99887 76655',
        email: 'anand.verma@example.com',
        status: 'new',
        priority: 'low',
        source: 'housing',
        budget_min: 3000000,
        budget_max: 3500000,
        project_id: plotProject?.id || null,
        notes: 'Looking for investment plot near Shadnagar.',
      },
    ]

    for (const lead of sampleLeads) {
      await service.from('leads').insert({
        org_id: orgId,
        project_id: lead.project_id,
        assigned_to: profileId || null,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        priority: lead.priority,
        source: lead.source,
        budget_min: lead.budget_min,
        budget_max: lead.budget_max,
        notes: lead.notes,
      })
    }
  } catch (err) {
    console.error('Warning: Failed to seed demo data (ignoring to allow org creation):', err)
  }
}
