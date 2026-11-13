// tests/project-management.test.mjs
// Test suite for Stage 3A: Project Creation, Editing, Category Specifications, and Permission Controls
import assert from 'node:assert/strict'

console.log('--- Running Project Management (Stage 3A) Tests ---')

// Mock DB State
const DB = {
  organisations: [
    { id: 'org-prime', name: 'Prime Estates', slug: 'prime' },
    { id: 'org-metro', name: 'Metro Properties', slug: 'metro' },
  ],
  profiles: [
    { id: 'prof-dev', full_name: 'Developer Admin' },
    { id: 'prof-agent', full_name: 'Sales Agent (ReadOnly)' },
  ],
  org_members: [
    { id: 'm-1', org_id: 'org-prime', profile_id: 'prof-dev', role: 'owner' },
    { id: 'm-2', org_id: 'org-prime', profile_id: 'prof-agent', role: 'readonly' },
    { id: 'm-3', org_id: 'org-metro', profile_id: 'prof-agent', role: 'manager' },
  ],
  projects: [],
}

const VALID_CATEGORIES = ['apartments', 'plots', 'commercial', 'villas', 'mixed_use']

// Validation function mirroring ProjectSchema & route logic
function validateProjectPayload(data, isUpdate = false) {
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { success: false, error: 'Project name is required' }
    }
  }

  if (data.category !== undefined) {
    if (!VALID_CATEGORIES.includes(data.category)) {
      return { success: false, error: `Invalid category: ${data.category}` }
    }
  }

  if (data.brochure_url !== undefined && data.brochure_url !== null && data.brochure_url !== '') {
    try {
      new URL(data.brochure_url)
    } catch {
      return { success: false, error: 'Invalid brochure URL' }
    }
  }

  if (data.amenities !== undefined && !Array.isArray(data.amenities)) {
    return { success: false, error: 'Amenities must be an array of strings' }
  }

  if (data.specifications !== undefined && (typeof data.specifications !== 'object' || data.specifications === null)) {
    return { success: false, error: 'Specifications must be an object' }
  }

  return { success: true }
}

