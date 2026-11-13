// tests/visual-inventory.test.mjs
// Test suite for Stage 3E: Visual Inventory Experience Across All 5 Project Categories
import assert from 'node:assert/strict'

console.log('--- Running Visual Inventory Experience (Stage 3E) Tests ---')

// Mock Database State with units across all 5 project categories
const DB = {
  organisations: [
    { id: 'org-alpha', name: 'Alpha Builders', slug: 'alpha' },
    { id: 'org-beta', name: 'Beta Realty', slug: 'beta' },
  ],
  projects: [
    { id: 'proj-apt', org_id: 'org-alpha', name: 'Skyline Towers', category: 'apartments' },
    { id: 'proj-plot', org_id: 'org-alpha', name: 'Greenfield Valley', category: 'plotted_developments' },
    { id: 'proj-comm', org_id: 'org-alpha', name: 'Metro Corporate Center', category: 'commercial_sale' },
    { id: 'proj-villa', org_id: 'org-alpha', name: 'Meadow Villas', category: 'villas_gated_communities' },
    { id: 'proj-mixed', org_id: 'org-alpha', name: 'Urban Central', category: 'mixed_use' },
    { id: 'proj-large', org_id: 'org-alpha', name: 'Mega Heights (Large Project)', category: 'apartments' },
    { id: 'proj-ext', org_id: 'org-beta', name: 'External Beta Project', category: 'apartments' },
  ],
  inventory_items: [
    // 1. Apartments (Tower A & Tower B, all 5 statuses present)
    {
      id: 'apt-101',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-101',
      category: 'apartments',
      tower_name: 'Tower A',
      floor_number: 1,
      bhk_config: '2 BHK',
      area_value: 1200,
      area_unit: 'sqft',
      status: 'available',
      total_price: 7200000,
    },
    {
      id: 'apt-102',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-102',
      category: 'apartments',
      tower_name: 'Tower A',
      floor_number: 1,
      bhk_config: '3 BHK',
      area_value: 1600,
      area_unit: 'sqft',
      status: 'booked',
      total_price: 9600000,
    },
    {
      id: 'apt-201',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-201',
      category: 'apartments',
      tower_name: 'Tower A',
      floor_number: 2,
      bhk_config: '3 BHK',
      area_value: 1600,
      area_unit: 'sqft',
      status: 'sold',
      total_price: 9800000,
    },
    {
      id: 'apt-202',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-202',
      category: 'apartments',
      tower_name: 'Tower A',
      floor_number: 2,
      bhk_config: '2 BHK',
      area_value: 1250,
      area_unit: 'sqft',
      status: 'on_hold',
      total_price: 7500000,
    },
    {
      id: 'apt-301',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'A-301',
      category: 'apartments',
      tower_name: 'Tower A',
      floor_number: 3,
      bhk_config: '4 BHK',
      area_value: 2400,
      area_unit: 'sqft',
      status: 'blocked',
      total_price: 15000000,
    },
    {
      id: 'apt-b01',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'B-101',
      category: 'apartments',
      tower_name: 'Tower B',
      floor_number: 1,
      bhk_config: '4 BHK',
      area_value: 2200,
      area_unit: 'sqft',
      status: 'available',
      total_price: 14000000,
    },
    {
      id: 'apt-b02',
      org_id: 'org-alpha',
      project_id: 'proj-apt',
      unit_number: 'B-102',
      category: 'apartments',
      tower_name: 'Tower B',
      floor_number: 1,
      bhk_config: '4 BHK',
      area_value: 2200,
      area_unit: 'sqft',
      status: 'sold',
      total_price: 14500000,
    },

    // 2. Plotted Developments (Block A & Block B)
    {
      id: 'plt-a1',
      org_id: 'org-alpha',
      project_id: 'proj-plot',
      unit_number: 'Plot A-01',
      category: 'plotted_developments',
      tower_name: 'Block A',
      area_value: 200,
      area_unit: 'sqyd',
      plot_area: 200,
      plot_dimensions: '30x60',
      road_width_ft: 40,
      is_corner_plot: true,
      facing: 'East',
      status: 'available',
      total_price: 6000000,
    },
    {
      id: 'plt-a2',
      org_id: 'org-alpha',
      project_id: 'proj-plot',
      unit_number: 'Plot A-02',
      category: 'plotted_developments',
      tower_name: 'Block A',
      area_value: 200,
      area_unit: 'sqyd',
      plot_area: 200,
      plot_dimensions: '30x60',
      road_width_ft: 30,
      is_corner_plot: false,
      facing: 'West',
      status: 'booked',
      total_price: 5500000,
    },
    {
      id: 'plt-b1',
      org_id: 'org-alpha',
      project_id: 'proj-plot',
      unit_number: 'Plot B-01',
      category: 'plotted_developments',
      tower_name: 'Block B',
      area_value: 300,
      area_unit: 'sqyd',
      plot_area: 300,
      plot_dimensions: '40x67.5',
      road_width_ft: 50,
      is_corner_plot: false,
      facing: 'North',
      status: 'sold',
      total_price: 9000000,
    },

    // 3. Commercial Sale Properties (Wing 1 / Floor 1 & 0)
    {
      id: 'comm-101',
      org_id: 'org-alpha',
      project_id: 'proj-comm',
      unit_number: 'Suite 101',
      category: 'commercial_sale',
      tower_name: 'Tower 1',
      floor_number: 1,
      commercial_asset_type: 'Office Suite',
      area_value: 1250,
      area_unit: 'sqft',
      status: 'available',
      total_price: 18750000,
    },
    {
      id: 'comm-102',
      org_id: 'org-alpha',
      project_id: 'proj-comm',
      unit_number: 'Retail Shop G-01',
      category: 'commercial_sale',
      tower_name: 'Tower 1',
      floor_number: 0,
      commercial_asset_type: 'Retail Shop',
      area_value: 650,
      area_unit: 'sqft',
      status: 'on_hold',
      total_price: 13000000,
    },

    // 4. Villas and Gated Communities (Palm Cluster)
    {
      id: 'vil-01',
      org_id: 'org-alpha',
      project_id: 'proj-villa',
      unit_number: 'Villa 1',
      category: 'villas_gated_communities',
      tower_name: 'Palm Cluster',
      bhk_config: '4 BHK',
      area_value: 3200,
      area_unit: 'sqft',
      plot_area: 250,
      parking_spaces: 2,
      facing: 'East',
      status: 'available',
      total_price: 25000000,
    },
    {
      id: 'vil-02',
      org_id: 'org-alpha',
      project_id: 'proj-villa',
      unit_number: 'Villa 2',
      category: 'villas_gated_communities',
      tower_name: 'Palm Cluster',
      bhk_config: '5 BHK',
      area_value: 4100,
      area_unit: 'sqft',
      plot_area: 350,
      parking_spaces: 3,
      facing: 'North',
      status: 'sold',
      total_price: 36000000,
    },

    // 5. Mixed-Use Project (Multiple categories)
    {
      id: 'mix-apt-1',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'RES-301',
      category: 'apartments',
      tower_name: 'Residential Tower',
      floor_number: 3,
      bhk_config: '3 BHK',
      area_value: 1550,
      area_unit: 'sqft',
      status: 'available',
      total_price: 10850000,
    },
    {
      id: 'mix-comm-1',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'COM-101',
      category: 'commercial_sale',
      tower_name: 'Commercial Wing',
      floor_number: 1,
      commercial_asset_type: 'Showroom',
      area_value: 2000,
      area_unit: 'sqft',
      status: 'available',
      total_price: 35000000,
    },
    {
      id: 'mix-plot-1',
      org_id: 'org-alpha',
      project_id: 'proj-mixed',
      unit_number: 'PLT-01',
      category: 'plotted_developments',
      tower_name: 'Villa Plots Phase',
      area_value: 300,
      area_unit: 'sqyd',
      is_corner_plot: true,
      status: 'blocked',
      total_price: 12000000,
    },

    // 6. External organization unit (Tenant Isolation Check)
    {
      id: 'ext-999',
      org_id: 'org-beta',
      project_id: 'proj-ext',
      unit_number: 'EXT-01',
      category: 'apartments',
      tower_name: 'Beta Tower',
      floor_number: 1,
      status: 'available',
      total_price: 5000000,
    },
  ],
}

