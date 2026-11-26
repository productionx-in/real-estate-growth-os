// lib/notifications/lead-alerts.ts — the workspace's lead alerts (Settings → Notification defaults → Lead alerts,
// org_settings.alerts, 20260093). Pure, so the settings form, the API, the in-app banners and the tests share one
// definition. The database reads the same keys (public.lead_alert_on / lead_alert_minutes): a missing key means "on".
//
//   new lead      — the assignee, and the workspace's owners, admins and managers, hear about every new lead at once.
//   not contacted — the assignee is reminded every N minutes until someone acts on the lead (at most 24 hours).
//   follow-up     — a reminder N minutes before a follow-up or site visit is due.
// Scheduling happens on the server (the minute job), so alerts arrive with RE closed, as phone or desktop push.
// The banners and sounds are what someone sees while RE is open.

export const SOUNDS = {
  chime: 'Chime',
  bell: 'Bell',
  pulse: 'Pulse',
  ping: 'Ping',
  marimba: 'Marimba',
} as const
export type SoundId = keyof typeof SOUNDS
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[]

/** The three kinds of alert that make a sound. */
/** `win`: an achievement, a completed mission, a target reached or a level up (20260094). */
export type AlertSoundKind = 'newLead' | 'reminder' | 'followUp' | 'win'

export interface LeadAlertSettings {
  /** Master switch: off silences everything below (the inbox keeps everything else it had before). */
  enabled: boolean
  newLead: boolean
  uncontacted: boolean
  /** Minutes between "not contacted yet" reminders, 5–60. */
  uncontactedMinutes: number
  followUp: boolean
  /** Minutes before a follow-up is due, 1–60. */
  followUpMinutes: number
  /** Sounds with the banners. Each person can still mute their own device. */
  sounds: boolean
  newLeadSound: SoundId
  reminderSound: SoundId
  followUpSound: SoundId
}

export const DEFAULT_LEAD_ALERTS: LeadAlertSettings = {
  enabled: true,
  newLead: true,
  uncontacted: true,
  uncontactedMinutes: 10,
  followUp: true,
  followUpMinutes: 5,
  sounds: true,
  newLeadSound: 'chime',
  reminderSound: 'pulse',
  followUpSound: 'bell',
}

export const ALERT_LIMITS = { uncontacted: [5, 60], followUp: [1, 60] } as const

type Errors = Record<string, string>

export function normaliseLeadAlerts(input: unknown): { value: LeadAlertSettings; errors: Errors } {
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const errors: Errors = {}
  const bool = (k: keyof LeadAlertSettings) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_LEAD_ALERTS[k] as boolean))
  const mins = (k: 'uncontactedMinutes' | 'followUpMinutes', [lo, hi]: readonly [number, number]) => {
    const v = o[k]
    if (v === undefined) return DEFAULT_LEAD_ALERTS[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
      errors[k] = `A whole number of minutes from ${lo} to ${hi}.`
      return DEFAULT_LEAD_ALERTS[k]
    }
    return v
  }
  const sound = (k: 'newLeadSound' | 'reminderSound' | 'followUpSound') => {
    const v = o[k]
    if (v === undefined) return DEFAULT_LEAD_ALERTS[k]
    if (typeof v === 'string' && v in SOUNDS) return v as SoundId
    errors[k] = 'Pick a sound from the list.'
    return DEFAULT_LEAD_ALERTS[k]
  }
  return {
    value: {
      enabled: bool('enabled'),
      newLead: bool('newLead'),
      uncontacted: bool('uncontacted'),
      uncontactedMinutes: mins('uncontactedMinutes', ALERT_LIMITS.uncontacted),
      followUp: bool('followUp'),
      followUpMinutes: mins('followUpMinutes', ALERT_LIMITS.followUp),
      sounds: bool('sounds'),
      newLeadSound: sound('newLeadSound'),
      reminderSound: sound('reminderSound'),
      followUpSound: sound('followUpSound'),
    },
    errors,
  }
}

/** Stored settings (possibly partial or malformed) over the defaults; never throws. */
export function leadAlertsFromStored(v: unknown): LeadAlertSettings {
  return normaliseLeadAlerts({ ...DEFAULT_LEAD_ALERTS, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) }).value
}

/**
 * Which in-app banner (and sound) a notification gets, or null for one that stays in the inbox only.
 * New-lead alerts carry data.event = 'new_lead' (20260093); a plain reassignment is not a new lead.
 */
export function bannerKind(type: string, event?: string | null): AlertSoundKind | null {
  if (type === 'lead_new' || ((type === 'lead_assigned' || type === 'lead_unassigned') && event === 'new_lead')) return 'newLead'
  if (type === 'lead_uncontacted' || type === 'sla_nudge') return 'reminder'
  if (type === 'follow_up_due') return 'followUp'
  if (type === 'achievement') return 'win'
  return null
}

export function soundFor(kind: AlertSoundKind, s: LeadAlertSettings): SoundId | null {
  if (!s.enabled || !s.sounds) return null
  if (kind === 'newLead') return s.newLead ? s.newLeadSound : null
  if (kind === 'reminder') return s.uncontacted ? s.reminderSound : null
  if (kind === 'win') return 'marimba'
  return s.followUp ? s.followUpSound : null
}

/** Several alerts at once make one sound: the most important kind wins. */
export function loudest(kinds: AlertSoundKind[]): AlertSoundKind | null {
  for (const k of ['newLead', 'reminder', 'followUp', 'win'] as const) if (kinds.includes(k)) return k
  return null
}
