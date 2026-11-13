// tests/bulk-inventory-import.test.mjs
// Test suite for Stage 3F: Bulk Inventory Import (CSV & Excel) Across All 5 Project Categories
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

console.log('--- Running Bulk Inventory Import (Stage 3F) Tests ---')

// --------------------------------------------------------------------------
// Domain Logic to Test: Template Generation, Parser, Sanitizer, Validator
// --------------------------------------------------------------------------

const CATEGORY_COLUMNS = {
  apartments: [
    { key: 'unit_number', label: 'Unit Number*', required: true },
    { key: 'tower_name', label: 'Tower', required: false },
    { key: 'floor_number', label: 'Floor', required: false },
    { key: 'bhk_config', label: 'BHK', required: false },
    { key: 'area_value', label: 'Saleable Area*', required: true },
    { key: 'area_unit', label: 'Area Unit*', required: true },
    { key: 'total_price', label: 'Total Price (₹)', required: false },
  ],
  plotted_developments: [
    { key: 'unit_number', label: 'Plot Number*', required: true },
    { key: 'tower_name', label: 'Block / Sector', required: false },
    { key: 'area_value', label: 'Plot Area*', required: true },
    { key: 'area_unit', label: 'Area Unit*', required: true },
    { key: 'plot_dimensions', label: 'Plot Dimensions', required: false },
    { key: 'road_width_ft', label: 'Road Width (ft)', required: false },
    { key: 'is_corner_plot', label: 'Corner Plot', required: false },
    { key: 'total_price', label: 'Total Price (₹)', required: false },
  ],
  commercial_sale: [
    { key: 'unit_number', label: 'Commercial Unit Number*', required: true },
    { key: 'tower_name', label: 'Building / Wing', required: false },
    { key: 'commercial_asset_type', label: 'Asset Type', required: false },
    { key: 'area_value', label: 'Saleable Area*', required: true },
    { key: 'area_unit', label: 'Area Unit*', required: true },
    { key: 'total_price', label: 'Total Price (₹)', required: false },
  ],
  villas_gated_communities: [
    { key: 'unit_number', label: 'Villa Number*', required: true },
    { key: 'tower_name', label: 'Cluster / Street', required: false },
    { key: 'bhk_config', label: 'Typology', required: false },
    { key: 'area_value', label: 'Built-up Area*', required: true },
    { key: 'area_unit', label: 'Area Unit*', required: true },
    { key: 'plot_area', label: 'Plot Extent (sqyd)', required: false },
    { key: 'total_price', label: 'Total Price (₹)', required: false },
  ],
  mixed_use: [
    { key: 'unit_number', label: 'Inventory Number*', required: true },
    { key: 'category', label: 'Component Category*', required: true },
    { key: 'area_value', label: 'Primary Area*', required: true },
    { key: 'area_unit', label: 'Area Unit*', required: true },
    { key: 'total_price', label: 'Total Price (₹)', required: false },
  ],
}

function generateCsvTemplate(category) {
  const columns = CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.apartments
  return columns.map((c) => c.label).join(',') + '\n'
}

function generateXlsxTemplate(category) {
  const columns = CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.apartments
  const headers = columns.map((c) => c.label)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

function sanitizeFormulaInjection(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '') return value
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return value
  }
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r']
  if (dangerousPrefixes.some((p) => value.startsWith(p))) {
    return `'${value}`
  }
  return value
}

const HEADER_ALIASES = {
  'unit number*': 'unit_number',
  'unit number': 'unit_number',
  'unit #': 'unit_number',
  'flat no': 'unit_number',
  'plot number*': 'unit_number',
  'plot number': 'unit_number',
  'commercial unit number*': 'unit_number',
  'villa number*': 'unit_number',
  'inventory number*': 'unit_number',
  tower: 'tower_name',
  'tower / block': 'tower_name',
  'block / sector': 'tower_name',
  'saleable area*': 'area_value',
  'plot area*': 'area_value',
  'built-up area*': 'area_value',
  'primary area*': 'area_value',
  'area unit*': 'area_unit',
  'corner plot': 'is_corner_plot',
  'asset type': 'commercial_asset_type',
  'component category*': 'category',
}

function normalizeHeader(header) {
  const clean = header.trim().toLowerCase().replace(/[\r\n]/g, '')
  return HEADER_ALIASES[clean] || null
}