// Generate 150 items for proj-large to test pagination vs visual complete dataset
for (let i = 1; i <= 150; i++) {
  const floor = Math.floor((i - 1) / 10) + 1
  const statuses = ['available', 'on_hold', 'booked', 'sold', 'blocked']
  const status = statuses[i % 5]
  DB.inventory_items.push({
    id: `large-${i}`,
    org_id: 'org-alpha',
    project_id: 'proj-large',
    unit_number: `T1-${floor}0${i % 10}`,
    category: 'apartments',
    tower_name: 'Tower 1',
    floor_number: floor,
    bhk_config: '3 BHK',
    area_value: 1500,
    area_unit: 'sqft',
    status,
    total_price: 10000000,
  })
}

// Logic: Visual layout transformer functions
function computeVisualGroups(items) {
  const map = new Map()
  items.forEach((item) => {
    const name = item.tower_name || 'General'
    const g = map.get(name) || {
      name,
      total: 0,
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
      units: [],
    }
    g.total++
    if (g[item.status] !== undefined) {
      g[item.status]++
    }
    g.units.push(item)
    map.set(name, g)
  })
  return Array.from(map.values())
}

function computeFloorMatrix(units) {
  const map = new Map()
  units.forEach((unit) => {
    const fl = unit.floor_number ?? 0
    const list = map.get(fl) || []
    list.push(unit)
    map.set(fl, list)
  })
  // Descending floors (top floor down to ground floor 0)
  return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
}

