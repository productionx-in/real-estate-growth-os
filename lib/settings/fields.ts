// lib/settings/fields.ts — the workspace's own fields on leads ("Fields on records"): what can be defined, and the
// rules a value must follow. Pure, so the settings form, the APIs and the tests share one definition.
// Definitions live in org_settings.fields (20260075); values in leads_all.field_values, keyed by the field's key.
// A key never changes once created, so renaming a field keeps its values; removing a field only archives it.

export const FIELD_TYPES = {
  text: 'Short text',
  number: 'Number',
  choice: 'Dropdown list',
  date: 'Date',
  yesno: 'Yes / No',
} as const
export type FieldType = keyof typeof FIELD_TYPES

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  /** Choices for a dropdown list, in order. */
  options: string[]
  /** Hidden from forms; values are kept and still exported. */
  archived: boolean
}

export type FieldValue = string | number | boolean
export type FieldValues = Record<string, FieldValue>

export const FIELD_LIMITS = { fields: 25, labelLength: 40, options: 40, optionLength: 60, textLength: 200 } as const
const KEY = /^[a-z][a-z0-9_]{0,39}$/

/** "Preferred floor?" → "preferred_floor" */
export function keyFromLabel(label: string): string {
  const k = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  return /^[a-z]/.test(k) ? k : `f_${k}`.slice(0, 36)
}

type Errors = Record<string, string>

/**
 * Checks a list of definitions before it is saved. Fields that existed before keep their key and type (changing
 * the type would make stored values invalid); a field missing from the new list is kept, archived.
 */
export function normaliseFields(input: unknown, previous: FieldDef[]): { value: FieldDef[]; errors: Errors } {
  const errors: Errors = {}
  const list = Array.isArray(input) ? input : []
  const before = new Map(previous.map((f) => [f.key, f]))
  const out: FieldDef[] = []
  const keys = new Set<string>()
  const labels = new Set<string>()
  for (const raw of list) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim() : ''
    if (!label) { errors.label = 'Every field needs a name.'; continue }
    if (label.length > FIELD_LIMITS.labelLength) { errors.label = `Keep field names under ${FIELD_LIMITS.labelLength} characters.`; continue }
    if (labels.has(label.toLowerCase())) { errors.label = `Two fields are called “${label}”.`; continue }
    const old = typeof o.key === 'string' ? before.get(o.key) : undefined
    let key = old?.key
    if (!key) {
      const base = keyFromLabel(label)
      key = base
      for (let n = 2; keys.has(key) || before.has(key); n++) key = `${base}_${n}`
    }
    if (!KEY.test(key) || keys.has(key)) { errors.label = 'Could not name the field; try a different name.'; continue }
    const type: FieldType = old?.type ?? (typeof o.type === 'string' && o.type in FIELD_TYPES ? (o.type as FieldType) : 'text')
    if (old && typeof o.type === 'string' && o.type !== old.type) errors.type = `“${label}” already has values, so its type cannot change. Add a new field instead.`
    let options: string[] = []
    if (type === 'choice') {
      const seen = new Set<string>()
      for (const v of Array.isArray(o.options) ? o.options : []) {
        const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
        if (!s || seen.has(s.toLowerCase())) continue
        if (s.length > FIELD_LIMITS.optionLength) { errors.options = `Keep each choice under ${FIELD_LIMITS.optionLength} characters.`; continue }
        seen.add(s.toLowerCase()); options.push(s)
      }
      if (options.length > FIELD_LIMITS.options) { errors.options = `At most ${FIELD_LIMITS.options} choices per list.`; options = options.slice(0, FIELD_LIMITS.options) }
      if (!options.length) errors.options = `Add at least one choice to “${label}”.`
    }
    keys.add(key); labels.add(label.toLowerCase())
    out.push({ key, label, type, options, archived: o.archived === true })
  }
  // Removed fields are archived, never dropped: their values stay readable and exportable.
  for (const f of previous) if (!keys.has(f.key)) { out.push({ ...f, archived: true }); keys.add(f.key) }
  if (out.filter((f) => !f.archived).length > FIELD_LIMITS.fields) errors.fields = `At most ${FIELD_LIMITS.fields} fields in use at once.`
  if (out.length > FIELD_LIMITS.fields * 2) errors.fields = 'Too many fields, including removed ones.'
  return { value: out, errors }
}

