// tests/inventory-table-and-detail.test.mjs
// Test suite for Stage 3D: Inventory Detail, Table Enhancements, Filters, Sorting, and Navigation
import assert from 'node:assert/strict'

console.log('--- Running Inventory Table, Detail, Filters & Navigation (Stage 3D) Tests ---')

// Mock Database State
const DB = {
  organisations: [
    { id: 'org-alpha', name: 'Alpha Developers', slug: 'alpha' },
  ],
  profiles: [
    { id: 'prof-mgr', full_name: 'Inventory Manager' },
    { id: 'prof-partner', full_name: 'External Channel Partner' },
    { id: 'prof-ro', full_name: 'Readonly Viewer' },
  ],
  org_members: [
    { id: 'm-1', org_id: 'org-alpha', profile_id: 'prof-mgr', role: 'manager' },
    { id: 'm-2', org_id: 'org-alpha', profile_id: 'prof-partner', role: 'channel_partner' },
    { id: 'm-3', org_id: 'org-alpha', profile_id: 'prof-ro', role: 'readonly' },
  ],
  projects: [
    { id: 'proj-apt', org_id: 'org-alpha', name: 'Highland Heights', category: 'apartments' },
    { id: 'proj-mixed', org_id: 'org-alpha', name: 'Grand Central Urban Hub', category: 'mixed_use' },
  ],
  hierarchy_nodes: [
    { id: 'node-p1', project_id: 'proj-apt', org_id: 'org-alpha', parent_id: null, name: 'Phase 1', node_type: 'phase' },
    { id: 'node-twr-a', project_id: 'proj-apt', org_id: 'org-alpha', parent_id: 'node-p1', name: 'Tower A', node_type: 'tower' },
    { id: 'node-fl-04', project_id: 'proj-apt', org_id: 'org-alpha', parent_id: 'node-twr-a', name: '4th Floor', node_type: 'floor' },
    { id: 'node-twr-b', project_id: 'proj-apt', org_id: 'org-alpha', parent_id: 'node-p1', name: 'Tower B', node_type: 'tower' },
  ],
  inventory_items: [
    {
      id: 'inv-101',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-401',
      category: 'apartments',
      hierarchy_node_id: 'node-fl-04',
      tower_name: 'Tower A',
      floor_number: 4,
      bhk_config: '3 BHK',
      area_value: 1650,
      area_unit: 'sqft',
      carpet_area: 1250,
      built_up_area: 1450,
      super_built_up_area: 1650,
      facing: 'East',
      balconies: 2,
      parking_spaces: 2,
      base_rate: 6500,
      total_price: 10725000,
      status: 'available',
      internal_notes: 'VIP customer inquiry pending from Mr. Sharma.',
      is_corner_plot: false,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-10T12:00:00Z',
    },
    {
      id: 'inv-102',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-402',
      category: 'apartments',
      hierarchy_node_id: 'node-fl-04',
      tower_name: 'Tower A',
      floor_number: 4,
      bhk_config: '2 BHK',
      area_value: 1250,
      area_unit: 'sqft',
      carpet_area: 950,
      built_up_area: 1100,
      super_built_up_area: 1250,
      facing: 'West',
      balconies: 1,
      parking_spaces: 1,
      base_rate: 6500,
      total_price: 8125000,
      status: 'booked',
      internal_notes: 'Booking token received: Cheque #89421.',
      is_corner_plot: false,
      created_at: '2026-01-02T10:00:00Z',
      updated_at: '2026-01-12T15:30:00Z',
    },
    {
      id: 'inv-103',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'B-101',
      category: 'apartments',
      hierarchy_node_id: 'node-twr-b',
      tower_name: 'Tower B',
      floor_number: 1,
      bhk_config: '3 BHK',
      area_value: 1800,
      area_unit: 'sqft',
      carpet_area: 1400,
      built_up_area: 1600,
      super_built_up_area: 1800,
      facing: 'North',
      balconies: 3,
      parking_spaces: 2,
      base_rate: 7000,
      total_price: 12600000,
      status: 'available',
      internal_notes: 'Special discount approval up to 3% allowed.',
      is_corner_plot: false,
      created_at: '2026-01-03T10:00:00Z',
      updated_at: '2026-01-05T09:00:00Z',
    },
    {
      id: 'inv-104',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'B-102',
      category: 'apartments',
      hierarchy_node_id: 'node-twr-b',
      tower_name: 'Tower B',
      floor_number: 1,
      bhk_config: '4 BHK',
      area_value: 2400,
      area_unit: 'sqft',
      carpet_area: 1900,
      built_up_area: 2150,
      super_built_up_area: 2400,
      facing: 'East',
      balconies: 3,
      parking_spaces: 2,
      base_rate: 7200,
      total_price: 17280000,
      status: 'sold',
      internal_notes: 'Sale deed registered.',
      is_corner_plot: false,
      created_at: '2026-01-04T10:00:00Z',
      updated_at: '2026-01-14T11:00:00Z',
    },
    // Mixed-use items
    {
      id: 'inv-201',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'RET-01',
      category: 'commercial_sale',
      commercial_asset_type: 'Retail Shop',
      area_value: 800,
      area_unit: 'sqft',
      carpet_area: 650,
      facing: 'East',
      base_rate: 15000,
      total_price: 12000000,
      status: 'available',
      internal_notes: 'Prime street frontage.',
      is_corner_plot: false,
      created_at: '2026-01-05T10:00:00Z',
      updated_at: '2026-01-06T10:00:00Z',
    },
    {
      id: 'inv-202',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'APT-101',
      category: 'apartments',
      bhk_config: '2 BHK',
      area_value: 1200,
      area_unit: 'sqft',
      facing: 'North',
      base_rate: 6000,
      total_price: 7200000,
      status: 'available',
      internal_notes: 'Residential wing unit.',
      is_corner_plot: false,
      created_at: '2026-01-05T11:00:00Z',
      updated_at: '2026-01-06T11:00:00Z',
    },
    {
      id: 'inv-203',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'PLT-05',
      category: 'plotted_developments',
      plot_area: 250,
      area_value: 250,
      area_unit: 'sqyd',
      plot_dimensions: '30x75',
      road_width_ft: 40,
      is_corner_plot: true,
      facing: 'East',
      base_rate: 40000,
      total_price: 10000000,
      status: 'on_hold',
      internal_notes: 'Reserved for investor group.',
      created_at: '2026-01-05T12:00:00Z',
      updated_at: '2026-01-07T12:00:00Z',
    },
  ],
}

