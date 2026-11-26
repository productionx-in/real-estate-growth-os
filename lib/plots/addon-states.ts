// lib/plots/addon-states.ts — Interactive Plot Map entitlement states, as pure functions and constants (safe in the
// browser). States: not_purchased (no row), pending, active, suspended, expired (active but past valid_until —
// derived exactly as public.project_addon_state() derives it in SQL, 20260080). Database reads: lib/plots/addons.ts.

export const ADDONS = {
  plot_maps: {
    name: 'Interactive Plot Map',
    pitch: 'Your approved layout as a live, clickable map — every plot coloured by its real inventory status, with a link buyers can open on their phone.',
  },
} as const
export type AddonKey = keyof typeof ADDONS

/** List price pre-filled in the console for a new activation (rupees, before GST). Every deal can be changed there.
 *  Reasoning and the tiers for larger layouts: docs/commercial/PLOT_MAPS_ADDON.md. */
export const ADDON_LIST_PRICE: Record<AddonKey, { setupRupees: number; monthlyRupees: number }> = {
  plot_maps: { setupRupees: 14_999, monthlyRupees: 2_999 },
}

export const ADDON_STATES = ['not_purchased', 'pending', 'active', 'suspended', 'expired'] as const
export type AddonState = (typeof ADDON_STATES)[number]

/** The state of a project's add-on row (null = no row). Mirrors public.project_addon_state(). */
export function addonState(row: { status: string; valid_until: string | null } | null, now: Date = new Date()): AddonState {
  if (!row) return 'not_purchased'
  if (row.status === 'active') {
    return row.valid_until && new Date(row.valid_until).getTime() <= now.getTime() ? 'expired' : 'active'
  }
  return row.status === 'pending' || row.status === 'suspended' ? row.status : 'not_purchased'
}

/** What each state lets a workspace do. Only `active` uses the feature; nothing else publishes or edits. */
export const STATE_INFO: Record<AddonState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; customer: string }> = {
  not_purchased: { label: 'Not activated', tone: 'neutral', customer: 'This add-on isn’t activated for this project yet.' },
  pending: { label: 'Activation pending', tone: 'warning', customer: 'Activation has been requested. RE will confirm it and let you know.' },
  active: { label: 'Active', tone: 'success', customer: 'Active for this project.' },
  suspended: { label: 'Suspended', tone: 'danger', customer: 'Suspended for this project. Your layouts are kept, but the map is offline and can’t be edited or published. Contact your RE account manager.' },
  expired: { label: 'Expired', tone: 'danger', customer: 'The subscription for this project has ended. Your layouts are kept, but the map is offline and can’t be edited or published until it is renewed.' },
}

/** End of the given day in India (23:59:59.999 IST), as an ISO instant: a paid period runs to the end of its last day. */
export function endOfDayIst(date: string): string {
  return new Date(`${date}T23:59:59.999+05:30`).toISOString()
}

export interface ProjectAddon {
  state: AddonState
  validUntil: string | null
  setupFeePaise: number
  monthlyFeePaise: number
  notes: string | null
  statusReason: string | null
  requestedAt: string | null
  activatedAt: string | null
}
export const NO_PROJECT_ADDON: ProjectAddon = {
  state: 'not_purchased', validUntil: null, setupFeePaise: 0, monthlyFeePaise: 0, notes: null, statusReason: null, requestedAt: null, activatedAt: null,
}

export const PROJECT_ADDON_COLUMNS = 'project_id, status, valid_until, setup_fee_paise, monthly_fee_paise, notes, status_reason, requested_at, activated_at'
export type ProjectAddonRow = { project_id: string; status: string; valid_until: string | null; setup_fee_paise: number | string; monthly_fee_paise: number | string; notes: string | null; status_reason: string | null; requested_at: string | null; activated_at: string | null }

export function toProjectAddon(row: ProjectAddonRow | null, now: Date = new Date()): ProjectAddon {
  if (!row) return NO_PROJECT_ADDON
  return {
    state: addonState(row, now), validUntil: row.valid_until, setupFeePaise: Number(row.setup_fee_paise), monthlyFeePaise: Number(row.monthly_fee_paise),
    notes: row.notes, statusReason: row.status_reason, requestedAt: row.requested_at, activatedAt: row.activated_at,
  }
}