/** Stored definitions back into the type; anything malformed is dropped. */
export function fieldsFromStored(v: unknown): FieldDef[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((f) => {
    const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    if (typeof o.key !== 'string' || !KEY.test(o.key) || typeof o.label !== 'string' || !(typeof o.type === 'string' && o.type in FIELD_TYPES)) return []
    return [{ key: o.key, label: o.label, type: o.type as FieldType, options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [], archived: o.archived === true }]
  })
}

/**
 * Checks values someone entered on a lead against the definitions. Only active fields can be changed; an empty
 * value clears the field. Returns the patch to apply (null = remove the key).
 */
export function checkValues(defs: FieldDef[], input: unknown): { patch: Record<string, FieldValue | null>; errors: Errors } {
  const errors: Errors = {}
  const patch: Record<string, FieldValue | null> = {}
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const active = new Map(defs.filter((f) => !f.archived).map((f) => [f.key, f]))
  for (const [key, raw] of Object.entries(o)) {
    const f = active.get(key)
    if (!f) { errors[key] = 'This field no longer exists. Refresh the page.'; continue }
    if (raw === null || raw === '' || raw === undefined) { patch[key] = null; continue }
    switch (f.type) {
      case 'text': {
        const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : String(raw)
        if (s.length > FIELD_LIMITS.textLength) errors[key] = `${f.label}: at most ${FIELD_LIMITS.textLength} characters.`
        else patch[key] = s || null
        break
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN
        if (!Number.isFinite(n) || Math.abs(n) > 1e12) errors[key] = `${f.label}: enter a number.`
        else patch[key] = n
        break
      }
      case 'choice': {
        const match = typeof raw === 'string' ? f.options.find((x) => x.toLowerCase() === raw.trim().toLowerCase()) : undefined
        if (!match) errors[key] = `${f.label}: pick one of the choices.`
        else patch[key] = match
        break
      }
      case 'date': {
        const ok = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
          && new Date(`${raw}T00:00:00Z`).toISOString().startsWith(raw)
        if (!ok) errors[key] = `${f.label}: enter a date.`
        else patch[key] = raw as string
        break
      }
      case 'yesno':
        if (typeof raw !== 'boolean') errors[key] = `${f.label}: yes or no.`
        else patch[key] = raw
        break
    }
  }
  return { patch, errors }
}

/** A stored value for display and CSV: "Yes", "12 Mar 2027", "4". */
export function displayValue(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (f.type === 'yesno') return v === true ? 'Yes' : v === false ? 'No' : ''
  if (f.type === 'date' && typeof v === 'string') {
    const d = new Date(`${v}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return String(v)
}

/** Ready-made fields a workspace can add with one click, from what Indian sales teams commonly track. */
export const SUGGESTED_FIELDS: Omit<FieldDef, 'key' | 'archived'>[] = [
  { label: 'Purpose of purchase', type: 'choice', options: ['Own use', 'Investment', 'Both'] },
  { label: 'Home loan', type: 'choice', options: ['Not needed', 'Needed', 'Pre-approved'] },
  { label: 'Possession wanted', type: 'choice', options: ['Ready to move', 'Within 1 year', '1–2 years', 'Flexible'] },
  { label: 'Current residence', type: 'choice', options: ['Own house', 'Rented', 'Company accommodation', 'With family'] },
  { label: 'Occupation', type: 'text', options: [] },
  { label: 'Family size', type: 'number', options: [] },
  { label: 'NRI buyer', type: 'yesno', options: [] },
  { label: 'Expected booking date', type: 'date', options: [] },
]
