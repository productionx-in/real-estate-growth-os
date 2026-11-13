// app/api/inventory/import/template/route.ts
// Downloadable category-specific CSV and XLSX templates
import { NextResponse, type NextRequest } from 'next/server'
import { generateCsvTemplate, generateXlsxTemplate } from '@/lib/import/templates'
import type { ProjectCategory } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = (searchParams.get('category') as ProjectCategory) || 'apartments'
    const format = (searchParams.get('format') || 'csv').toLowerCase()

    if (format === 'xlsx') {
      const buffer = generateXlsxTemplate(category)
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${category}_inventory_template.xlsx"`,
        },
      })
    }

    const csvContent = generateCsvTemplate(category)
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${category}_inventory_template.csv"`,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate template'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
