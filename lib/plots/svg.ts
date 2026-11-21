// lib/plots/svg.ts — turns an uploaded layout SVG (exported from AutoCAD, Illustrator or Inkscape from the builder's
// blueprint) into plain geometry data. The SVG itself is never stored or rendered: only numbers and a whitelisted
// set of shapes survive, and components/plots/PlotMap.tsx draws them as React elements. So nothing in an uploaded
// file — scripts, event handlers, external links, styles, foreignObject, entities — can reach a browser.
//
// A plot is any shape whose id (or data-name / inkscape:label) names it with a plot number, e.g. id="N46" or
// id="Plot-12", or the only shape in a group so named. Shapes with no plot number are kept as the background (roads, parks, boundary) and are not clickable. <text> is kept as plain labels.

export type ShapeKind = 'path' | 'polygon' | 'polyline' | 'rect' | 'circle' | 'ellipse' | 'line'

export interface LayoutShape {
  /** The plot's name from the drawing (null for background shapes). */
  key: string | null
  kind: ShapeKind
  /** Geometry only: numbers and path data, validated. */
  attrs: Record<string, string>
  /** Composed transforms of the shape and every group around it (validated). */
  transform?: string
  /** Background colour from the drawing (hex only), so parks look green and roads grey. Plots are coloured by status. */
  fill?: string
}

export interface LayoutLabel { x: number; y: number; text: string; size?: number; transform?: string }

export interface ParsedLayout {
  viewBox: string
  shapes: LayoutShape[]
  labels: LayoutLabel[]
  /** Plot names found, in drawing order. */
  keys: string[]
  warnings: string[]
}

export class LayoutError extends Error {}

export const LIMITS = { bytes: 3_000_000, elements: 8_000, plots: 3_000, labels: 4_000, pathChars: 200_000 }

const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/
const POINTS = /^[0-9eE.,+\-\s]*$/
const TRANSFORM = /^\s*(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9eE.,\s]*\)\s*,?\s*)+$/
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const GEOMETRY: Record<ShapeKind, string[]> = {
  path: ['d'],
  polygon: ['points'],
  polyline: ['points'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
}

/** "N46", " n 46 ", "N-46", "N46_1_" (Illustrator's duplicate suffix) → "N46" for matching; display keeps the original. */
export function normaliseKey(raw: string): string {
  return raw.trim().replace(/_\d+_$/, '').replace(/[\s_\-./]+/g, '').toUpperCase()
}

/** A plot name from an element's attributes, or null. Generic tool names ("path123", "Layer_1", "g12") are not plots. */
function plotName(a: Record<string, string>): string | null {
  const raw = a['data-name'] ?? a['inkscape:label'] ?? a.id
  if (!raw) return null
  const name = raw.trim().replace(/_\d+_$/, '')
  if (!name || name.length > 40) return null
  if (/^(path|rect|polygon|polyline|circle|ellipse|line|g|group|layer|svg|text|tspan|use|defs|clip|mask|image)[-_ ]?\d*$/i.test(name)) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _\-./]*$/u.test(name)) return null
  // A plot number always has a digit; layer names such as "Plots", "Roads" or "Park" are not plots.
  if (!/\d/.test(name)) return null
  return name
}

/** Decode the five XML entities and numeric references; anything else (custom entities) is refused upstream. */
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  for (let m = re.exec(src); m; m = re.exec(src)) out[m[1]] = decode(m[3] ?? m[4] ?? '')
  return out
}

function numberAttr(v: string | undefined): string | null {
  if (v === undefined) return null
  const t = v.trim().replace(/px$/, '')
  return NUM.test(t) ? t : null
}

/** Inline style can carry the fill: style="fill:#7ab55c;stroke:none". Only a hex colour is kept. */
function fillOf(a: Record<string, string>): string | undefined {
  const fromStyle = /(?:^|;)\s*fill\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(a.style ?? '')?.[1]
  const f = (a.fill ?? fromStyle ?? '').trim()
  return HEX.test(f) ? f.toLowerCase() : undefined
}

