// lib/import/templates.ts
// Category-specific inventory import templates (CSV and XLSX)
import * as XLSX from 'xlsx'
import type { ProjectCategory } from '@/types/database'

export interface ColumnDefinition {
  key: string
  label: string
  required: boolean
  description: string
  example: string
}

export const CATEGORY_COLUMNS: Record<ProjectCategory, ColumnDefinition[]> = {
  apartments: [
    { key: 'unit_number', label: 'Unit Number*', required: true, description: 'Unique flat or apartment identifier (e.g. A-401)', example: 'A-401' },
    { key: 'tower_name', label: 'Tower', required: false, description: 'Tower or Block name', example: 'Tower A' },
    { key: 'floor_number', label: 'Floor', required: false, description: 'Floor number (0 for Ground)', example: '4' },
    { key: 'bhk_config', label: 'BHK', required: false, description: 'Configuration (e.g. 2 BHK, 3 BHK, 4 BHK)', example: '3 BHK' },
    { key: 'bedrooms', label: 'Bedrooms', required: false, description: 'Number of bedrooms', example: '3' },
    { key: 'bathrooms', label: 'Bathrooms', required: false, description: 'Number of bathrooms', example: '3' },
    { key: 'balconies', label: 'Balconies', required: false, description: 'Number of balconies', example: '2' },
    { key: 'area_value', label: 'Saleable Area*', required: true, description: 'Primary saleable area value', example: '1650' },
    { key: 'area_unit', label: 'Area Unit*', required: true, description: 'sqft, sqyd, acres, guntas, cents', example: 'sqft' },
    { key: 'carpet_area', label: 'Carpet Area', required: false, description: 'Net usable floor area in sqft', example: '1250' },
    { key: 'built_up_area', label: 'Built-up Area', required: false, description: 'Built-up area in sqft', example: '1450' },
    { key: 'super_built_up_area', label: 'Super Built-up Area', required: false, description: 'Super built-up area in sqft', example: '1650' },
    { key: 'facing', label: 'Facing', required: false, description: 'East, West, North, South, North-East, etc.', example: 'East' },
    { key: 'parking_spaces', label: 'Parking Spaces', required: false, description: 'Allocated parking slots', example: '2' },
    { key: 'furnishing_status', label: 'Furnishing', required: false, description: 'unfurnished, semi_furnished, fully_furnished', example: 'semi_furnished' },
    { key: 'base_rate', label: 'Base Rate (₹)', required: false, description: 'Rate per sqft', example: '6500' },
    { key: 'total_price', label: 'Total Price (₹)', required: false, description: 'Total all-inclusive price', example: '10725000' },
    { key: 'internal_notes', label: 'Internal Notes', required: false, description: 'Restricted remarks for sales team', example: 'Prime garden facing unit' },
  ],
  plotted_developments: [
    { key: 'unit_number', label: 'Plot Number*', required: true, description: 'Unique plot number (e.g. Plot 42)', example: 'Plot 42' },
    { key: 'phase', label: 'Phase', required: false, description: 'Development phase', example: 'Phase 1' },
    { key: 'tower_name', label: 'Block / Sector', required: false, description: 'Block or sector identifier', example: 'Block B' },
    { key: 'plot_dimensions', label: 'Plot Dimensions', required: false, description: 'Length x Breadth (e.g. 30x50)', example: '30x50' },
    { key: 'area_value', label: 'Plot Area*', required: true, description: 'Area measurement', example: '200' },
    { key: 'area_unit', label: 'Area Unit*', required: true, description: 'sqyd, cents, guntas, acres, sqft', example: 'sqyd' },
    { key: 'road_width_ft', label: 'Road Width (ft)', required: false, description: 'Width of road fronting the plot', example: '40' },
    { key: 'is_corner_plot', label: 'Corner Plot', required: false, description: 'yes / no or true / false', example: 'yes' },
    { key: 'facing', label: 'Facing', required: false, description: 'East, West, North, South, North-East, etc.', example: 'East' },
    { key: 'base_rate', label: 'Base Rate (₹)', required: false, description: 'Rate per sqyd or unit', example: '35000' },
    { key: 'total_price', label: 'Total Price (₹)', required: false, description: 'Total sale price', example: '7000000' },
    { key: 'internal_notes', label: 'Internal Notes', required: false, description: 'Restricted sales notes', example: 'North-East corner premium plot' },
  ],
  commercial_sale: [
    { key: 'unit_number', label: 'Commercial Unit Number*', required: true, description: 'Unit, suite or shop number (e.g. Shop G-04)', example: 'Shop G-04' },
    { key: 'tower_name', label: 'Building / Wing', required: false, description: 'Building or wing name', example: 'Tower 1' },
    { key: 'floor_number', label: 'Floor', required: false, description: 'Floor number (0 for Ground)', example: '0' },
    { key: 'commercial_asset_type', label: 'Asset Type', required: false, description: 'Office Suite, Retail Shop, Showroom, Warehouse, Bare Shell', example: 'Retail Shop' },
    { key: 'area_value', label: 'Saleable Area*', required: true, description: 'Saleable area measurement', example: '850' },
    { key: 'area_unit', label: 'Area Unit*', required: true, description: 'sqft, sqyd', example: 'sqft' },
    { key: 'carpet_area', label: 'Carpet Area', required: false, description: 'Usable area in sqft', example: '700' },
    { key: 'super_built_up_area', label: 'Super Built-up Area', required: false, description: 'Super built-up area in sqft', example: '850' },
    { key: 'parking_spaces', label: 'Parking Spaces', required: false, description: 'Allocated parking slots', example: '1' },
    { key: 'furnishing_status', label: 'Handover State', required: false, description: 'bare_shell, warm_shell, fully_furnished', example: 'bare_shell' },
    { key: 'base_rate', label: 'Base Rate (₹)', required: false, description: 'Base rate per sqft', example: '12000' },
    { key: 'total_price', label: 'Total Price (₹)', required: false, description: 'Total price', example: '10200000' },
    { key: 'internal_notes', label: 'Internal Notes', required: false, description: 'Sales team remarks', example: 'Prime high-street frontage' },
  ],
  villas_gated_communities: [
    { key: 'unit_number', label: 'Villa Number*', required: true, description: 'Unique villa number (e.g. Villa 12)', example: 'Villa 12' },
    { key: 'phase', label: 'Phase', required: false, description: 'Phase number or name', example: 'Phase 1' },
    { key: 'tower_name', label: 'Cluster / Street', required: false, description: 'Cluster or street name', example: 'Palm Street' },
    { key: 'bhk_config', label: 'Typology', required: false, description: 'e.g. 4 BHK Triplex, 5 BHK Luxury', example: '4 BHK Triplex' },
    { key: 'area_value', label: 'Built-up Area*', required: true, description: 'Total built-up area measurement', example: '3200' },
    { key: 'area_unit', label: 'Area Unit*', required: true, description: 'sqft, sqyd', example: 'sqft' },
    { key: 'plot_area', label: 'Plot Extent (sqyd)', required: false, description: 'Plot area in sqyd', example: '250' },
    { key: 'bedrooms', label: 'Bedrooms', required: false, description: 'Number of bedrooms', example: '4' },
    { key: 'bathrooms', label: 'Bathrooms', required: false, description: 'Number of bathrooms', example: '4' },
    { key: 'parking_spaces', label: 'Private Parking', required: false, description: 'Private garage / parking slots', example: '2' },
    { key: 'facing', label: 'Facing', required: false, description: 'East, West, North, South, etc.', example: 'East' },
    { key: 'base_rate', label: 'Base Rate (₹)', required: false, description: 'Base rate per sqft or sqyd', example: '7500' },
    { key: 'total_price', label: 'Total Price (₹)', required: false, description: 'Total villa cost', example: '24000000' },
    { key: 'internal_notes', label: 'Internal Notes', required: false, description: 'Internal team notes', example: 'Includes private splash pool option' },
  ],
  mixed_use: [
    { key: 'unit_number', label: 'Inventory Number*', required: true, description: 'Unique unit / plot / shop number', example: 'RET-101' },
    { key: 'category', label: 'Component Category*', required: true, description: 'apartments, commercial_sale, plotted_developments, villas_gated_communities', example: 'commercial_sale' },
    { key: 'tower_name', label: 'Building / Tower / Block', required: false, description: 'Hierarchy grouping', example: 'Retail Arcade' },
    { key: 'floor_number', label: 'Floor', required: false, description: 'Floor number', example: '1' },
    { key: 'bhk_config', label: 'Config / Typology', required: false, description: 'BHK or villa typology if applicable', example: '' },
    { key: 'commercial_asset_type', label: 'Commercial Asset Type', required: false, description: 'If commercial unit (e.g. Retail Shop)', example: 'Retail Shop' },
    { key: 'area_value', label: 'Primary Area*', required: true, description: 'Area measurement', example: '1200' },
    { key: 'area_unit', label: 'Area Unit*', required: true, description: 'sqft, sqyd, acres, guntas, cents', example: 'sqft' },
    { key: 'facing', label: 'Facing', required: false, description: 'East, West, North, South, etc.', example: 'North' },
    { key: 'total_price', label: 'Total Price (₹)', required: false, description: 'Total price', example: '14400000' },
    { key: 'internal_notes', label: 'Internal Notes', required: false, description: 'Team remarks', example: 'Anchor store adjacent' },
  ],
}

/**
 * Generate CSV template string for a category
 */
export function generateCsvTemplate(category: ProjectCategory): string {
  const columns = CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.apartments
  const headers = columns.map((c) => c.label).join(',')
  const sampleRow = columns.map((c) => (c.example.includes(',') ? `"${c.example}"` : c.example)).join(',')
  return `${headers}\n${sampleRow}\n`
}

/**
 * Generate XLSX template buffer for a category
 */
export function generateXlsxTemplate(category: ProjectCategory): Uint8Array {
  const columns = CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.apartments
  const headerRow = columns.map((c) => c.label)
  const sampleRow = columns.map((c) => c.example)
  const descriptionRow = columns.map((c) => (c.required ? `[REQUIRED] ${c.description}` : `[OPTIONAL] ${c.description}`))

  const data = [headerRow, sampleRow, descriptionRow]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths nicely
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length, c.example.length, 15) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new Uint8Array(buf)
}
