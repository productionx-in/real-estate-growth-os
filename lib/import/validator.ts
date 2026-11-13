// lib/import/validator.ts
// Row-by-row deep validation engine for inventory bulk imports
import type { ProjectCategory } from '@/types/database'
import type { InventoryItemFormValues } from '@/lib/validations/inventory'

export interface RowValidationError {
  rowNumber: number
  unitNumber: string
  field: string
  message: string
}

export interface RowValidationWarning {
  rowNumber: number
  unitNumber: string
  field: string
  message: string
}

export interface ValidatedImportRow {
  rowNumber: number
  isValid: boolean
  data: InventoryItemFormValues
  errors: RowValidationError[]
  warnings: RowValidationWarning[]
  rawValues: Record<string, unknown>
}

export interface ValidationSummary {
  totalRows: number
  validRowsCount: number
  invalidRowsCount: number
  duplicateInFileCount: number
  duplicateInProjectCount: number
  rows: ValidatedImportRow[]
  allErrors: RowValidationError[]
  allWarnings: RowValidationWarning[]
}

const ALLOWED_AREA_UNITS = ['sqft', 'sqyd', 'acres', 'guntas', 'cents'] as const
const ALLOWED_FACINGS = [
  'East',
  'West',
  'North',
  'South',
  'North-East',
  'North-West',
  'South-East',
  'South-West',
]

const ALLOWED_COMMERCIAL_TYPES = [
  'Office Suite',
  'Retail Shop',
  'Showroom',
  'Warehouse',
  'Bare Shell',
  'Other',
]

/**
 * Validates raw mapped rows against business rules, database schema, and project context.
 */