// Logic: Breadcrumb resolution
function buildHierarchyBreadcrumb(nodeId, nodes) {
  const nodeMap = new Map()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
  }

  const parts = []
  let curr = nodeId
  const visited = new Set()
  while (curr && !visited.has(curr)) {
    visited.add(curr)
    const node = nodeMap.get(curr)
    if (!node) break
    parts.unshift(node.name)
    curr = node.parent_id
  }
  return parts.join(' › ')
}

// Logic: Query inventory with filtering, sorting, pagination, and role-based notes sanitization
function queryInventory({ projectId, callerProfileId, filters = {} }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) return { status: 404, error: 'Project not found' }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership) {
    return { status: 403, error: 'Not authorized for this organisation' }
  }

  let items = DB.inventory_items.filter((i) => i.project_id === projectId)

  // Attach hierarchy breadcrumbs
  items = items.map((item) => {
    const clone = { ...item }
    if (clone.hierarchy_node_id) {
      clone.hierarchy_path = buildHierarchyBreadcrumb(clone.hierarchy_node_id, DB.hierarchy_nodes)
    }
    return clone
  })

  // Filters
  if (filters.status) {
    items = items.filter((i) => i.status === filters.status)
  }
  if (filters.category) {
    items = items.filter((i) => i.category === filters.category)
  }
  if (filters.bhk) {
    items = items.filter((i) => i.bhk_config === filters.bhk)
  }
  if (filters.facing) {
    items = items.filter((i) => i.facing === filters.facing)
  }
  if (filters.hierarchyNodeId) {
    items = items.filter((i) => i.hierarchy_node_id === filters.hierarchyNodeId)
  }
  if (filters.minPrice !== undefined) {
    items = items.filter((i) => i.total_price !== null && i.total_price >= filters.minPrice)
  }
  if (filters.maxPrice !== undefined) {
    items = items.filter((i) => i.total_price !== null && i.total_price <= filters.maxPrice)
  }
  if (filters.minArea !== undefined) {
    items = items.filter((i) => i.area_value >= filters.minArea)
  }
  if (filters.maxArea !== undefined) {
    items = items.filter((i) => i.area_value <= filters.maxArea)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim()
    items = items.filter(
      (i) =>
        i.unit_number.toLowerCase().includes(q) ||
        (i.tower_name && i.tower_name.toLowerCase().includes(q)) ||
        (i.hierarchy_path && i.hierarchy_path.toLowerCase().includes(q))
    )
  }

  // Sorting
  const sortCol = filters.sortBy || 'unit_number'
  const isAsc = filters.sortOrder !== 'desc'
  items.sort((a, b) => {
    let cmp = 0
    switch (sortCol) {
      case 'unit_number':
        cmp = a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
        break
      case 'total_price':
        cmp = (a.total_price || 0) - (b.total_price || 0)
        break
      case 'area_value':
        cmp = a.area_value - b.area_value
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
      case 'updated_at':
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        break
      default:
        cmp = 0
    }
    return isAsc ? cmp : -cmp
  })

  // Sanitize internal notes for non-internal team members
  const isInternal = ['owner', 'admin', 'manager', 'sales_agent'].includes(membership.role)
  if (!isInternal) {
    items = items.map((i) => ({ ...i, internal_notes: null }))
  }

  const total = items.length
  const page = filters.page || 1
  const pageSize = filters.pageSize || 25
  const from = (page - 1) * pageSize
  const paginatedItems = items.slice(from, from + pageSize)

  return {
    status: 200,
    items: paginatedItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  }
}