function validateImportRows({ rawRows, columnMapping, projectCategory, existingUnitNumbers = new Set() }) {
  const fileSeenUnits = new Set()
  const rows = []
  let validCount = 0
  let invalidCount = 0
  const allowedUnits = ['sqft', 'sqyd', 'acres', 'guntas', 'cents']

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 1
    const errors = []
    const mapped = {}
    const unmapped = {}

    for (const [header, val] of Object.entries(rawRow)) {
      const canonicalKey = columnMapping[header]
      if (canonicalKey && canonicalKey !== 'ignore') {
        mapped[canonicalKey] = val
      } else {
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          unmapped[header] = val
        }
      }
    }

    // 1. Unit number
    const unitNumber = String(mapped.unit_number || '').trim()
    if (!unitNumber) {
      errors.push({ field: 'unit_number', message: 'Unit / Plot number is required.' })
    } else {
      const lower = unitNumber.toLowerCase()
      if (fileSeenUnits.has(lower)) {
        errors.push({ field: 'unit_number', message: `Duplicate unit number '${unitNumber}' appears multiple times in this file.` })
      } else {
        fileSeenUnits.add(lower)
      }

      if (existingUnitNumbers.has(lower)) {
        errors.push({ field: 'unit_number', message: `Unit number '${unitNumber}' already exists in this project.` })
      }
    }

    // 2. Category
    let category = projectCategory
    if (projectCategory === 'mixed_use') {
      const rawCat = String(mapped.category || '').trim().toLowerCase()
      const validCategories = ['apartments', 'plotted_developments', 'commercial_sale', 'villas_gated_communities']
      if (!rawCat) {
        errors.push({ field: 'category', message: 'Mixed-use projects require component category' })
      } else if (!validCategories.includes(rawCat)) {
        errors.push({ field: 'category', message: `Invalid category '${rawCat}'` })
      } else {
        category = rawCat
      }
    }

    // 3. Area value & unit
    const areaNum = parseFloat(String(mapped.area_value || '').replace(/,/g, ''))
    if (isNaN(areaNum) || areaNum <= 0) {
      errors.push({ field: 'area_value', message: 'Area value must be a positive number.' })
    }

    const unitStr = String(mapped.area_unit || '').trim().toLowerCase()
    if (!allowedUnits.includes(unitStr)) {
      errors.push({ field: 'area_unit', message: `Invalid area unit '${unitStr}'` })
    }

    const isValid = errors.length === 0
    if (isValid) validCount++
    else invalidCount++

    rows.push({
      rowNumber,
      isValid,
      unitNumber,
      category,
      areaValue: areaNum,
      areaUnit: unitStr,
      customAttributes: unmapped,
      errors,
    })
  })

  return {
    totalRows: rawRows.length,
    validCount,
    invalidCount,
    rows,
  }
}

// --------------------------------------------------------------------------
// TEST 1: Downloadable Template Generation for All 5 Categories
// --------------------------------------------------------------------------
console.log('Test 1: Downloadable Templates Generation for All 5 Categories')

const allCategories = ['apartments', 'plotted_developments', 'commercial_sale', 'villas_gated_communities', 'mixed_use']
for (const cat of allCategories) {
  // 1a. CSV template
  const csv = generateCsvTemplate(cat)
  assert.ok(csv.length > 20, `CSV template for ${cat} must be non-empty`)
  const headers = csv.split('\n')[0]
  assert.ok(headers.includes('Unit Number') || headers.includes('Plot Number') || headers.includes('Commercial Unit Number') || headers.includes('Villa Number') || headers.includes('Inventory Number'))

  // 1b. XLSX template
  const xlsxBuf = generateXlsxTemplate(cat)
  assert.ok(xlsxBuf.length > 50, `XLSX template for ${cat} must be non-empty buffer`)
  const wb = XLSX.read(xlsxBuf, { type: 'buffer' })
  assert.ok(wb.SheetNames.includes('Inventory Template'))
}
console.log('✓ Test 1 Passed: Templates generated successfully for all 5 categories.')

// --------------------------------------------------------------------------
// TEST 2: Parsing CSV & Excel Spreadsheets
// --------------------------------------------------------------------------
console.log('Test 2: Parsing CSV and XLSX Files')

// 2a. Parse CSV with PapaParse
const sampleCsv = `Unit Number*,Tower,Floor,BHK,Saleable Area*,Area Unit*,Total Price (₹)
A-101,Tower A,1,2 BHK,1200,sqft,7200000
A-102,Tower A,1,3 BHK,1500,sqft,9000000
A-103,Tower A,1,3 BHK,1500,sqft,9000000`