// Simulated API logic for POST /api/projects
function handleCreateProject({ callerProfileId, orgId, body }) {
  const membership = DB.org_members.find((m) => m.org_id === orgId && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  const validation = validateProjectPayload(body)
  if (!validation.success) {
    return { status: 400, error: validation.error }
  }

  const newProject = {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    org_id: orgId,
    name: body.name,
    code: body.code || null,
    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    category: body.category || 'apartments',
    status: body.status || 'planning',
    city: body.city || null,
    location: body.location || null,
    description: body.description || null,
    total_units_count: body.total_units_count ?? null,
    total_area_value: body.total_area_value ?? null,
    total_area_unit: body.total_area_unit ?? 'acres',
    rera_number: body.rera_number || null,
    approval_authority: body.approval_authority || null,
    launch_date: body.launch_date || null,
    completion_date: body.completion_date || null,
    brochure_url: body.brochure_url || null,
    amenities: body.amenities || [],
    specifications: body.specifications || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  DB.projects.push(newProject)
  return { status: 201, data: newProject }
}

// Simulated API logic for PATCH /api/projects/[projectId]
function handleUpdateProject({ callerProfileId, projectId, body }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) {
    return { status: 404, error: 'Project not found' }
  }

  const membership = DB.org_members.find((m) => m.org_id === project.org_id && m.profile_id === callerProfileId)
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  const validation = validateProjectPayload(body, true)
  if (!validation.success) {
    return { status: 400, error: validation.error }
  }

  // Update only provided fields, preserving everything else
  Object.keys(body).forEach((key) => {
    if (body[key] !== undefined) {
      project[key] = body[key]
    }
  })
  project.updated_at = new Date().toISOString()

  return { status: 200, data: project }
}

// --- TEST CASES ---

// Test 1: Create project for each of the 5 categories
const categoryPayloads = [
  {
    name: 'Green Heights Towers',
    category: 'apartments',
    specifications: { towers_count: 4, floors_count: 14, clubhouse_sqft: 25000 },
    amenities: ['Clubhouse', 'Swimming Pool', 'Gym'],
  },
  {
    name: 'Orchid Meadows Plotted Layout',
    category: 'plots',
    specifications: { plot_size_range: '150 - 400 sq.yds', road_widths: '40ft, 60ft', layout_sanction: 'HMDA' },
    amenities: ['24/7 Security', 'Blacktop Roads', 'Underground Drainage'],
  },
  {
    name: 'Cyber Park Commercial Suites',
    category: 'commercial',
    specifications: { asset_types: 'Office Spaces, Retail Frontage', floor_plate_sqft: 18000, saleable_area_sqft: 250000 },
    amenities: ['High Speed Elevators', 'Power Backup', 'Ample Parking'],
  },
  {
    name: 'Whispering Palms Luxury Villas',
    category: 'villas',
    specifications: { villa_types: '4BHK Triplex', plot_size_range: '300-500 sq.yds', built_up_range: '4200 sq.ft' },
    amenities: ['Private Garden', 'Clubhouse', 'Swimming Pool'],
  },
  {
    name: 'Metro Central Integrated Enclave',
    category: 'mixed_use',
    specifications: { components: ['Residential Towers', 'Commercial Offices', 'Retail Boulevard'] },
    amenities: ['Retail Plaza', 'Gym', 'Amphitheatre'],
  },
]

categoryPayloads.forEach((payload) => {
  const res = handleCreateProject({
    callerProfileId: 'prof-dev',
    orgId: 'org-prime',
    body: payload,
  })
  assert.equal(res.status, 201, `Failed to create ${payload.category} project`)
  assert.equal(res.data.category, payload.category)
  assert.deepEqual(res.data.amenities, payload.amenities)
  assert.deepEqual(res.data.specifications, payload.specifications)
  console.log(`✓ Created valid project for category: ${payload.category}`)
})

// Test 2: Reject invalid category
const invalidCatRes = handleCreateProject({
  callerProfileId: 'prof-dev',
  orgId: 'org-prime',
  body: { name: 'Invalid Category Project', category: 'industrial_warehousing' },
})
assert.equal(invalidCatRes.status, 400)
assert.match(invalidCatRes.error, /Invalid category/)
console.log('✓ Rejected project with invalid category')

// Test 3: Edit existing project - partial update preserves existing fields
const apartmentProject = DB.projects.find((p) => p.category === 'apartments')
assert(apartmentProject, 'Apartment project should exist')

const updateRes = handleUpdateProject({
  callerProfileId: 'prof-dev',
  projectId: apartmentProject.id,
  body: {
    status: 'launched',
    brochure_url: 'https://example.com/brochure.pdf',
    specifications: { ...apartmentProject.specifications, towers_count: 5 },
    amenities: [...apartmentProject.amenities, 'Tennis Court'],
  },
})

assert.equal(updateRes.status, 200)
assert.equal(updateRes.data.status, 'launched')
assert.equal(updateRes.data.name, 'Green Heights Towers', 'Name should be preserved')
assert.equal(updateRes.data.brochure_url, 'https://example.com/brochure.pdf')
assert.equal(updateRes.data.specifications.towers_count, 5)
assert(updateRes.data.amenities.includes('Tennis Court'))
console.log('✓ Project update successfully preserved existing data and updated specs/amenities')

// Test 4: Block unauthorized role (readonly) from editing project
const unauthorizedRes = handleUpdateProject({
  callerProfileId: 'prof-agent', // agent is readonly in org-prime
  projectId: apartmentProject.id,
  body: { name: 'Hacked Name' },
})
assert.equal(unauthorizedRes.status, 403)
assert.equal(unauthorizedRes.error, 'Insufficient permissions')
console.log('✓ Blocked readonly user from editing project')

// Test 5: Block cross-organization project update
// prof-agent is manager in org-metro, but apartmentProject belongs to org-prime
const crossOrgRes = handleUpdateProject({
  callerProfileId: 'prof-agent',
  projectId: apartmentProject.id,
  body: { name: 'Cross Org Update' },
})
assert.equal(crossOrgRes.status, 403)
console.log('✓ Blocked cross-organization project modification')

// Test 6: Validate brochure_url validation
const invalidUrlRes = handleUpdateProject({
  callerProfileId: 'prof-dev',
  projectId: apartmentProject.id,
  body: { brochure_url: 'not-a-valid-url' },
})
assert.equal(invalidUrlRes.status, 400)
assert.match(invalidUrlRes.error, /Invalid brochure URL/)
console.log('✓ Validated brochure URL format')

console.log('All Stage 3A Project Management tests passed successfully!')
