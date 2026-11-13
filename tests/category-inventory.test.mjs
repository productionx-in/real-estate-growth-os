// tests/category-inventory.test.mjs
// Test suite for Stage 3C: Category-Aware Inventory Creation, Editing, Mixed-Use & Hierarchy Integration
import assert from 'node:assert/strict'

console.log('--- Running Category-Aware Inventory Management (Stage 3C) Tests ---')

// Mock Database State
const DB = {
  organisations: [
    { id: 'org-alpha', name: 'Alpha Developers', slug: 'alpha' },
    { id: 'org-beta', name: 'Beta Realty', slug: 'beta' },
  ],
  profiles: [
    { id: 'prof-mgr', full_name: 'Inventory Manager' },
    { id: 'prof-ro', full_name: 'Read Only Member' },
  ],
  org_members: [
    { id: 'm-1', org_id: 'org-alpha', profile_id: 'prof-mgr', role: 'manager' },
    { id: 'm-2', org_id: 'org-alpha', profile_id: 'prof-ro', role: 'readonly' },
  ],
  projects: [
    { id: 'proj-apt', org_id: 'org-alpha', name: 'Highland Residences', category: 'apartments' },
    { id: 'proj-plot', org_id: 'org-alpha', name: 'Valley Plotted Layout', category: 'plotted_developments' },
    { id: 'proj-comm', org_id: 'org-alpha', name: 'Summit Business Hub', category: 'commercial_sale' },
    { id: 'proj-villa', org_id: 'org-alpha', name: 'Serene Villa Enclave', category: 'villas_gated_communities' },
    { id: 'proj-mixed', org_id: 'org-alpha', name: 'Grand Central Mixed Hub', category: 'mixed_use' },
    { id: 'proj-ext', org_id: 'org-beta', name: 'Beta Project', category: 'apartments' },
  ],
  hierarchy_nodes: [
    { id: 'node-twr-a', project_id: 'proj-apt', org_id: 'org-alpha', name: 'Tower A', node_type: 'tower' },
    { id: 'node-fl-01', project_id: 'proj-apt', org_id: 'org-alpha', parent_id: 'node-twr-a', name: '1st Floor', node_type: 'floor' },
    { id: 'node-blk-b', project_id: 'proj-plot', org_id: 'org-alpha', name: 'Block B', node_type: 'block' },
    { id: 'node-ext', project_id: 'proj-ext', org_id: 'org-beta', name: 'External Tower', node_type: 'tower' },
  ],
  inventory_items: [],
}

