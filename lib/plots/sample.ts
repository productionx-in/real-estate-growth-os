// lib/plots/sample.ts — a made-up 40-plot layout (two blocks, roads, a park) for the design gallery and tests.
// Fictional data only.
import type { LayoutGeometry, PlotInfo } from '@/lib/dal/plot-layouts'
import type { LayoutShape } from '@/lib/plots/svg'

export function sampleLayout(): { viewBox: string; geometry: LayoutGeometry; plots: Record<string, PlotInfo> } {
  const shapes: LayoutShape[] = [
    { key: null, kind: 'rect', attrs: { x: '0', y: '0', width: '1000', height: '640' }, fill: '#eef2e8' },
    { key: null, kind: 'rect', attrs: { x: '0', y: '300', width: '1000', height: '40' }, fill: '#c9ccd1' },
    { key: null, kind: 'rect', attrs: { x: '480', y: '0', width: '40', height: '640' }, fill: '#c9ccd1' },
    { key: null, kind: 'rect', attrs: { x: '540', y: '360', width: '200', height: '260', rx: '12' }, fill: '#b7d7a8' },
  ]
  const labels = [{ x: 600, y: 495, text: 'PARK', size: 22 }, { x: 40, y: 326, text: 'MAIN ROAD 40 FT', size: 14 }]
  const plots: Record<string, PlotInfo> = {}
  const statuses = ['available', 'available', 'booked', 'available', 'sold', 'on_hold', 'available', 'available', 'blocked', 'available']
  let n = 1
  const block = (x0: number, y0: number, cols: number, rows: number, prefix: string) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const key = `${prefix}${n}`
      const x = x0 + c * 92, y = y0 + r * 130
      shapes.push({ key, kind: 'rect', attrs: { x: String(x), y: String(y), width: '84', height: '120' } })
      labels.push({ x: x + 28, y: y + 66, text: key, size: 16 })
      plots[key] = {
        unitId: `sample-${n}`, unitNumber: key, status: statuses[n % statuses.length], category: 'plots',
        area: 1800 + (n % 5) * 200, areaUnit: 'sqft', dimensions: `${30 + (n % 3) * 5} × ${60} ft`, facing: ['East', 'North', 'West', 'South'][n % 4],
        corner: c === 0 || c === cols - 1, roadWidthFt: r === rows - 1 ? 40 : 30, price: (1800 + (n % 5) * 200) * 4200, rate: 4200,
      }
      n++
    }
  }
  block(10, 30, 5, 2, 'N')
  block(530, 30, 5, 2, 'N')
  block(10, 370, 5, 2, 'S')
  block(760, 370, 2, 2, 'S')
  return { viewBox: '0 0 1000 640', geometry: { shapes, labels }, plots }
}