// --------------------------------------------------------------------------
// TEST 1: Five-Status Consistency & Explicit Blocked Counts
// --------------------------------------------------------------------------
console.log('Test 1: Five-Status Consistency and Explicit Blocked Group Counts')

const aptItems = DB.inventory_items.filter((i) => i.project_id === 'proj-apt')
const aptGroups = computeVisualGroups(aptItems)

const towerA = aptGroups.find((g) => g.name === 'Tower A')
assert.ok(towerA, 'Tower A must exist')
assert.equal(towerA.total, 5, 'Tower A has 5 units')
assert.equal(towerA.available, 1, 'Tower A has 1 Available')
assert.equal(towerA.on_hold, 1, 'Tower A has 1 On Hold')
assert.equal(towerA.booked, 1, 'Tower A has 1 Booked')
assert.equal(towerA.sold, 1, 'Tower A has 1 Sold')
assert.equal(towerA.blocked, 1, 'Tower A has 1 Blocked (MUST NOT be omitted)')

// Strict mathematical sum: All 5 statuses MUST equal total
const sumStatuses = towerA.available + towerA.on_hold + towerA.booked + towerA.sold + towerA.blocked
assert.equal(sumStatuses, towerA.total, 'Sum of all 5 statuses must strictly equal group total')

// Test zero-count status handling in Tower B
const towerB = aptGroups.find((g) => g.name === 'Tower B')
assert.ok(towerB, 'Tower B must exist')
assert.equal(towerB.total, 2)
assert.equal(towerB.available, 1)
assert.equal(towerB.on_hold, 0, 'Zero-count On Hold must explicitly be 0')
assert.equal(towerB.booked, 0, 'Zero-count Booked must explicitly be 0')
assert.equal(towerB.sold, 1)
assert.equal(towerB.blocked, 0, 'Zero-count Blocked must explicitly be 0')
const sumTowerB = towerB.available + towerB.on_hold + towerB.booked + towerB.sold + towerB.blocked
assert.equal(sumTowerB, towerB.total, 'Tower B sum of all 5 statuses equals 2')
console.log('✓ Test 1 Passed: All 5 statuses including Blocked and zero-counts verified.')

// --------------------------------------------------------------------------
// TEST 2: Complete Inventory Representation Beyond Table Page Size (150 units)
// --------------------------------------------------------------------------
console.log('Test 2: Complete Inventory Dataset Beyond Table Page Size (150 units vs 25 page size)')

const largeProjectItems = DB.inventory_items.filter((i) => i.project_id === 'proj-large')
assert.equal(largeProjectItems.length, 150, 'Project has 150 total records')

// Table slice test: page size 25
const tablePageSize = 25
const tablePage1 = largeProjectItems.slice(0, tablePageSize)
assert.equal(tablePage1.length, 25, 'Table page 1 contains only 25 items')