// Logic: Simulate POST /api/inventory
function handleCreateInventory({ callerProfileId, body }) {
  const project = DB.projects.find((p) => p.id === body.project_id)
  if (!project) return { status: 404, error: 'Project not found' }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  // Category consistency
  if (project.category !== 'mixed_use' && body.category !== project.category) {
    return {
      status: 400,
      error: `Inventory category '${body.category}' does not match project category '${project.category}'.`,
    }
  }

  // Duplicate check
  const duplicate = DB.inventory_items.find(
    (i) => i.project_id === body.project_id && i.unit_number.toLowerCase() === body.unit_number.trim().toLowerCase()
  )
  if (duplicate) {
    return { status: 409, error: `Unit number '${body.unit_number}' already exists in this project.` }
  }

  // Hierarchy consistency
  if (body.hierarchy_node_id) {
    const node = DB.hierarchy_nodes.find((n) => n.id === body.hierarchy_node_id)
    if (!node || node.project_id !== body.project_id || node.org_id !== project.org_id) {
      return { status: 400, error: 'Hierarchy node does not belong to this project and organisation.' }
    }
  }

  if (!body.area_value || Number(body.area_value) <= 0) {
    return { status: 400, error: 'Area must be a positive number' }
  }

  const newItem = {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    org_id: project.org_id,
    project_id: body.project_id,
    hierarchy_node_id: body.hierarchy_node_id || null,
    unit_number: body.unit_number.trim(),
    category: body.category,
    status: body.status || 'available',
    area_value: Number(body.area_value),
    area_unit: body.area_unit || 'sqft',
    carpet_area: body.carpet_area ?? null,
    built_up_area: body.built_up_area ?? null,
    super_built_up_area: body.super_built_up_area ?? null,
    plot_area: body.plot_area ?? null,
    plot_dimensions: body.plot_dimensions || null,
    road_width_ft: body.road_width_ft ?? null,
    is_corner_plot: !!body.is_corner_plot,
    facing: body.facing || null,
    bhk_config: body.bhk_config || null,
    floor_number: body.floor_number ?? null,
    tower_name: body.tower_name || null,
    commercial_asset_type: body.commercial_asset_type || null,
    bedrooms: body.bedrooms ?? null,
    bathrooms: body.bathrooms ?? null,
    balconies: body.balconies ?? null,
    parking_spaces: body.parking_spaces ?? 0,
    furnishing_status: body.furnishing_status || 'unfurnished',
    base_rate: body.base_rate ?? null,
    total_price: body.total_price ?? null,
    pricing_breakup: body.pricing_breakup || {},
    internal_notes: body.internal_notes || null,
    custom_attributes: body.custom_attributes || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  DB.inventory_items.push(newItem)
  return { status: 201, data: newItem }
}

// Logic: Simulate PUT /api/inventory/[inventoryId]
function handleUpdateInventory({ callerProfileId, inventoryId, body }) {
  const item = DB.inventory_items.find((i) => i.id === inventoryId)
  if (!item) return { status: 404, error: 'Inventory item not found' }

  const membership = DB.org_members.find((m) => m.org_id === item.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  // Duplicate check if unit_number changed
  if (body.unit_number && body.unit_number.trim().toLowerCase() !== item.unit_number.toLowerCase()) {
    const duplicate = DB.inventory_items.find(
      (i) =>
        i.project_id === item.project_id &&
        i.unit_number.toLowerCase() === body.unit_number.trim().toLowerCase() &&
        i.id !== inventoryId
    )
    if (duplicate) {
      return { status: 409, error: `Unit number '${body.unit_number}' already exists in this project.` }
    }
    item.unit_number = body.unit_number.trim()
  }

  // Hierarchy validation
  if (body.hierarchy_node_id !== undefined) {
    if (body.hierarchy_node_id !== null) {
      const node = DB.hierarchy_nodes.find((n) => n.id === body.hierarchy_node_id)
      if (!node || node.project_id !== item.project_id || node.org_id !== item.org_id) {
        return { status: 400, error: 'Hierarchy node does not belong to this project and organisation.' }
      }
    }
    item.hierarchy_node_id = body.hierarchy_node_id
  }

  // Update provided fields, preserving everything else
  const allowedFields = [
    'area_value',
    'area_unit',
    'carpet_area',
    'built_up_area',
    'super_built_up_area',
    'plot_area',
    'plot_dimensions',
    'road_width_ft',
    'is_corner_plot',
    'facing',
    'bhk_config',
    'floor_number',
    'tower_name',
    'commercial_asset_type',
    'bedrooms',
    'bathrooms',
    'balconies',
    'parking_spaces',
    'furnishing_status',
    'base_rate',
    'total_price',
    'pricing_breakup',
    'internal_notes',
    'custom_attributes',
  ]

  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      item[f] = body[f]
    }
  }
  item.updated_at = new Date().toISOString()

  return { status: 200, data: item }
}

// --- EXECUTE TEST CASES ---

// 1. Create Apartment Inventory Item with Hierarchy Node
const resApt = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-apt',
    category: 'apartments',
    hierarchy_node_id: 'node-fl-01',
    unit_number: 'A-101',
    bhk_config: '3BHK',
    area_value: 1850,
    area_unit: 'sqft',
    carpet_area: 1350,
    built_up_area: 1850,
    balconies: 2,
    bedrooms: 3,
    bathrooms: 3,
    parking_spaces: 1,
    facing: 'East',
    base_rate: 6500,
    total_price: 12025000,
  },
})
assert.equal(resApt.status, 201)
assert.equal(resApt.data.unit_number, 'A-101')
assert.equal(resApt.data.hierarchy_node_id, 'node-fl-01')
console.log('✓ Test 1: Created Apartment inventory unit with floor hierarchy reference')

// 2. Create Plot Inventory Item with Plot-Specific Attributes
const resPlot = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-plot',
    category: 'plotted_developments',
    hierarchy_node_id: 'node-blk-b',
    unit_number: 'Plot-42',
    area_value: 240,
    area_unit: 'sqyd',
    plot_dimensions: '36 ft x 60 ft',
    road_width_ft: 40,
    is_corner_plot: true,
    facing: 'North-East',
    base_rate: 35000,
    total_price: 8400000,
  },
})
assert.equal(resPlot.status, 201)
assert.equal(resPlot.data.is_corner_plot, true)
assert.equal(resPlot.data.plot_dimensions, '36 ft x 60 ft')
console.log('✓ Test 2: Created Plotted Development plot with dimensions, road width, and corner indicator')

// 3. Create Commercial Sale Inventory Item (Commercial Property Sale)
const resComm = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-comm',
    category: 'commercial_sale',
    unit_number: 'Suite-502',
    commercial_asset_type: 'Office Space',
    area_value: 2800,
    area_unit: 'sqft',
    carpet_area: 2100,
    furnishing_status: 'unfurnished',
    custom_attributes: { frontage_ft: 45 },
    base_rate: 9000,
    total_price: 25200000,
  },
})
assert.equal(resComm.status, 201)
assert.equal(resComm.data.commercial_asset_type, 'Office Space')
assert.equal(resComm.data.custom_attributes.frontage_ft, 45)
console.log('✓ Test 3: Created Commercial Sale unit with office asset type and frontage')