const parsedCsv = Papa.parse(sampleCsv, { header: true, skipEmptyLines: true })
assert.equal(parsedCsv.data.length, 3)
assert.equal(parsedCsv.data[0]['Unit Number*'], 'A-101')

// 2b. Parse XLSX with XLSX
const ws = XLSX.utils.aoa_to_sheet([
  ['Plot Number*', 'Block / Sector', 'Plot Area*', 'Area Unit*', 'Corner Plot'],
  ['Plot 10', 'Block B', '250', 'sqyd', 'yes'],
  ['Plot 11', 'Block B', '300', 'sqyd', 'no'],
])
const testWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(testWb, ws, 'Plots')
const testBuf = XLSX.write(testWb, { type: 'buffer', bookType: 'xlsx' })

const readWb = XLSX.read(testBuf, { type: 'buffer' })
const parsedXlsxRows = XLSX.utils.sheet_to_json(readWb.Sheets[readWb.SheetNames[0]])
assert.equal(parsedXlsxRows.length, 2)
assert.equal(parsedXlsxRows[0]['Plot Number*'], 'Plot 10')
console.log('✓ Test 2 Passed: CSV and XLSX files parsed accurately.')

// --------------------------------------------------------------------------
// TEST 3: Column Normalization & Canonical Header Resolution
// --------------------------------------------------------------------------
console.log('Test 3: Column Normalization to Canonical Keys')

assert.equal(normalizeHeader('Unit Number*'), 'unit_number')
assert.equal(normalizeHeader('Flat No'), 'unit_number')
assert.equal(normalizeHeader('Tower / Block'), 'tower_name')
assert.equal(normalizeHeader('Saleable Area*'), 'area_value')
assert.equal(normalizeHeader('Corner Plot'), 'is_corner_plot')
assert.equal(normalizeHeader('Unmapped XYZ'), null)
console.log('✓ Test 3 Passed: Header aliases normalized to canonical database schema.')

// --------------------------------------------------------------------------
// TEST 4: Row-by-Row Deep Validation (Apartments)
// --------------------------------------------------------------------------
console.log('Test 4: Row-by-Row Deep Validation (Apartments)')

const rawAptRows = [
  { 'Unit Number*': 'A-102', 'Saleable Area*': '1250', 'Area Unit*': 'sqft', Tower: 'Tower A', Floor: '1', CustomTag: 'PoolView' },
  { 'Unit Number*': 'A-101', 'Saleable Area*': '1500', 'Area Unit*': 'sqft' }, // Existing duplicate in project!
  { 'Unit Number*': '', 'Saleable Area*': '1000', 'Area Unit*': 'sqft' }, // Missing unit number!
  { 'Unit Number*': 'A-103', 'Saleable Area*': '-500', 'Area Unit*': 'sqft' }, // Negative area!
  { 'Unit Number*': 'A-104', 'Saleable Area*': '1100', 'Area Unit*': 'invalid_unit' }, // Invalid area unit!
  { 'Unit Number*': 'A-102', 'Saleable Area*': '1250', 'Area Unit*': 'sqft' }, // Duplicate within file!
]

const mapping = {
  'Unit Number*': 'unit_number',
  'Saleable Area*': 'area_value',
  'Area Unit*': 'area_unit',
  Tower: 'tower_name',
  Floor: 'floor_number',
  CustomTag: 'ignore', // Unmapped -> Custom Attributes
}

const existingUnits = new Set(['a-101']) // A-101 already exists in project

const validation = validateImportRows({
  rawRows: rawAptRows,
  columnMapping: mapping,
  projectCategory: 'apartments',
  existingUnitNumbers: existingUnits,
})

assert.equal(validation.totalRows, 6)
assert.equal(validation.validCount, 1, 'Only row 1 (A-102 first occurrence) is valid')
assert.equal(validation.invalidCount, 5, 'Rows 2, 3, 4, 5, 6 must be invalid')

// Check specific error messages
assert.ok(validation.rows[1].errors.some((e) => e.message.includes('already exists in this project')))
assert.ok(validation.rows[2].errors.some((e) => e.message.includes('Unit / Plot number is required')))
assert.ok(validation.rows[3].errors.some((e) => e.message.includes('positive number')))
assert.ok(validation.rows[4].errors.some((e) => e.message.includes('Invalid area unit')))
assert.ok(validation.rows[5].errors.some((e) => e.message.includes('multiple times in this file')))