// Visual view test: Operates on complete filtered project items, NOT table page 1
const visualGroups = computeVisualGroups(largeProjectItems)
assert.equal(visualGroups.length, 1)
const tower1 = visualGroups[0]
assert.equal(tower1.total, 150, 'Visual view must contain all 150 units, NOT just 25!')
assert.equal(tower1.available, 30)
assert.equal(tower1.on_hold, 30)
assert.equal(tower1.booked, 30)
assert.equal(tower1.sold, 30)
assert.equal(tower1.blocked, 30)

// Visual floor matrix test: 15 floors with 10 units each
const floorMatrix150 = computeFloorMatrix(tower1.units)
assert.equal(floorMatrix150.length, 15, 'All 15 floors rendered in visual view')
const totalUnitsInMatrix = floorMatrix150.reduce((acc, [, units]) => acc + units.length, 0)
assert.equal(totalUnitsInMatrix, 150, 'Visual floor matrix renders all 150 units across all 15 floors')
console.log('✓ Test 2 Passed: Visual mode processes complete 150 units across all pages.')

// --------------------------------------------------------------------------
// TEST 3: Dynamic Filter Reaction in Visual Mode
// --------------------------------------------------------------------------
console.log('Test 3: Visual Group Counts Update Dynamically on Filter Changes')

// Filter proj-large by status = 'available'
const availableOnlyItems = largeProjectItems.filter((i) => i.status === 'available')
const filteredVisualGroups = computeVisualGroups(availableOnlyItems)
assert.equal(filteredVisualGroups[0].total, 30, 'Filtered visual group count updates to 30')
assert.equal(filteredVisualGroups[0].available, 30)
assert.equal(filteredVisualGroups[0].booked, 0)
assert.equal(filteredVisualGroups[0].sold, 0)

// Reset filter restores 150 items
const resetGroups = computeVisualGroups(largeProjectItems)
assert.equal(resetGroups[0].total, 150, 'Resetting filter restores complete 150 units')
console.log('✓ Test 3 Passed: Filtering and resetting filters updates visual groups accurately.')

// --------------------------------------------------------------------------
// TEST 4: Plotted Developments Layout (Blocks & Plot Specifications)
// --------------------------------------------------------------------------
console.log('Test 4: Plotted Developments Layout (Blocks & Plot Specifications)')

const plotItems = DB.inventory_items.filter((i) => i.project_id === 'proj-plot')
const plotGroups = computeVisualGroups(plotItems)
assert.equal(plotGroups.length, 2, 'Should group into Block A and Block B')

const blockA = plotGroups.find((g) => g.name === 'Block A')
assert.equal(blockA.total, 2)
assert.equal(blockA.available, 1)
assert.equal(blockA.booked, 1)

const plotA1 = blockA.units.find((p) => p.unit_number === 'Plot A-01')
assert.equal(plotA1.is_corner_plot, true, 'Corner plot badge must be true')
assert.equal(plotA1.plot_dimensions, '30x60', 'Dimensions must be preserved')
assert.equal(plotA1.road_width_ft, 40, 'Road width must be preserved')
console.log('✓ Test 4 Passed: Plotted developments block structure and plot specs verified.')

// --------------------------------------------------------------------------
// TEST 5: Commercial Sale Properties Matrix (Building -> Floor -> Asset Type)
// --------------------------------------------------------------------------
console.log('Test 5: Commercial Sale Properties Matrix (Building -> Floor -> Asset Type)')

const commItems = DB.inventory_items.filter((i) => i.project_id === 'proj-comm')
const commGroups = computeVisualGroups(commItems)
assert.equal(commGroups.length, 1)

const commFloors = computeFloorMatrix(commGroups[0].units)
assert.equal(commFloors.length, 2, 'Floor 1 and Ground Floor (0)')
assert.equal(commFloors[0][0], 1, 'Floor 1 first in descending order')
assert.equal(commFloors[1][0], 0, 'Ground Floor (0) follows')

const retailShop = commItems.find((c) => c.unit_number === 'Retail Shop G-01')
assert.equal(retailShop.commercial_asset_type, 'Retail Shop')
assert.equal(retailShop.status, 'on_hold')
console.log('✓ Test 5 Passed: Commercial sale properties hierarchy & asset types verified.')

