// tests/project-hierarchy.test.mjs
// Test suite for Stage 3B: Project Hierarchy Management
import assert from 'node:assert/strict'

console.log('--- Running Project Hierarchy Management (Stage 3B) Tests ---')

// Mock DB State
const DB = {
  organisations: [
    { id: 'org-omega', name: 'Omega Realty', slug: 'omega' },
    { id: 'org-external', name: 'External Developers', slug: 'external' },
  ],
  profiles: [
    { id: 'prof-mgr', full_name: 'Property Manager' },
    { id: 'prof-sales', full_name: 'Sales Executive (Read-Only on Hierarchy)' },
  ],
  org_members: [
    { id: 'mem-1', org_id: 'org-omega', profile_id: 'prof-mgr', role: 'manager' },
    { id: 'mem-2', org_id: 'org-omega', profile_id: 'prof-sales', role: 'sales_exec' },
    { id: 'mem-3', org_id: 'org-external', profile_id: 'prof-mgr', role: 'readonly' },
  ],
  projects: [
    { id: 'proj-apt', org_id: 'org-omega', name: 'Skyline Heights', category: 'apartments' },
    { id: 'proj-plot', org_id: 'org-omega', name: 'Greenfields Plots', category: 'plotted_developments' },
    { id: 'proj-comm', org_id: 'org-omega', name: 'Pinnacle Commercial', category: 'commercial_sale' },
    { id: 'proj-villa', org_id: 'org-omega', name: 'Whispering Woods Villas', category: 'villas_gated_communities' },
    { id: 'proj-mixed', org_id: 'org-omega', name: 'Nexus Urban Hub', category: 'mixed_use' },
    { id: 'proj-ext', org_id: 'org-external', name: 'External Project', category: 'apartments' },
  ],
  hierarchy_nodes: [],
  inventory_items: [],
}

// Logic: Check circular dependency
function isCircular(nodeId, newParentId) {
  if (nodeId === newParentId) return true
  let curr = newParentId
  const visited = new Set()
  while (curr) {
    if (curr === nodeId) return true
    if (visited.has(curr)) break
    visited.add(curr)
    const pNode = DB.hierarchy_nodes.find((n) => n.id === curr)
    curr = pNode ? pNode.parent_id : null
  }
  return false
}

// Simulated API logic for POST /api/projects/[projectId]/hierarchy
function handleCreateNode({ callerProfileId, projectId, body }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) return { status: 404, error: 'Project not found' }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions to manage project hierarchy' }
  }

  if (!body.name || !body.name.trim()) {
    return { status: 400, error: 'Node name is required' }
  }
  if (!body.node_type) {
    return { status: 400, error: 'Node type is required' }
  }

  if (body.parent_id) {
    const parent = DB.hierarchy_nodes.find((n) => n.id === body.parent_id)
    if (!parent) return { status: 400, error: 'Parent hierarchy node does not exist' }
    if (parent.project_id !== projectId || parent.org_id !== project.org_id) {
      return { status: 400, error: 'Parent hierarchy node belongs to a different project or organisation' }
    }
  }

  const newNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    org_id: project.org_id,
    project_id: projectId,
    parent_id: body.parent_id || null,
    node_type: body.node_type.toLowerCase().trim(),
    name: body.name.trim(),
    code: body.code ? body.code.trim() : null,
    sequence_order: body.sequence_order || 0,
    metadata: body.metadata || {},
    created_at: new Date().toISOString(),
  }

  DB.hierarchy_nodes.push(newNode)
  return { status: 201, data: newNode }
}

// Simulated API logic for PATCH /api/projects/[projectId]/hierarchy/[nodeId]
function handleUpdateNode({ callerProfileId, projectId, nodeId, body }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) return { status: 404, error: 'Project not found' }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  const node = DB.hierarchy_nodes.find((n) => n.id === nodeId && n.project_id === projectId)
  if (!node) return { status: 404, error: 'Hierarchy node not found' }

  if (body.parent_id !== undefined && body.parent_id !== node.parent_id) {
    if (body.parent_id !== null) {
      const parent = DB.hierarchy_nodes.find((n) => n.id === body.parent_id)
      if (!parent || parent.project_id !== projectId || parent.org_id !== project.org_id) {
        return { status: 400, error: 'Target parent node belongs to a different project' }
      }
      if (isCircular(nodeId, body.parent_id)) {
        return { status: 400, error: 'Cannot move node into its own descendant (circular relationship)' }
      }
    }
    node.parent_id = body.parent_id
  }

  if (body.name !== undefined) node.name = body.name.trim()
  if (body.code !== undefined) node.code = body.code ? body.code.trim() : null
  if (body.sequence_order !== undefined) node.sequence_order = body.sequence_order

  return { status: 200, data: node }
}

