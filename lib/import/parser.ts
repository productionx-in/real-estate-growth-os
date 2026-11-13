// lib/import/parser.ts
// Spreadsheet file reader, formula injection sanitizer, and column normalizer
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_IMPORT_ROWS = 5000

export interface ParsedSpreadsheet {
  fileName: string
  fileType: 'csv' | 'xlsx'
  headers: string[]
  rawRows: Record<string, unknown>[]
  totalRows: number
  warnings: string[]
}

/**
 * Formula injection protection (CSV / Spreadsheet Injection)
 * Prevents Excel/Calc from executing DDE formulas when viewing error reports or exports.
 */
export function sanitizeFormulaInjection(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '') return value
  // Legitimate negative numeric values (e.g. basement floor "-1", "-2.5") are safe numbers, not formulas
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return value
  }
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r']
  if (dangerousPrefixes.some((p) => value.startsWith(p))) {
    return `'${value}`
  }
  return value
}

/**
 * Standard column header alias mapping
 */
export const HEADER_ALIASES: Record<string, string> = {
  // Unit number
  unit_number: 'unit_number',
  'unit number': 'unit_number',
  'unit number*': 'unit_number',
  'unit #': 'unit_number',
  'unit no': 'unit_number',
  'flat no': 'unit_number',
  'plot number': 'unit_number',
  'plot number*': 'unit_number',
  'plot #': 'unit_number',
  'plot no': 'unit_number',
  'commercial unit number': 'unit_number',
  'commercial unit number*': 'unit_number',
  'villa number': 'unit_number',
  'villa number*': 'unit_number',
  'villa #': 'unit_number',
  'inventory number': 'unit_number',
  'inventory number*': 'unit_number',

  // Hierarchy grouping / tower / block / building / cluster
  tower_name: 'tower_name',
  tower: 'tower_name',
  'tower / block': 'tower_name',
  'block / sector': 'tower_name',
  block: 'tower_name',
  sector: 'tower_name',
  building: 'tower_name',
  'building / wing': 'tower_name',
  'building / tower / block': 'tower_name',
  wing: 'tower_name',
  cluster: 'tower_name',
  'cluster / street': 'tower_name',
  street: 'tower_name',
  phase: 'tower_name',

  // Floor
  floor_number: 'floor_number',
  floor: 'floor_number',
  'floor no': 'floor_number',
  'number of floors': 'floor_number',

  // Configuration
  bhk_config: 'bhk_config',
  bhk: 'bhk_config',
  configuration: 'bhk_config',
  typology: 'bhk_config',
  'config / typology': 'bhk_config',

  // Area
  area_value: 'area_value',
  'saleable area': 'area_value',
  'saleable area*': 'area_value',
  'plot area': 'area_value',
  'plot area*': 'area_value',
  'built-up area': 'area_value',
  'built-up area*': 'area_value',
  'primary area': 'area_value',
  'primary area*': 'area_value',
  area: 'area_value',
  'carpet area': 'carpet_area',
  carpet_area: 'carpet_area',
  'super built-up area': 'super_built_up_area',
  super_built_up_area: 'super_built_up_area',
  plot_area: 'plot_area',
  'plot extent (sqyd)': 'plot_area',

  // Area unit
  area_unit: 'area_unit',
  'area unit': 'area_unit',
  'area unit*': 'area_unit',
  uom: 'area_unit',

  // Plotted specs
  plot_dimensions: 'plot_dimensions',
  'plot dimensions': 'plot_dimensions',
  dimensions: 'plot_dimensions',
  road_width_ft: 'road_width_ft',
  'road width': 'road_width_ft',
  'road width (ft)': 'road_width_ft',
  is_corner_plot: 'is_corner_plot',
  'corner plot': 'is_corner_plot',
  corner: 'is_corner_plot',

  // Commercial specs
  commercial_asset_type: 'commercial_asset_type',
  'asset type': 'commercial_asset_type',
  'commercial asset type': 'commercial_asset_type',

  // Rooms & specs
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  balconies: 'balconies',
  parking_spaces: 'parking_spaces',
  parking: 'parking_spaces',
  'parking spaces': 'parking_spaces',
  'private parking': 'parking_spaces',
  furnishing_status: 'furnishing_status',
  furnishing: 'furnishing_status',
  'handover state': 'furnishing_status',
  facing: 'facing',
  orientation: 'facing',

  // Pricing
  base_rate: 'base_rate',
  'base rate': 'base_rate',
  'base rate (₹)': 'base_rate',
  rate: 'base_rate',
  total_price: 'total_price',
  'total price': 'total_price',
  'total price (₹)': 'total_price',
  price: 'total_price',
  cost: 'total_price',

  // Category
  category: 'category',
  'component category': 'category',
  'component category*': 'category',

  // Notes
  internal_notes: 'internal_notes',
  notes: 'internal_notes',
  remarks: 'internal_notes',
  'internal notes': 'internal_notes',
}

/**
 * Normalizes a header to canonical inventory key if matching alias exists
 */
export function normalizeHeader(header: string): string | null {
  const clean = header.trim().toLowerCase().replace(/[\r\n]/g, '')
  return HEADER_ALIASES[clean] || null
}

/**
 * Parse CSV text safely with PapaParse
 */
export function parseCsvContent(content: string, fileName = 'upload.csv'): ParsedSpreadsheet {
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })

  if (result.errors && result.errors.length > 0) {
    const criticalError = result.errors.find((e) => e.type === 'Delimiter')
    if (criticalError) {
      throw new Error(`CSV parsing error: ${criticalError.message}`)
    }
  }

  const rawRows = result.data.filter((row) => {
    // Filter out completely empty rows
    return Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== '')
  })

  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`File contains ${rawRows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS} rows.`)
  }

  return {
    fileName,
    fileType: 'csv',
    headers: result.meta.fields || [],
    rawRows,
    totalRows: rawRows.length,
    warnings: [],
  }
}

/**
 * Parse XLSX ArrayBuffer / Uint8Array safely with XLSX
 */
export function parseXlsxBuffer(buffer: ArrayBuffer | Uint8Array, fileName = 'upload.xlsx'): ParsedSpreadsheet {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellText: false })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('Spreadsheet does not contain any sheets.')
  }

  const ws = wb.Sheets[firstSheetName]
  if (!ws) {
    throw new Error('Could not read worksheet data.')
  }

  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  })

  const rawRows = rawData.filter((row) => {
    // Discard template description row if user left it in
    const vals = Object.values(row).map((v) => String(v).trim())
    const isDescriptionRow = vals.some((v) => v.startsWith('[REQUIRED]') || v.startsWith('[OPTIONAL]'))
    if (isDescriptionRow) return false

    return vals.some((v) => v !== '')
  })

  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`File contains ${rawRows.length} rows, which exceeds the limit of ${MAX_IMPORT_ROWS} rows.`)
  }

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

  return {
    fileName,
    fileType: 'xlsx',
    headers,
    rawRows,
    totalRows: rawRows.length,
    warnings: [],
  }
}