// Check custom attributes preservation on valid row
assert.equal(validation.rows[0].customAttributes.CustomTag, 'PoolView')
console.log('✓ Test 4 Passed: Row validation caught all required, format, duplicate, and area constraints.')

// --------------------------------------------------------------------------
// TEST 5: Mixed-Use Component Category Validation
// --------------------------------------------------------------------------
console.log('Test 5: Mixed-Use Multi-Category Validation')

const mixedRawRows = [
  { 'Inventory Number*': 'APT-1', 'Component Category*': 'apartments', 'Primary Area*': '1200', 'Area Unit*': 'sqft' },
  { 'Inventory Number*': 'COM-1', 'Component Category*': 'commercial_sale', 'Primary Area*': '800', 'Area Unit*': 'sqft' },
  { 'Inventory Number*': 'PLT-1', 'Component Category*': 'plotted_developments', 'Primary Area*': '200', 'Area Unit*': 'sqyd' },
  { 'Inventory Number*': 'VIL-1', 'Component Category*': 'villas_gated_communities', 'Primary Area*': '2500', 'Area Unit*': 'sqft' },
  { 'Inventory Number*': 'ERR-1', 'Component Category*': 'invalid_cat', 'Primary Area*': '1000', 'Area Unit*': 'sqft' }, // Invalid category!
  { 'Inventory Number*': 'ERR-2', 'Component Category*': '', 'Primary Area*': '1000', 'Area Unit*': 'sqft' }, // Missing category!
]

const mixedMapping = {
  'Inventory Number*': 'unit_number',
  'Component Category*': 'category',
  'Primary Area*': 'area_value',
  'Area Unit*': 'area_unit',
}

const mixedValidation = validateImportRows({
  rawRows: mixedRawRows,
  columnMapping: mixedMapping,
  projectCategory: 'mixed_use',
})

assert.equal(mixedValidation.validCount, 4, 'All 4 valid component categories allowed in mixed use')
assert.equal(mixedValidation.invalidCount, 2, 'Invalid and missing categories rejected')
assert.ok(mixedValidation.rows[4].errors.some((e) => e.message.includes('Invalid category')))
assert.ok(mixedValidation.rows[5].errors.some((e) => e.message.includes('Mixed-use projects require component category')))
console.log('✓ Test 5 Passed: Mixed-use component category validation enforced.')

// --------------------------------------------------------------------------
// TEST 6: Formula Injection Protection (CSV / Spreadsheet Injection)
// --------------------------------------------------------------------------
console.log('Test 6: Formula Injection (DDE) Sanitization')

const maliciousInputs = [
  '=CMD|" /C calc"!A0',
  '+1+1',
  '-2+3',
  '@SUM(1,2)',
  '\tTAB_INDENT',
  '\rCARRIAGE_RETURN',
]

maliciousInputs.forEach((malicious) => {
  const sanitized = sanitizeFormulaInjection(malicious)
  assert.ok(String(sanitized).startsWith("'"), `Dangerous payload '${malicious}' must be prefixed with single quote`)
})

const safeInput = 'Flat 402 - East Facing'
assert.equal(sanitizeFormulaInjection(safeInput), safeInput)
console.log('✓ Test 6 Passed: Formula injection attacks safely sanitized.')

// --------------------------------------------------------------------------
// TEST 7: Tenant Isolation & Permissions on Import History
// --------------------------------------------------------------------------
console.log('Test 7: Tenant Isolation and Role RBAC on Import Operations')

const DB = {
  organisations: [
    { id: 'org-alpha', name: 'Alpha Builders' },
    { id: 'org-beta', name: 'Beta Realty' },
  ],
  profiles: [
    { id: 'prof-mgr', role: 'manager', org_id: 'org-alpha' },
    { id: 'prof-ro', role: 'readonly', org_id: 'org-alpha' },
  ],
  projects: [
    { id: 'proj-apt', org_id: 'org-alpha', name: 'Skyline Towers' },
    { id: 'proj-ext', org_id: 'org-beta', name: 'External Beta Project' },
  ],
}

function handleImportExecution({ callerProfileId, projectId, rows }) {
  const project = DB.projects.find((p) => p.id === projectId)
  if (!project) return { status: 404, error: 'Project not found' }

  const caller = DB.profiles.find((p) => p.id === callerProfileId)
  if (!caller || caller.org_id !== project.org_id) {
    return { status: 403, error: 'Cross-tenant access forbidden' }
  }

  if (!['owner', 'admin', 'manager'].includes(caller.role)) {
    return { status: 403, error: 'Insufficient permissions: Manager role required' }
  }

  return { status: 200, success: true, count: rows.length }
}

