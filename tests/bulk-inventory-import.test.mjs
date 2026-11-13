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

console.log('\nAll Stage 3F Bulk Inventory Import tests passed successfully!\n')