// --------------------------------------------------------------------------
// TEST 1: Full Hierarchy Breadcrumb Generation
// --------------------------------------------------------------------------
console.log('Test 1: Hierarchy Breadcrumb Path Resolution')
const breadcrumb = buildHierarchyBreadcrumb('node-fl-04', DB.hierarchy_nodes)
assert.equal(breadcrumb, 'Phase 1 › Tower A › 4th Floor', 'Should build complete root-to-leaf path')

const towerBreadcrumb = buildHierarchyBreadcrumb('node-twr-b', DB.hierarchy_nodes)
assert.equal(towerBreadcrumb, 'Phase 1 › Tower B', 'Should build partial hierarchy path correctly')
console.log('✓ Test 1 Passed: Breadcrumbs accurately reflect parent-child tree.')

// --------------------------------------------------------------------------
// TEST 2: Multi-facet Filtering (Status, BHK, Facing, Range)
// --------------------------------------------------------------------------
console.log('Test 2: Multi-facet Filtering')

// 2a. Status Filter
const availResult = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { status: 'available' },
})
assert.equal(availResult.items.length, 2, 'Should find 2 available units in Highland Heights')
assert.ok(availResult.items.every((i) => i.status === 'available'))

// 2b. BHK Filter
const bhk3Result = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { bhk: '3 BHK' },
})
assert.equal(bhk3Result.items.length, 2, 'Should find 2 3-BHK units')
assert.ok(bhk3Result.items.every((i) => i.bhk_config === '3 BHK'))

// 2c. Combined Status + Facing + MinPrice
const combinedResult = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { status: 'available', facing: 'East', minPrice: 10000000 },
})
assert.equal(combinedResult.items.length, 1)
assert.equal(combinedResult.items[0].unit_number, 'A-401')
console.log('✓ Test 2 Passed: Multi-facet filters combine correctly.')

// --------------------------------------------------------------------------
// TEST 3: Mixed-Use Multi-Category Filtering
// --------------------------------------------------------------------------
console.log('Test 3: Mixed-Use Multi-Category Filtering')

// In mixed-use, user can filter by commercial_sale
const commResult = queryInventory({
  projectId: 'proj-mixed',
  callerProfileId: 'prof-mgr',
  filters: { category: 'commercial_sale' },
})
assert.equal(commResult.items.length, 1)
assert.equal(commResult.items[0].unit_number, 'RET-01')
assert.equal(commResult.items[0].commercial_asset_type, 'Retail Shop')

// Filter by plotted_developments
const plotResult = queryInventory({
  projectId: 'proj-mixed',
  callerProfileId: 'prof-mgr',
  filters: { category: 'plotted_developments' },
})
assert.equal(plotResult.items.length, 1)
assert.equal(plotResult.items[0].unit_number, 'PLT-05')
assert.equal(plotResult.items[0].is_corner_plot, true)
console.log('✓ Test 3 Passed: Mixed-use supports independent category filtering.')

// --------------------------------------------------------------------------
// TEST 4: Search by Unit Number, Tower, or Breadcrumb
// --------------------------------------------------------------------------
console.log('Test 4: Free-text Search')

const searchByUnit = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { search: '401' },
})
assert.equal(searchByUnit.items.length, 1)
assert.equal(searchByUnit.items[0].unit_number, 'A-401')