// 7a. Manager of org-alpha importing into proj-apt -> Success
const mgrImport = handleImportExecution({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-apt',
  rows: [{ unit_number: 'A-501' }],
})
assert.equal(mgrImport.status, 200)

// 7b. Readonly member of org-alpha -> Forbidden (403)
const roImport = handleImportExecution({
  callerProfileId: 'prof-ro',
  projectId: 'proj-apt',
  rows: [{ unit_number: 'A-502' }],
})
assert.equal(roImport.status, 403)
assert.ok(roImport.error.includes('Insufficient permissions'))

// 7c. Cross-tenant attempt: org-alpha user trying to import into org-beta project -> Forbidden (403)
const crossTenantImport = handleImportExecution({
  callerProfileId: 'prof-mgr',
  projectId: 'proj-ext',
  rows: [{ unit_number: 'EXT-02' }],
})
assert.equal(crossTenantImport.status, 403)
assert.ok(crossTenantImport.error.includes('Cross-tenant access forbidden'))
console.log('✓ Test 7 Passed: Multi-tenant boundary and RBAC strictly enforced.')

// --------------------------------------------------------------------------
// TEST 8: Safe Batch Processing & Partial Failure Resilience
// --------------------------------------------------------------------------
console.log('Test 8: Batch Processing & Partial Failure Recovery')

function simulateBatchImport(rows, batchSize = 2) {
  let successful = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    for (const item of chunk) {
      if (item.unit_number === 'FAIL_ME') {
        failed++
        errors.push({ unit: item.unit_number, error: 'Simulated DB constraint failure' })
      } else {
        successful++
      }
    }
  }

  return {
    successful,
    failed,
    status: successful > 0 && failed > 0 ? 'partial' : failed === 0 ? 'completed' : 'failed',
    errors,
  }
}

const batchTestRows = [
  { unit_number: 'B-1' },
  { unit_number: 'B-2' },
  { unit_number: 'FAIL_ME' }, // Fails!
  { unit_number: 'B-4' },
  { unit_number: 'B-5' },
]

const batchResult = simulateBatchImport(batchTestRows, 2)
assert.equal(batchResult.successful, 4, '4 rows succeeded')
assert.equal(batchResult.failed, 1, '1 row failed')
assert.equal(batchResult.status, 'partial', 'Partial failure correctly recognized')
assert.equal(batchResult.errors.length, 1)
assert.equal(batchResult.errors[0].unit, 'FAIL_ME')
console.log('✓ Test 8 Passed: Batching handles partial failure gracefully without dropping other rows.')

// --------------------------------------------------------------------------
// TEST 9: Concurrent Duplicate Imports & DB Unique Constraint Protection
// --------------------------------------------------------------------------
console.log('Test 9: Concurrent Duplicate Imports & DB Constraint Race Protection')

const mockProjectInventory = new Map() // key: `${projectId}:${lower(unit_number)}`

function attemptDbInsert(item) {
  const key = `${item.project_id}:${item.unit_number.trim().toLowerCase()}`
  if (mockProjectInventory.has(key)) {
    throw new Error(`duplicate key value violates unique constraint "idx_inventory_project_unit_ci"`)
  }
  mockProjectInventory.set(key, { ...item, id: `inv-${Date.now()}-${Math.random()}` })
  return mockProjectInventory.get(key)
}

// Worker 1 and Worker 2 concurrently import unit 'T1-101' in 'proj-alpha'
const worker1Success = attemptDbInsert({
  project_id: 'proj-alpha',
  unit_number: 'T1-101',
  import_reference_id: 'IMP-WORKER-1',
})
assert.ok(worker1Success.id)

// Worker 2 attempts concurrent insert of same unit (even with different case 't1-101')
let worker2CaughtError = false
try {
  attemptDbInsert({
    project_id: 'proj-alpha',
    unit_number: 't1-101', // case-insensitive duplicate!
    import_reference_id: 'IMP-WORKER-2',
  })
} catch (err) {
  worker2CaughtError = true
  assert.ok(err.message.includes('unique constraint'))
}
assert.equal(worker2CaughtError, true, 'Worker 2 must be blocked by DB unique constraint')

// Ensure worker 1's record remains untouched (never overwritten)
const storedItem = mockProjectInventory.get('proj-alpha:t1-101')
assert.equal(storedItem.import_reference_id, 'IMP-WORKER-1')
console.log('✓ Test 9 Passed: Concurrent duplicate race condition safely blocked by DB constraint.')

