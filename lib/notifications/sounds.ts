// lib/notifications/sounds.ts — the alert sounds, made in the browser with Web Audio (no files to download, nothing
// to cache). Browser-only. Three are distinct by default (lib/notifications/lead-alerts.ts): a rising chime for a new
// lead, an urgent triple pulse for "not contacted yet", a soft bell for a follow-up.
//
// Never two at once: within 1.5 s of a sound (in this tab or another tab of RE) the next one is skipped.
// Browsers only allow sound after the person has interacted with the page; until then, play() quietly does nothing.
import type { SoundId } from './lead-alerts'

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number; partial?: number }

const PATTERNS: Record<SoundId, Note[]> = {
  chime: [{ f: 1318.5, at: 0, dur: 0.5 }, { f: 1975.5, at: 0.13, dur: 0.7 }],
  bell: [{ f: 880, at: 0, dur: 1.4, partial: 2.76, gain: 0.9 }],
  pulse: [0, 0.17, 0.34].map((at) => ({ f: 1046.5, at, dur: 0.11, type: 'triangle' as const, gain: 0.8 })),
  ping: [{ f: 1568, at: 0, dur: 0.35 }],
  marimba: [{ f: 1046.5, at: 0, dur: 0.25, type: 'triangle' }, { f: 1318.5, at: 0.1, dur: 0.25, type: 'triangle' }, { f: 1568, at: 0.2, dur: 0.4, type: 'triangle' }],
}

const GAP_MS = 1500
const SHARED_KEY = 'repx.alertSound.last'
const MUTE_KEY = 'repx.alertSounds'

let ctx: AudioContext | null = null
let lastPlayed = 0

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  return ctx
}

/** Call once on the page: the first tap or key press unlocks sound for the rest of the visit. */
export function unlockSoundOnInteraction(): () => void {
  const unlock = () => { context()?.resume().catch(() => undefined) }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
}

/** This device's own choice (My notifications): sounds can be muted here whatever the workspace allows. */
export function deviceSoundsOn(): boolean {
  try { return localStorage.getItem(MUTE_KEY) !== 'off' } catch { return true }
}
export function setDeviceSounds(on: boolean): void {
  try { localStorage.setItem(MUTE_KEY, on ? 'on' : 'off') } catch { /* private mode: nothing to remember */ }
}

/** Plays a sound unless one just played. `force` (the settings preview) ignores the gap and the device mute. */
export function playSound(id: SoundId, opts: { force?: boolean } = {}): boolean {
  const ac = context()
  if (!ac || !PATTERNS[id]) return false
  const now = Date.now()
  if (!opts.force) {
    if (!deviceSoundsOn()) return false
    let shared = 0
    try { shared = Number(localStorage.getItem(SHARED_KEY) ?? 0) } catch { /* ignore */ }
    if (now - Math.max(lastPlayed, shared) < GAP_MS) return false
  }
  if (ac.state === 'suspended') ac.resume().catch(() => undefined)
  if (ac.state !== 'running' && !opts.force) return false
  lastPlayed = now
  try { localStorage.setItem(SHARED_KEY, String(now)) } catch { /* ignore */ }

  const master = ac.createGain()
  master.gain.value = 0.22
  master.connect(ac.destination)
  const t0 = ac.currentTime + 0.02
  for (const n of PATTERNS[id]) {
    for (const [mult, level] of n.partial ? [[1, 1], [n.partial, 0.35]] : [[1, 1]]) {
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.value = n.f * mult
      const peak = (n.gain ?? 1) * level
      g.gain.setValueAtTime(0.0001, t0 + n.at)
      g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
      osc.connect(g).connect(master)
      osc.start(t0 + n.at)
      osc.stop(t0 + n.at + n.dur + 0.05)
    }
  }
  return true
}