// Simulated API logic for DELETE /api/projects/[projectId]/hierarchy/[nodeId]
function handleDeleteNode({ callerProfileId, projectId, nodeId }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) return { status: 404, error: 'Project not found' }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  const nodeIndex = DB.hierarchy_nodes.findIndex((n) => n.id === nodeId && n.project_id === projectId)
  if (nodeIndex === -1) return { status: 404, error: 'Hierarchy node not found' }

  // 1. Check for child nodes
  const children = DB.hierarchy_nodes.filter((n) => n.parent_id === nodeId)
  if (children.length > 0) {
    return {
      status: 400,
      error: `Cannot delete node because it contains ${children.length} child node(s). Please move or delete child nodes first.`,
    }
  }

  // 2. Check for assigned inventory items
  const assignedUnits = DB.inventory_items.filter((u) => u.hierarchy_node_id === nodeId)
  if (assignedUnits.length > 0) {
    return {
      status: 400,
      error: `Cannot delete node because ${assignedUnits.length} inventory unit(s) are assigned to it. Please reassign or remove units first.`,
    }
  }

  DB.hierarchy_nodes.splice(nodeIndex, 1)
  return { status: 200, success: true }
}

// Aggregation calculation helper
function computeNodeAggregates(projectId) {
  const nodes = DB.hierarchy_nodes.filter((n) => n.project_id === projectId)
  const units = DB.inventory_items.filter((u) => u.project_id === projectId)

  // Direct counts
  const directCounts = new Map()
  for (const n of nodes) directCounts.set(n.id, 0)
  for (const u of units) {
    if (u.hierarchy_node_id && directCounts.has(u.hierarchy_node_id)) {
      directCounts.set(u.hierarchy_node_id, directCounts.get(u.hierarchy_node_id) + 1)
    }
  }

  // Children mapping
  const childrenMap = new Map()
  for (const n of nodes) {
    if (n.parent_id) {
      const arr = childrenMap.get(n.parent_id) || []
      arr.push(n.id)
      childrenMap.set(n.parent_id, arr)
    }
  }

  function getSubtree(nodeId) {
    const list = [nodeId]
    const ch = childrenMap.get(nodeId) || []
    for (const c of ch) list.push(...getSubtree(c))
    return list
  }

  const results = new Map()
  for (const n of nodes) {
    const sub = getSubtree(n.id)
    let total = 0
    for (const sid of sub) total += directCounts.get(sid) || 0
    results.set(n.id, { direct: directCounts.get(n.id) || 0, total })
  }

  return { nodeStats: results, projectTotalUnits: units.length }
}

// --- EXECUTE TEST CASES ---

// 1. Test creation across all 5 project categories with optional/skipped levels
// A. Apartments: Direct Tower without Phase (Optional Phase level)
const resTower = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  body: { name: 'Tower A', node_type: 'tower', code: 'T-A' },
})
assert.equal(resTower.status, 201)
const towerNodeId = resTower.data.id

// Child Floor under Tower
const resFloor = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  body: { name: 'Floor 1', node_type: 'floor', code: 'FL-01', parent_id: towerNodeId },
})
assert.equal(resFloor.status, 201)
const floorNodeId = resFloor.data.id
console.log('✓ Test 1A: Apartments Tower and Floor nodes created successfully (skipping Phase)')

// B. Plotted developments: Direct Block without Phase
const resBlock = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-plot',
  body: { name: 'Block C', node_type: 'block', code: 'BLK-C' },
})
assert.equal(resBlock.status, 201)
console.log('✓ Test 1B: Plotted Developments Block node created (skipping Phase)')

// C. Commercial: Building and Floor
const resBldg = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-comm',
  body: { name: 'Building 1', node_type: 'building', code: 'BLD-1' },
})
assert.equal(resBldg.status, 201)
console.log('✓ Test 1C: Commercial Building node created')

// D. Villas: Direct Cluster without Phase
const resCluster = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-villa',
  body: { name: 'Lotus Cluster', node_type: 'cluster', code: 'CLS-L' },
})
assert.equal(resCluster.status, 201)
console.log('✓ Test 1D: Villas Cluster node created (skipping Phase)')

// E. Mixed-Use: Component (Retail) -> Building
const resComp = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-mixed',
  body: { name: 'Retail Boulevard', node_type: 'component', code: 'CMP-RET', metadata: { component_type: 'Retail' } },
})
assert.equal(resComp.status, 201)
const compNodeId = resComp.data.id

const resRetailBldg = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-mixed',
  body: { name: 'Piazza Block', node_type: 'building', parent_id: compNodeId },
})
assert.equal(resRetailBldg.status, 201)
console.log('✓ Test 1E: Mixed-Use Component and child Building node created')