// 4. Create Villa Inventory Item
const resVilla = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-villa',
    category: 'villas_gated_communities',
    unit_number: 'Villa-12',
    bhk_config: '4BHK Triplex',
    area_value: 3800,
    area_unit: 'sqft',
    plot_area: 320,
    bedrooms: 4,
    bathrooms: 5,
    parking_spaces: 2,
    custom_attributes: { villa_floors: 'G+2 Triplex' },
    base_rate: 11000,
    total_price: 41800000,
  },
})
assert.equal(resVilla.status, 201)
assert.equal(resVilla.data.bhk_config, '4BHK Triplex')
assert.equal(resVilla.data.plot_area, 320)
console.log('✓ Test 4: Created Villa inventory unit with plot area and triplex floors')

// 5. Mixed-Use Multi-Category Units in Same Project
// A. Create residential apartment in mixed-use project
const resMixedApt = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-mixed',
    category: 'apartments',
    unit_number: 'MU-Res-201',
    bhk_config: '2BHK',
    area_value: 1250,
    area_unit: 'sqft',
  },
})
assert.equal(resMixedApt.status, 201)
assert.equal(resMixedApt.data.category, 'apartments')

// B. Create retail commercial unit in mixed-use project
const resMixedComm = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-mixed',
    category: 'commercial_sale',
    unit_number: 'MU-Ret-04',
    commercial_asset_type: 'Retail Shop',
    area_value: 650,
    area_unit: 'sqft',
  },
})
assert.equal(resMixedComm.status, 201)
assert.equal(resMixedComm.data.category, 'commercial_sale')
console.log('✓ Test 5: Mixed-Use project permits multiple inventory categories in same project')

// 6. Category-mismatch rejection in single-category project
const mismatchRes = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-apt', // Apartments project
    category: 'plotted_developments', // Cannot put plot in apartments project
    unit_number: 'Invalid-Plot',
    area_value: 200,
  },
})
assert.equal(mismatchRes.status, 400)
assert.match(mismatchRes.error, /does not match project category/)
console.log('✓ Test 6: Category mismatch between unit and single-category project rejected')

// 7. Duplicate unit number in same project rejected (409)
const duplicateRes = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-apt',
    category: 'apartments',
    unit_number: 'A-101', // already created in Test 1
    area_value: 1500,
  },
})
assert.equal(duplicateRes.status, 409)
assert.match(duplicateRes.error, /already exists in this project/)
console.log('✓ Test 7: Duplicate unit number in project rejected with HTTP 409')

// 8. Cross-Project Hierarchy Reference Rejected
const crossProjNodeRes = handleCreateInventory({
  callerProfileId: 'prof-mgr',
  body: {
    project_id: 'proj-apt',
    category: 'apartments',
    hierarchy_node_id: 'node-ext', // in proj-ext
    unit_number: 'A-999',
    area_value: 1200,
  },
})
assert.equal(crossProjNodeRes.status, 400)
assert.match(crossProjNodeRes.error, /Hierarchy node does not belong to this project/)
console.log('✓ Test 8: Foreign hierarchy node reference strictly rejected')

// 9. Edit Inventory Item & Preserve Unmodified Fields
const aptUnit = resApt.data
const editRes = handleUpdateInventory({
  callerProfileId: 'prof-mgr',
  inventoryId: aptUnit.id,
  body: {
    base_rate: 7000,
    total_price: 12950000,
    internal_notes: 'Updated price after customer inquiry',
  },
})
assert.equal(editRes.status, 200)
assert.equal(editRes.data.base_rate, 7000)
assert.equal(editRes.data.total_price, 12950000)
assert.equal(editRes.data.unit_number, 'A-101', 'Unit number should be preserved')
assert.equal(editRes.data.area_value, 1850, 'Area value should be preserved')
assert.equal(editRes.data.status, 'available', 'Status must remain untouched by general edit')
console.log('✓ Test 9: Edited inventory item successfully updated pricing & notes while preserving unmodified fields')

// 10. Role-based permissions: Readonly member blocked from create and edit (403)
const roCreateRes = handleCreateInventory({
  callerProfileId: 'prof-ro',
  body: {
    project_id: 'proj-apt',
    category: 'apartments',
    unit_number: 'RO-1',
    area_value: 1000,
  },
})
assert.equal(roCreateRes.status, 403)

const roEditRes = handleUpdateInventory({
  callerProfileId: 'prof-ro',
  inventoryId: aptUnit.id,
  body: { base_rate: 9999 },
})
assert.equal(roEditRes.status, 403)
console.log('✓ Test 10: Readonly member strictly blocked from creating and updating inventory (403)')

console.log('All Stage 3C Category-Aware Inventory Management tests passed successfully!')