export function parseLayoutSvg(svg: string): ParsedLayout {
  if (typeof svg !== 'string' || !svg.trim()) throw new LayoutError('The file is empty.')
  if (new TextEncoder().encode(svg).length > LIMITS.bytes) throw new LayoutError('The layout file is larger than 3 MB. Simplify the drawing (remove hatching and dimension lines) and export again.')
  // Entity declarations are how "billion laughs" and external-entity attacks work; a layout never needs them.
  if (/<!ENTITY/i.test(svg)) throw new LayoutError('The file declares XML entities, which are not allowed. Export it again as a plain SVG.')
  const body = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')

  const warnings = new Set<string>()
  const shapes: LayoutShape[] = []
  const labels: LayoutLabel[] = []
  const keys: string[] = []
  const seen = new Set<string>()
  let viewBox: string | null = null
  let elements = 0
  // Stack of open elements: transforms compose from the outside in; anything inside a skipped element is skipped.
  const stack: { tag: string; transform: string; skip: boolean; name: string | null }[] = []
  let text: { x: number; y: number; size?: number; transform?: string; parts: string[] } | null = null

  const tagRe = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  for (let m = tagRe.exec(body); m; m = tagRe.exec(body)) {
    if (m[5] !== undefined) { // text between tags
      if (text && !stack.some((s) => s.skip)) text.parts.push(decode(m[5]))
      continue
    }
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase().replace(/^svg:/, '')
    const selfClosing = m[4] === '/'
    if (closing) {
      if (tag === 'text' && text) {
        const t = text.parts.join('').replace(/\s+/g, ' ').trim().slice(0, 40)
        if (t && labels.length < LIMITS.labels) labels.push({ x: text.x, y: text.y, text: t, ...(text.size ? { size: text.size } : {}), ...(text.transform ? { transform: text.transform } : {}) })
        text = null
      }
      const i = stack.map((s) => s.tag).lastIndexOf(tag)
      if (i >= 0) stack.length = i
      continue
    }
    if (++elements > LIMITS.elements) throw new LayoutError(`The drawing has more than ${LIMITS.elements} elements. Remove hatching, dimension lines and other detail, then export again.`)
    const a = attrsOf(m[3] ?? '')
    const parentSkip = stack.length > 0 && stack[stack.length - 1].skip
    const parentTransform = stack.length ? stack[stack.length - 1].transform : ''
    const ownTransform = a.transform && TRANSFORM.test(a.transform) ? a.transform.trim() : ''
    if (a.transform && !ownTransform) warnings.add('Some shapes had an unreadable transform and were drawn without it.')
    const transform = [parentTransform, ownTransform].filter(Boolean).join(' ')
    // Never followed: definitions, clip paths, embedded images, scripts, styles, foreign content, links.
    const skip = parentSkip || ['defs', 'clippath', 'mask', 'pattern', 'symbol', 'image', 'script', 'style', 'foreignobject', 'use', 'a', 'metadata', 'title', 'desc', 'marker', 'filter', 'lineargradient', 'radialgradient'].includes(tag)
    const name = skip ? null : plotName(a) ?? (stack.length ? stack[stack.length - 1].name : null)

    if (tag === 'svg' && !viewBox) {
      const vb = (a.viewBox ?? a.viewbox ?? '').trim().split(/[\s,]+/)
      if (vb.length === 4 && vb.every((n) => NUM.test(n)) && Number(vb[2]) > 0 && Number(vb[3]) > 0) viewBox = vb.join(' ')
      else {
        const w = numberAttr(a.width), h = numberAttr(a.height)
        if (w && h && Number(w) > 0 && Number(h) > 0) viewBox = `0 0 ${w} ${h}`
      }
    }

    if (!skip && tag in GEOMETRY) {
      const kind = tag as ShapeKind
      const geo: Record<string, string> = {}
      let ok = true
      for (const k of GEOMETRY[kind]) {
        const v = a[k]
        if (v === undefined) continue
        if (k === 'd') ok = PATH_D.test(v) && v.length <= LIMITS.pathChars
        else if (k === 'points') ok = POINTS.test(v) && v.length <= LIMITS.pathChars
        else ok = numberAttr(v) !== null
        if (!ok) break
        geo[k] = k === 'd' || k === 'points' ? v.replace(/\s+/g, ' ').trim() : numberAttr(v)!
      }
      const required = kind === 'path' ? ['d'] : kind === 'polygon' || kind === 'polyline' ? ['points'] : kind === 'rect' ? ['width', 'height'] : kind === 'circle' ? ['r'] : kind === 'ellipse' ? ['rx', 'ry'] : ['x2', 'y2']
      if (!ok || required.some((k) => !geo[k])) { warnings.add('Some shapes had unreadable geometry and were left out.'); }
      else {
        // A plot is a closed, named shape: the shape's own name, or the name of the group it sits in (one shape per group).
        const ownName = plotName(a)
        let key = kind === 'line' || kind === 'polyline' ? null : ownName ?? name
        if (key) {
          const n = normaliseKey(key)
          if (seen.has(n)) { warnings.add(`"${key}" appears more than once; only the first shape is clickable.`); key = null }
          else if (keys.length >= LIMITS.plots) { warnings.add(`Only the first ${LIMITS.plots} plots are used.`); key = null }
          else { seen.add(n); keys.push(key) }
        }
        const fill = fillOf(a)
        shapes.push({ key, kind, attrs: geo, ...(transform ? { transform } : {}), ...(!key && fill ? { fill } : {}) })
      }
    }

    if (!skip && tag === 'text' && !selfClosing) {
      const x = Number(numberAttr(a.x) ?? '0'), y = Number(numberAttr(a.y) ?? '0')
      const size = Number(numberAttr(a['font-size']) ?? (/font-size\s*:\s*([\d.]+)/.exec(a.style ?? '')?.[1] ?? '')) || undefined
      text = { x, y, ...(size ? { size } : {}), ...(transform ? { transform } : {}), parts: [] }
    }

    if (!selfClosing) stack.push({ tag, transform, skip, name: skip ? null : plotName(a) ?? (stack.length ? stack[stack.length - 1].name : null) })
  }

  if (!viewBox) throw new LayoutError('The file has no size (viewBox). Export it from your drawing tool as SVG with "Responsive" or "Use artboard" turned on.')
  if (!shapes.length) throw new LayoutError('No shapes were found in the file. Make sure the plots are drawn as closed shapes, not as an embedded image.')
  if (!keys.length) warnings.add('No plot names were found: name each plot shape with its plot number (its id or layer name), e.g. "N46".')
  return { viewBox, shapes, labels, keys, warnings: [...warnings] }
}