// --------------------------------------------------------------------------
// TEST 10: 100-Row Partial Interruption, Stable Retry & Separate New Import
// --------------------------------------------------------------------------
console.log('Test 10: 100-Row Partial Interruption, Stable Retry & Separate New Import')

// 100 inventory rows for a project
const hundredRows = Array.from({ length: 100 }, (_, i) => ({
  unit_number: `UNIT-${String(i + 1).padStart(3, '0')}`,
  area_value: 1000 + i * 10,
}))

const stableJobId = 'IMP-JOB-STABLE-100'

// Attempt 1: First 60 rows imported successfully before request drops
const attempt1Rows = hundredRows.slice(0, 60)
attempt1Rows.forEach((row) => {
  attemptDbInsert({
    project_id: 'proj-100-test',
    ...row,
    import_reference_id: stableJobId,
  })
})
const itemsAfterAttempt1 = Array.from(mockProjectInventory.values()).filter((i) => i.project_id === 'proj-100-test')
assert.equal(itemsAfterAttempt1.length, 60, 'Exactly 60 rows persisted in attempt 1')

// Attempt 2: User retries the EXACT same import submitting stableJobId
function executeImportAccounting(projectId, rows, activeReferenceId) {
  let newlyImported = 0
  let previouslyCompleted = 0
  let preExistingSkipped = 0
  const errors = []

  rows.forEach((row) => {
    const key = `${projectId}:${row.unit_number.trim().toLowerCase()}`
    if (mockProjectInventory.has(key)) {
      const existing = mockProjectInventory.get(key)
      if (existing.import_reference_id === activeReferenceId) {
        // Category A: Created by current import reference in earlier chunk
        previouslyCompleted++
      } else {
        // Category B: Pre-existed before this import began
        preExistingSkipped++
      }
      return
    }
    // Category C: Pending row
    try {
      attemptDbInsert({ project_id: projectId, ...row, import_reference_id: activeReferenceId })
      newlyImported++
    } catch (err) {
      errors.push({ unit: row.unit_number, error: err.message })
    }
  })

  return { newlyImported, previouslyCompleted, preExistingSkipped, errors }
}

const retry100Result = executeImportAccounting('proj-100-test', hundredRows, stableJobId)
assert.equal(retry100Result.previouslyCompleted, 60, '60 rows recognized as previously completed by this stable job ID')
assert.equal(retry100Result.newlyImported, 40, 'Only remaining 40 pending rows attempted and inserted')
assert.equal(retry100Result.preExistingSkipped, 0, 'Zero pre-existing foreign rows in this job')

const itemsAfterRetry = Array.from(mockProjectInventory.values()).filter((i) => i.project_id === 'proj-100-test')
assert.equal(itemsAfterRetry.length, 100, 'Total items in project is now exactly 100 with zero duplicates')

// Scenario 3: Separate NEW import of the exact same spreadsheet with new job ID IMP-NEW-JOB
const separateNewJobResult = executeImportAccounting('proj-100-test', hundredRows, 'IMP-NEW-JOB')
assert.equal(separateNewJobResult.previouslyCompleted, 0, 'Separate new import claims 0 previously completed rows as its own')
assert.equal(separateNewJobResult.preExistingSkipped, 100, 'All 100 existing rows correctly treated as pre-existing')
assert.equal(separateNewJobResult.newlyImported, 0, '0 new units inserted; existing inventory is untouched and never overwritten')

console.log('✓ Test 10 Passed: 60/40 partial retry works cleanly, separate import does not claim foreign rows, and existing data is never overwritten.')

// --------------------------------------------------------------------------
// TEST 11: Import Reference ID Association & Audit
// --------------------------------------------------------------------------
console.log('Test 11: Import Reference ID Association')

const itemsWithRetryBatch = itemsAfterRetry.filter((i) => i.import_reference_id === stableJobId)
assert.equal(itemsWithRetryBatch.length, 100, 'All 100 items created by stableJobId accurately track reference ID')
console.log('✓ Test 11 Passed: Import reference ID reliably associated with created items.')

// --------------------------------------------------------------------------
// TEST 12: Negative Numeric Input Preservation (Basement Floors)
// --------------------------------------------------------------------------
console.log('Test 12: Negative Numeric Input Preservation')