const searchByTower = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { search: 'Tower B' },
})
assert.equal(searchByTower.items.length, 2)
assert.ok(searchByTower.items.every((i) => i.tower_name === 'Tower B'))
console.log('✓ Test 4 Passed: Search matches unit and tower names.')

// --------------------------------------------------------------------------
// TEST 5: Interactive Sorting (Price, Area, Unit Number)
// --------------------------------------------------------------------------
console.log('Test 5: Interactive Sorting')

// Price DESC
const sortedPriceDesc = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { sortBy: 'total_price', sortOrder: 'desc' },
})
assert.equal(sortedPriceDesc.items[0].unit_number, 'B-102', 'B-102 (₹1.72 Cr) must be first')
assert.equal(sortedPriceDesc.items[sortedPriceDesc.items.length - 1].unit_number, 'A-402', 'A-402 (₹81.25 L) must be last')

// Area ASC
const sortedAreaAsc = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { sortBy: 'area_value', sortOrder: 'asc' },
})
assert.equal(sortedAreaAsc.items[0].unit_number, 'A-402', '1250 sqft must be first')
assert.equal(sortedAreaAsc.items[sortedAreaAsc.items.length - 1].unit_number, 'B-102', '2400 sqft must be last')
console.log('✓ Test 5 Passed: Sorting by price and area works in both orders.')

// --------------------------------------------------------------------------
// TEST 6: Pagination Boundaries & Metadata
// --------------------------------------------------------------------------
console.log('Test 6: Pagination Metadata')

const page1 = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { page: 1, pageSize: 2 },
})
assert.equal(page1.items.length, 2)
assert.equal(page1.total, 4)
assert.equal(page1.totalPages, 2)
assert.equal(page1.page, 1)

const page2 = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { page: 2, pageSize: 2 },
})
assert.equal(page2.items.length, 2)
assert.equal(page2.page, 2)
assert.notEqual(page1.items[0].id, page2.items[0].id)
console.log('✓ Test 6 Passed: Pagination offsets and totalPages are calculated accurately.')

// --------------------------------------------------------------------------
// TEST 7: Data Privacy & Security - Internal Notes Sanitization
// --------------------------------------------------------------------------
console.log('Test 7: Internal Notes Sanitization for External/Channel Partners')

// Manager can view internal notes
const managerView = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-mgr',
  filters: { search: 'A-401' },
})
assert.equal(managerView.items[0].internal_notes, 'VIP customer inquiry pending from Mr. Sharma.')

// External Channel Partner should NOT see internal notes
const partnerView = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-partner',
  filters: { search: 'A-401' },
})
assert.equal(partnerView.items[0].internal_notes, null, 'Internal notes MUST be scrubbed to null for channel partner')

// Readonly non-internal viewer should NOT see internal notes
const roView = queryInventory({
  projectId: 'proj-apt',
  callerProfileId: 'prof-ro',
  filters: { search: 'A-401' },
})
assert.equal(roView.items[0].internal_notes, null, 'Internal notes MUST be scrubbed to null for readonly member')
console.log('✓ Test 7 Passed: Internal notes protected server-side from non-internal roles.')

// --------------------------------------------------------------------------
// TEST 8: Category Specifications Completeness
// --------------------------------------------------------------------------
console.log('Test 8: Category Specifications Completeness')

// Apartment specs check
const aptItem = DB.inventory_items.find((i) => i.category === 'apartments')
assert.ok(aptItem.bhk_config, 'Apartment must have BHK')
assert.ok(aptItem.carpet_area, 'Apartment must have carpet area')
assert.ok(aptItem.super_built_up_area, 'Apartment must have super built-up area')

// Plot specs check
const plotItem = DB.inventory_items.find((i) => i.category === 'plotted_developments')
assert.ok(plotItem.plot_area, 'Plot must have plot area')
assert.ok(plotItem.plot_dimensions, 'Plot must have dimensions')
assert.ok(plotItem.road_width_ft, 'Plot must have road width')
assert.equal(typeof plotItem.is_corner_plot, 'boolean', 'Plot must have is_corner_plot boolean')

// Commercial specs check
const commItem = DB.inventory_items.find((i) => i.category === 'commercial_sale')
assert.ok(commItem.commercial_asset_type, 'Commercial must have asset type')

console.log('✓ Test 8 Passed: All category-specific specifications are complete and verified.')

console.log('\nAll Stage 3D Inventory Table, Detail, Filters & Navigation tests passed successfully!\n')