export function validateImportRows({
  rawRows,
  columnMapping,
  projectCategory,
  projectId,
  existingUnitNumbers = new Set<string>(),
}: {
  rawRows: Record<string, unknown>[]
  columnMapping: Record<string, string> // spreadsheetHeader -> canonicalKey
  projectCategory: ProjectCategory
  projectId: string
  existingUnitNumbers?: Set<string>
}): ValidationSummary {
  const fileSeenUnits = new Set<string>()
  const rows: ValidatedImportRow[] = []
  const allErrors: RowValidationError[] = []
  const allWarnings: RowValidationWarning[] = []

  let validRowsCount = 0
  let invalidRowsCount = 0
  let duplicateInFileCount = 0
  let duplicateInProjectCount = 0

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 1
    const errors: RowValidationError[] = []
    const warnings: RowValidationWarning[] = []

    // Map spreadsheet row to canonical fields
    const mapped: Record<string, unknown> = {}
    const unmapped: Record<string, unknown> = {}

    for (const [header, val] of Object.entries(rawRow)) {
      const canonicalKey = columnMapping[header]
      if (canonicalKey && canonicalKey !== 'ignore') {
        mapped[canonicalKey] = val
      } else {
        // Collect unmapped column into custom attributes if non-empty
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          unmapped[header] = val
        }
      }
    }

    // 1. Validate Unit Number
    const rawUnit = String(mapped.unit_number || '').trim()
    if (!rawUnit) {
      errors.push({
        rowNumber,
        unitNumber: '—',
        field: 'unit_number',
        message: 'Unit / Plot number is required.',
      })
    } else if (rawUnit.length > 50) {
      errors.push({
        rowNumber,
        unitNumber: rawUnit,
        field: 'unit_number',
        message: 'Unit number exceeds maximum length of 50 characters.',
      })
    }

    // Duplicate detection in file
    const unitLower = rawUnit.toLowerCase()
    if (unitLower) {
      if (fileSeenUnits.has(unitLower)) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'unit_number',
          message: `Duplicate unit number '${rawUnit}' appears multiple times in this file.`,
        })
        duplicateInFileCount++
      } else {
        fileSeenUnits.add(unitLower)
      }

      // Duplicate detection in project
      if (existingUnitNumbers.has(unitLower)) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'unit_number',
          message: `Unit number '${rawUnit}' already exists in this project.`,
        })
        duplicateInProjectCount++
      }
    }

    // 2. Validate Category
    let rowCategory: ProjectCategory = projectCategory
    if (projectCategory === 'mixed_use') {
      const rawCat = String(mapped.category || '')
        .trim()
        .toLowerCase()
      const validMixedCategories: ProjectCategory[] = [
        'apartments',
        'plotted_developments',
        'commercial_sale',
        'villas_gated_communities',
      ]
      if (!rawCat) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'category',
          message:
            'Mixed-use projects require component category: apartments, plotted_developments, commercial_sale, or villas_gated_communities.',
        })
      } else if (!validMixedCategories.includes(rawCat as ProjectCategory)) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'category',
          message: `Invalid category '${rawCat}'. Allowed: ${validMixedCategories.join(', ')}.`,
        })
      } else {
        rowCategory = rawCat as ProjectCategory
      }
    } else {
      if (mapped.category) {
        const rawCat = String(mapped.category).trim().toLowerCase()
        if (rawCat !== projectCategory) {
          errors.push({
            rowNumber,
            unitNumber: rawUnit,
            field: 'category',
            message: `Row category '${rawCat}' does not match project category '${projectCategory}'.`,
          })
        }
      }
    }

    // 3. Validate Area Value & Unit
    let areaValue = 0
    if (mapped.area_value === undefined || mapped.area_value === null || String(mapped.area_value).trim() === '') {
      errors.push({
        rowNumber,
        unitNumber: rawUnit,
        field: 'area_value',
        message: 'Primary area measurement is required.',
      })
    } else {
      const num = parseFloat(String(mapped.area_value).replace(/,/g, ''))
      if (isNaN(num) || num <= 0) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'area_value',
          message: 'Area value must be a positive number.',
        })
      } else {
        areaValue = num
      }
    }

    let areaUnit: (typeof ALLOWED_AREA_UNITS)[number] = 'sqft'
    if (mapped.area_unit) {
      const unit = String(mapped.area_unit).trim().toLowerCase()
      if (!ALLOWED_AREA_UNITS.includes(unit as (typeof ALLOWED_AREA_UNITS)[number])) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'area_unit',
          message: `Invalid area unit '${unit}'. Allowed: ${ALLOWED_AREA_UNITS.join(', ')}.`,
        })
      } else {
        areaUnit = unit as (typeof ALLOWED_AREA_UNITS)[number]
      }
    } else {
      // Default area unit based on category
      areaUnit = rowCategory === 'plotted_developments' ? 'sqyd' : 'sqft'
    }

    // 4. Validate Secondary Areas
    const parseOptionalNumber = (val: unknown, field: string): number | undefined => {
      if (val === undefined || val === null || String(val).trim() === '') return undefined
      const n = parseFloat(String(val).replace(/,/g, ''))
      if (isNaN(n) || n < 0) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field,
          message: `${field} must be a valid positive number.`,
        })
        return undefined
      }
      return n
    }

    const parseOptionalInt = (val: unknown, field: string): number | undefined => {
      if (val === undefined || val === null || String(val).trim() === '') return undefined
      const n = parseInt(String(val).trim(), 10)
      if (isNaN(n) || n < 0) {
        errors.push({
          rowNumber,
          unitNumber: rawUnit,
          field,
          message: `${field} must be a valid non-negative integer.`,
        })
        return undefined
      }
      return n
    }

    const carpetArea = parseOptionalNumber(mapped.carpet_area, 'carpet_area')
    const builtUpArea = parseOptionalNumber(mapped.built_up_area, 'built_up_area')
    const superBuiltUpArea = parseOptionalNumber(mapped.super_built_up_area, 'super_built_up_area')
    const plotArea = parseOptionalNumber(mapped.plot_area, 'plot_area')
    const roadWidthFt = parseOptionalNumber(mapped.road_width_ft, 'road_width_ft')
    const floorNumber = parseOptionalInt(mapped.floor_number, 'floor_number')
    const bedrooms = parseOptionalInt(mapped.bedrooms, 'bedrooms')
    const bathrooms = parseOptionalInt(mapped.bathrooms, 'bathrooms')
    const balconies = parseOptionalInt(mapped.balconies, 'balconies')
    const parkingSpaces = parseOptionalInt(mapped.parking_spaces, 'parking_spaces')
    const baseRate = parseOptionalNumber(mapped.base_rate, 'base_rate')
    const totalPrice = parseOptionalNumber(mapped.total_price, 'total_price')

    // 5. Validate Facing
    let facing: string | undefined = undefined
    if (mapped.facing) {
      const f = String(mapped.facing).trim()
      const match = ALLOWED_FACINGS.find((af) => af.toLowerCase() === f.toLowerCase())
      if (match) {
        facing = match
      } else {
        warnings.push({
          rowNumber,
          unitNumber: rawUnit,
          field: 'facing',
          message: `Unrecognized facing '${f}'. Saved as custom orientation.`,
        })
        facing = f
      }
    }

    // 6. Plotted specs: is_corner_plot
    let isCornerPlot = false
    if (mapped.is_corner_plot !== undefined) {
      const c = String(mapped.is_corner_plot).trim().toLowerCase()
      if (['yes', 'true', '1', 'y'].includes(c)) {
        isCornerPlot = true
      }
    }

    // 7. Commercial specs: asset type
    let commercialAssetType: string | undefined = undefined
    if (mapped.commercial_asset_type) {
      const at = String(mapped.commercial_asset_type).trim()
      const match = ALLOWED_COMMERCIAL_TYPES.find((t) => t.toLowerCase() === at.toLowerCase())
      commercialAssetType = match || at
    }

    // 8. Custom Attributes from unmapped columns
    let customAttributes: Record<string, unknown> | undefined = undefined
    const unmappedKeys = Object.keys(unmapped)
    if (unmappedKeys.length > 0) {
      const attrObj: Record<string, unknown> = {}
      for (const k of unmappedKeys.slice(0, 20)) {
        // Limit each attribute value length
        const rawV = String(unmapped[k])
        attrObj[k] = rawV.length > 500 ? rawV.slice(0, 500) : rawV
      }
      customAttributes = attrObj
      warnings.push({
        rowNumber,
        unitNumber: rawUnit,
        field: 'custom_attributes',
        message: `${unmappedKeys.length} unmapped column(s) preserved in custom attributes.`,
      })
    }

    // Construct valid FormValues object
    const rawStatus = mapped.status ? String(mapped.status).trim().toLowerCase() : 'available'
    const status = ['available', 'on_hold', 'booked', 'sold', 'blocked'].includes(rawStatus)
      ? (rawStatus as 'available' | 'on_hold' | 'booked' | 'sold' | 'blocked')
      : 'available'

    const validatedData: InventoryItemFormValues = {
      project_id: projectId,
      unit_number: rawUnit,
      category: rowCategory,
      status: status,
      area_value: areaValue,
      area_unit: areaUnit,
      carpet_area: carpetArea,
      built_up_area: builtUpArea,
      super_built_up_area: superBuiltUpArea,
      plot_area: plotArea,
      plot_dimensions: mapped.plot_dimensions ? String(mapped.plot_dimensions).trim() : undefined,
      road_width_ft: roadWidthFt,
      is_corner_plot: isCornerPlot,
      facing: facing,
      bhk_config: mapped.bhk_config ? String(mapped.bhk_config).trim() : undefined,
      floor_number: floorNumber,
      tower_name: mapped.tower_name ? String(mapped.tower_name).trim() : undefined,
      commercial_asset_type: commercialAssetType,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      balconies: balconies,
      parking_spaces: parkingSpaces ?? 0,
      furnishing_status: mapped.furnishing_status
        ? String(mapped.furnishing_status).trim().toLowerCase()
        : 'unfurnished',
      base_rate: baseRate,
      total_price: totalPrice,
      pricing_breakup: {},
      internal_notes: mapped.internal_notes ? String(mapped.internal_notes).trim() : undefined,
      custom_attributes: customAttributes || {},
    }

    const isValid = errors.length === 0
    if (isValid) {
      validRowsCount++
    } else {
      invalidRowsCount++
    }

    allErrors.push(...errors)
    allWarnings.push(...warnings)

    rows.push({
      rowNumber,
      isValid,
      data: validatedData,
      errors,
      warnings,
      rawValues: rawRow,
    })
  })

  return {
    totalRows: rawRows.length,
    validRowsCount,
    invalidRowsCount,
    duplicateInFileCount,
    duplicateInProjectCount,
    rows,
    allErrors,
    allWarnings,
  }
}