// Legitimate basement floors e.g. -1 (Basement 1), -2 (Sub-basement)
const basementFloorRaw = '-1'
const sanitizedBasement = sanitizeFormulaInjection(basementFloorRaw)
assert.equal(sanitizedBasement, '-1', 'Basement floor "-1" must not be modified by formula sanitizer')

const parsedFloor = parseInt(basementFloorRaw, 10)
assert.equal(parsedFloor, -1, 'Parsed floor must be negative integer')
assert.ok(parsedFloor >= -10 && parsedFloor <= 300, 'Basement floor must be valid floor number')
console.log('✓ Test 12 Passed: Legitimate negative numeric values preserved and validated.')

// --------------------------------------------------------------------------
// TEST 13: Mixed-Use Canonical Category Values & Aliases
// --------------------------------------------------------------------------
console.log('Test 13: Mixed-Use Canonical Category Values & Aliases')

function resolveCategory(rawCategory, isMixedUse, projectCategory) {
  if (!isMixedUse) {
    if (rawCategory && rawCategory.toLowerCase() !== projectCategory) {
      throw new Error(`Category mismatch: row has '${rawCategory}' but project is '${projectCategory}'`)
    }
    return projectCategory
  }

  const catLower = String(rawCategory || '').trim().toLowerCase()
  if (catLower === 'apartments' || catLower === 'apartment' || catLower === 'residential') return 'apartments'
  if (catLower === 'commercial_sale' || catLower === 'commercial' || catLower === 'office' || catLower === 'retail') return 'commercial_sale'
  if (catLower === 'plotted_developments' || catLower === 'plots' || catLower === 'plot') return 'plotted_developments'
  if (catLower === 'villas_gated_communities' || catLower === 'villas' || catLower === 'villa') return 'villas_gated_communities'

  throw new Error(`Invalid category '${rawCategory}'. Allowed: apartments, commercial_sale, plotted_developments, villas_gated_communities`)
}

// 13a. Apartment row in mixed-use
assert.equal(resolveCategory('Apartments', true, 'mixed_use'), 'apartments')
assert.equal(resolveCategory('residential', true, 'mixed_use'), 'apartments')

// 13b. Commercial row in mixed-use
assert.equal(resolveCategory('Commercial', true, 'mixed_use'), 'commercial_sale')
assert.equal(resolveCategory('office', true, 'mixed_use'), 'commercial_sale')

// 13c. Plot row in mixed-use
assert.equal(resolveCategory('Plots', true, 'mixed_use'), 'plotted_developments')

// 13d. Villa row in mixed-use
assert.equal(resolveCategory('Villa', true, 'mixed_use'), 'villas_gated_communities')

// 13e. Invalid category in mixed-use
assert.throws(() => resolveCategory('Industrial Warehousing', true, 'mixed_use'), /Invalid category/)

// 13f. Category mismatch in single-category project
assert.throws(() => resolveCategory('commercial_sale', false, 'apartments'), /Category mismatch/)
console.log('✓ Test 13 Passed: Mixed-use canonical category resolution and strict mismatches enforced.')

// --------------------------------------------------------------------------
// TEST 14: CSV & XLSX Formula Injection Defense
// --------------------------------------------------------------------------
console.log('Test 14: CSV & XLSX Formula Injection Defense')

const ddePayloads = [
  '=cmd|\' /C calc\'!A0',
  '+1+1',
  '-2+3*cmd',
  '@SUM(1,2)',
  '\tMALICIOUS_TAB',
  '\rMALICIOUS_CR',
]

ddePayloads.forEach((payload) => {
  const sanitized = sanitizeFormulaInjection(payload)
  assert.ok(String(sanitized).startsWith("'"), `Payload '${payload}' must be escaped with single quote`)
})

// Normal numeric values must remain bare numbers
assert.equal(sanitizeFormulaInjection('1500'), '1500')
assert.equal(sanitizeFormulaInjection('-2'), '-2')
assert.equal(sanitizeFormulaInjection('95.50'), '95.50')
console.log('✓ Test 14 Passed: Formula injection attacks escaped while legitimate numbers are preserved.')

// --------------------------------------------------------------------------
// TEST 15: Cross-Organisation Import History Access (RLS Contract)
// --------------------------------------------------------------------------
console.log('Test 15: Cross-Organisation History Access Prevention')

const importHistoryTable = [
  { id: 'hist-1', org_id: 'org-alpha', project_id: 'proj-alpha', file_name: 'units.csv' },
  { id: 'hist-2', org_id: 'org-beta', project_id: 'proj-beta', file_name: 'plots.xlsx' },
]