// 2. Test Descendant Inventory Aggregation & No Double-Counting
// Assign 3 inventory units to Floor 1
DB.inventory_items.push(
  { id: 'unit-101', project_id: 'proj-apt', org_id: 'org-omega', hierarchy_node_id: floorNodeId, unit_number: '101', status: 'available' },
  { id: 'unit-102', project_id: 'proj-apt', org_id: 'org-omega', hierarchy_node_id: floorNodeId, unit_number: '102', status: 'available' },
  { id: 'unit-103', project_id: 'proj-apt', org_id: 'org-omega', hierarchy_node_id: floorNodeId, unit_number: '103', status: 'booked' }
)

const aptAggregates = computeNodeAggregates('proj-apt')
const towerStats = aptAggregates.nodeStats.get(towerNodeId)
const floorStats = aptAggregates.nodeStats.get(floorNodeId)

assert.equal(floorStats.direct, 3, 'Floor 1 should have 3 direct units')
assert.equal(floorStats.total, 3, 'Floor 1 should have 3 total units')
assert.equal(towerStats.direct, 0, 'Tower A has 0 direct units')
assert.equal(towerStats.total, 3, 'Tower A should aggregate 3 units from Floor 1')
assert.equal(aptAggregates.projectTotalUnits, 3, 'Project total units must be exactly 3 (no double-counting)')
console.log('✓ Test 2: Descendant inventory aggregation verified with zero double-counting in project totals')

// 3. Test Safe Deletion: Block delete when child nodes exist
const deleteTowerAttempt = handleDeleteNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  nodeId: towerNodeId,
})
assert.equal(deleteTowerAttempt.status, 400)
assert.match(deleteTowerAttempt.error, /contains 1 child node/)
console.log('✓ Test 3: Deletion correctly prevented when child nodes exist')

// 4. Test Safe Deletion: Block delete when associated inventory exists
const deleteFloorAttempt = handleDeleteNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  nodeId: floorNodeId,
})
assert.equal(deleteFloorAttempt.status, 400)
assert.match(deleteFloorAttempt.error, /3 inventory unit\(s\) are assigned to it/)
console.log('✓ Test 4: Deletion correctly prevented when inventory units are assigned')

// 5. Test Safe Deletion: Empty leaf node deletes cleanly
const resEmptyNode = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  body: { name: 'Temporary Floor', node_type: 'floor' },
})
const emptyNodeId = resEmptyNode.data.id

const deleteEmptyRes = handleDeleteNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  nodeId: emptyNodeId,
})
assert.equal(deleteEmptyRes.status, 200)
assert.equal(deleteEmptyRes.success, true)
console.log('✓ Test 5: Empty leaf node successfully deleted')

// 6. Test Circular Move & Re-parenting Prevention
// Create 3-level chain: Phase 1 -> Wing A -> Sub-wing
const resP1 = handleCreateNode({ callerProfileId: 'prof-mgr', projectId: 'proj-apt', body: { name: 'Phase 1', node_type: 'phase' } })
const p1Id = resP1.data.id

const resW1 = handleCreateNode({ callerProfileId: 'prof-mgr', projectId: 'proj-apt', body: { name: 'Wing 1', node_type: 'wing', parent_id: p1Id } })
const w1Id = resW1.data.id

const resSW1 = handleCreateNode({ callerProfileId: 'prof-mgr', projectId: 'proj-apt', body: { name: 'Subwing 1', node_type: 'wing', parent_id: w1Id } })
const sw1Id = resSW1.data.id

// Attempt to move Phase 1 under its grandchild Subwing 1
const circularMoveRes = handleUpdateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  nodeId: p1Id,
  body: { parent_id: sw1Id },
})
assert.equal(circularMoveRes.status, 400)
assert.match(circularMoveRes.error, /circular relationship/)
console.log('✓ Test 6: Circular move correctly detected and prevented')

// 7. Test Cross-Project Parent Reference Rejection
const crossProjectParentRes = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  body: { name: 'Sneaky Node', node_type: 'floor', parent_id: compNodeId }, // compNodeId is in proj-mixed
})
assert.equal(crossProjectParentRes.status, 400)
assert.match(crossProjectParentRes.error, /different project/)
console.log('✓ Test 7: Cross-project parent reference strictly rejected')

// 8. Test Role-Based Permissions (sales_exec and readonly cannot modify)
const salesCreateAttempt = handleCreateNode({
  callerProfileId: 'prof-sales',
  projectId: 'proj-apt',
  body: { name: 'Sales Tower', node_type: 'tower' },
})
assert.equal(salesCreateAttempt.status, 403)
assert.match(salesCreateAttempt.error, /Insufficient permissions/)
console.log('✓ Test 8: Sales executive & read-only roles blocked from creating hierarchy nodes (403)')

// 9. Test Cross-Organisation Access Blocked
const crossOrgAttempt = handleCreateNode({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-ext', // in org-external, where prof-mgr is readonly
  body: { name: 'Foreign Node', node_type: 'phase' },
})
assert.equal(crossOrgAttempt.status, 403)
console.log('✓ Test 9: Cross-organisation hierarchy modification strictly blocked')

console.log('All Stage 3B Project Hierarchy Management tests passed successfully!')
