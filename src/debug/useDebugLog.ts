/**
 * TEMPORARY DIAGNOSTIC — debug overlay event store.
 * Only active when ?debug=1 has been seen in the current browser session.
 * No-ops in all other cases. Zero Firebase reads/writes, zero polling.
 * Do NOT commit, push, or deploy with this file beyond local diagnosis.
 */

export type DebugActor = 'teacher' | 'student' | 'hook'

export interface DebugEvent {
  id: number
  ts: number
  actor: DebugActor
  label: string
  value?: string
}

const MAX_EVENTS = 20
const SESSION_KEY = 'our_city_debug_v1'

// ── Persistence ──────────────────────────────────────────────────────────────
// On every module load, promote ?debug=1 from the URL into sessionStorage so
// that subsequent React-router navigations (which drop the query param) still
// keep debug mode active for the duration of the tab session.
if (typeof window !== 'undefined') {
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    try { window.sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
  }
}

export const isDebugMode = (): boolean => {
  if (typeof window === 'undefined') return false
  try { return window.sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

export const disableDebugMode = (): void => {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

// ── Event store ───────────────────────────────────────────────────────────────
// Module-level singleton: persists across React renders, zero extra I/O.
let _seq = 0
let _events: DebugEvent[] = []
let _listeners: Array<(events: DebugEvent[]) => void> = []

const notify = (): void => {
  const snapshot = [..._events]
  for (const fn of _listeners) fn(snapshot)
}

export const debugLog = (actor: DebugActor, label: string, value?: string): void => {
  if (!isDebugMode()) return
  _seq += 1
  const event: DebugEvent = { id: _seq, ts: Date.now(), actor, label, value }
  _events = [event, ..._events].slice(0, MAX_EVENTS)
  notify()
}

export const subscribeDebugEvents = (fn: (events: DebugEvent[]) => void): (() => void) => {
  _listeners = [..._listeners, fn]
  fn([..._events])
  return () => {
    _listeners = _listeners.filter((l) => l !== fn)
  }
}