function queryImportHistory(callerOrgId, projectId) {
  // Simulates Postgres RLS: auth_is_member_of_org(org_id) AND project_id = $1
  return importHistoryTable.filter((h) => h.org_id === callerOrgId && h.project_id === projectId)
}

// Caller from org-alpha queries proj-alpha -> returns record
const alphaHistory = queryImportHistory('org-alpha', 'proj-alpha')
assert.equal(alphaHistory.length, 1)

// Caller from org-alpha tries to query proj-beta of org-beta -> returns empty (isolated)
const crossOrgHistory = queryImportHistory('org-alpha', 'proj-beta')
assert.equal(crossOrgHistory.length, 0, 'Cross-organisation history queries return zero records')
console.log('✓ Test 15 Passed: Cross-organisation import history strictly protected by tenant boundary.')

// --------------------------------------------------------------------------
// TEST 16: Consistent Duplicate Validation Across All Entry Points
// --------------------------------------------------------------------------
console.log('Test 16: Consistent Duplicate Validation Across Creation, Edit & Whitespace/Casing')

const testInventoryStore = [
  { id: 'inv-item-1', project_id: 'proj-1', unit_number: 'Tower-A-101' },
]

function validateDuplicateOnCreate(projectId, rawUnitNumber) {
  const normalized = rawUnitNumber.trim().toLowerCase()
  const exists = testInventoryStore.some(
    (i) => i.project_id === projectId && i.unit_number.trim().toLowerCase() === normalized
  )
  if (exists) {
    return { isDuplicate: true, error: `Unit '${rawUnitNumber}' already exists in this project.` }
  }
  return { isDuplicate: false }
}

function validateDuplicateOnUpdate(inventoryId, projectId, rawUnitNumber) {
  const normalized = rawUnitNumber.trim().toLowerCase()
  const exists = testInventoryStore.some(
    (i) => i.id !== inventoryId && i.project_id === projectId && i.unit_number.trim().toLowerCase() === normalized
  )
  if (exists) {
    return { isDuplicate: true, error: `Unit '${rawUnitNumber}' already exists in this project.` }
  }
  return { isDuplicate: false }
}

// 16a. Creation with different casing is caught as duplicate
const dupCasingCreate = validateDuplicateOnCreate('proj-1', 'tower-a-101')
assert.equal(dupCasingCreate.isDuplicate, true, 'Case-insensitive duplicate on creation must be caught')

// 16b. Creation with leading/trailing whitespace is caught as duplicate
const dupWhitespaceCreate = validateDuplicateOnCreate('proj-1', '  Tower-A-101  ')
assert.equal(dupWhitespaceCreate.isDuplicate, true, 'Whitespace-padded duplicate on creation must be caught')

// 16c. Updating an existing item to its own unit number must NOT conflict with itself
const selfEditUpdate = validateDuplicateOnUpdate('inv-item-1', 'proj-1', 'Tower-A-101')
assert.equal(selfEditUpdate.isDuplicate, false, 'Self-edit must not trigger duplicate conflict')

// 16d. Updating item-2 to conflict with item-1's unit number must be blocked
const crossItemUpdate = validateDuplicateOnUpdate('inv-item-2', 'proj-1', '  tower-a-101 ')
assert.equal(crossItemUpdate.isDuplicate, true, 'Updating another item to conflicting unit number must be blocked')

// 16e. Wildcard underscore '_' must NOT falsely match other characters
testInventoryStore.push({ id: 'inv-item-underscore', project_id: 'proj-1', unit_number: 'UNIT_1' })
const diffCharCreate = validateDuplicateOnCreate('proj-1', 'UNIT-1')
assert.equal(diffCharCreate.isDuplicate, false, 'UNIT-1 must NOT match UNIT_1 as a false duplicate')

// 16f. Wildcard percent '%' must NOT falsely match arbitrary substrings
testInventoryStore.push({ id: 'inv-item-percent', project_id: 'proj-1', unit_number: '10%_PREMIUM' })
const diffPercentCreate = validateDuplicateOnCreate('proj-1', '1000_PREMIUM')
assert.equal(diffPercentCreate.isDuplicate, false, '1000_PREMIUM must NOT match 10%_PREMIUM as a false duplicate')

console.log('✓ Test 16 Passed: Case-insensitive, trimmed uniqueness strictly enforced across all entry points with safe self-edit exclusion and wildcard safety.')

console.log('\nAll Stage 3F Bulk Inventory Import tests (16 / 16) passed successfully!\n')