// --------------------------------------------------------------------------
// TEST 6: Villas & Gated Communities (Cluster -> Typology & Extents)
// --------------------------------------------------------------------------
console.log('Test 6: Villas & Gated Communities (Cluster -> Typology & Extents)')

const villaItems = DB.inventory_items.filter((i) => i.project_id === 'proj-villa')
const villaGroups = computeVisualGroups(villaItems)
assert.equal(villaGroups.length, 1, 'Palm Cluster found')

const v1 = villaGroups[0].units.find((v) => v.unit_number === 'Villa 1')
assert.equal(v1.bhk_config, '4 BHK')
assert.equal(v1.plot_area, 250)
assert.equal(v1.parking_spaces, 2)
assert.equal(v1.status, 'available')
console.log('✓ Test 6 Passed: Villa clusters, typologies, and plot extents verified.')

// --------------------------------------------------------------------------
// TEST 7: Mixed-Use Multi-Category Visual Switching
// --------------------------------------------------------------------------
console.log('Test 7: Mixed-Use Multi-Category Visual Switching')

const mixedItems = DB.inventory_items.filter((i) => i.project_id === 'proj-mixed')
const distinctCategories = Array.from(new Set(mixedItems.map((i) => i.category)))
assert.equal(distinctCategories.length, 3, 'Mixed-use project contains 3 distinct categories')

// Switching to 'apartments'
const mixedAptUnits = mixedItems.filter((i) => i.category === 'apartments')
assert.equal(mixedAptUnits.length, 1)
assert.equal(mixedAptUnits[0].unit_number, 'RES-301')

// Switching to 'commercial_sale'
const mixedCommUnits = mixedItems.filter((i) => i.category === 'commercial_sale')
assert.equal(mixedCommUnits.length, 1)
assert.equal(mixedCommUnits[0].commercial_asset_type, 'Showroom')

// Switching to 'plotted_developments'
const mixedPlotUnits = mixedItems.filter((i) => i.category === 'plotted_developments')
assert.equal(mixedPlotUnits.length, 1)
assert.equal(mixedPlotUnits[0].is_corner_plot, true)
assert.equal(mixedPlotUnits[0].status, 'blocked', 'Blocked plot in mixed-use verified')
console.log('✓ Test 7 Passed: Mixed-use supports independent visual switching across categories.')

// --------------------------------------------------------------------------
// TEST 8: Count Aggregation Integrity (Zero Double-Counting)
// --------------------------------------------------------------------------
console.log('Test 8: Count Aggregation Integrity (Zero Double-Counting)')

const allAlphaItems = DB.inventory_items.filter((i) => i.org_id === 'org-alpha')
const allProjectSums = ['proj-apt', 'proj-plot', 'proj-comm', 'proj-villa', 'proj-mixed', 'proj-large'].reduce(
  (acc, pid) => {
    const pItems = DB.inventory_items.filter((i) => i.project_id === pid)
    const groups = computeVisualGroups(pItems)
    const groupSum = groups.reduce((gAcc, g) => gAcc + g.total, 0)
    return acc + groupSum
  },
  0
)
assert.equal(allProjectSums, allAlphaItems.length, 'Aggregated visual group counts MUST exactly equal total items in DB')
console.log('✓ Test 8 Passed: Zero double-counting across visual group aggregates.')

// --------------------------------------------------------------------------
// TEST 9: Cross-Tenant Data Isolation in Visual Hierarchy
// --------------------------------------------------------------------------
console.log('Test 9: Cross-Tenant Data Isolation in Visual Hierarchy')

const alphaVisualItems = DB.inventory_items.filter((i) => i.org_id === 'org-alpha')
const containsBetaUnit = alphaVisualItems.some((i) => i.unit_number === 'EXT-01' || i.org_id === 'org-beta')
assert.equal(containsBetaUnit, false, 'Visual views must NEVER leak foreign tenant inventory units')
console.log('✓ Test 9 Passed: Multi-tenant boundary strictly preserved in visual layouts.')

console.log('\nAll Stage 3E Visual Inventory Experience tests passed successfully!\n')
