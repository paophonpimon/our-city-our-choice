/**
 * DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2.
 *
 * Extends the same architecture as useDebugLog.ts (module-level singleton
 * event store, URL-param promoted into session storage so it survives route
 * changes/reload, subscribe() for React) with a much larger persisted log,
 * listener/action instrumentation helpers, and automatic anomaly detection
 * for the "teacher sees enough answers but progression stalls" class of bug.
 *
 * Zero behavior impact when ?debug=2 has never been set for this tab: every
 * public function here is a no-op guarded by isFlightRecorderEnabled().
 * Local-only (sessionStorage, with an in-memory fallback used only when no
 * `window` exists, e.g. under test). No Firebase reads/writes. No polling —
 * anomaly/gap checks piggyback on renders that already happen (state
 * changes, the existing countdown tick) rather than adding new timers,
 * except for the deliberately short, single-shot grace-period setTimeouts
 * each detector uses (cleared long before they could accumulate).
 *
 * Never store student response text, assessment responses, PII, auth
 * tokens, or answer choice content — sanitizeDetails() enforces this on
 * every recorded event as a backstop, not just caller discipline.
 *
 * Do NOT commit, push, or deploy with this file active beyond local
 * diagnosis without review.
 */

// ── Actors & event shape ─────────────────────────────────────────────────────

export type FlightActor = 'teacher' | 'student' | 'hook' | 'service' | 'browser' | 'anomaly'

export type FlightDetailValue = string | number | boolean | null | undefined
export type FlightEventDetails = Record<string, FlightDetailValue>

export interface FlightEventContext {
  roomId?: string
  gameCycle?: number
  roomStatus?: string
  questionNumber?: number
  crisisEventId?: string | null
  details?: FlightEventDetails
}

export interface FlightEvent extends FlightEventContext {
  id: number
  ts: number
  elapsedMs: number
  actor: FlightActor
  label: string
}

// ── Storage: real sessionStorage in the browser, in-memory fallback elsewhere ──
// The fallback lives on globalThis (not module state) so it survives the
// vi.resetModules() re-import tests use to simulate a page reload.

interface DiagnosticStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const MEMORY_STORE_GLOBAL_KEY = '__ourCityFlightRecorderMemoryStore__'

const getMemoryStore = (): Record<string, string> => {
  const globalRecord = globalThis as unknown as Record<string, Record<string, string> | undefined>
  if (!globalRecord[MEMORY_STORE_GLOBAL_KEY]) globalRecord[MEMORY_STORE_GLOBAL_KEY] = {}
  return globalRecord[MEMORY_STORE_GLOBAL_KEY]
}

const hasWindowSessionStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage)
  } catch {
    return false
  }
}

const storage: DiagnosticStorage = hasWindowSessionStorage()
  ? window.sessionStorage
  : {
      getItem: (key) => getMemoryStore()[key] ?? null,
      setItem: (key, value) => { getMemoryStore()[key] = value },
      removeItem: (key) => { delete getMemoryStore()[key] },
    }

// ── Level flag: ?debug=2 promoted into storage for the tab session ─────────────

const LEVEL_KEY = 'our_city_debug_level_v1'
const EVENTS_KEY = 'our_city_flight_events_v1'
const SESSION_ID_KEY = 'our_city_flight_session_id_v1'
const MAX_EVENTS = 750

if (typeof window !== 'undefined') {
  try {
    if (new URLSearchParams(window.location.search).get('debug') === '2') {
      storage.setItem(LEVEL_KEY, '2')
    }
  } catch { /* ignore */ }
}

export const isFlightRecorderEnabled = (): boolean => {
  try { return storage.getItem(LEVEL_KEY) === '2' } catch { return false }
}

export const disableFlightRecorder = (): void => {
  try {
    storage.removeItem(LEVEL_KEY)
    storage.removeItem(EVENTS_KEY)
    storage.removeItem(SESSION_ID_KEY)
  } catch { /* ignore */ }
  _events = []
  _seq = 0
  notify()
}

// ── Sanitization backstop ───────────────────────────────────────────────────

const FORBIDDEN_DETAIL_KEY_PATTERN = /response|answertext|choiceid|choicelabel|choicecontent|token|password|secret|nickname|studentnumber|classsection|ownerUid|authToken/i

const sanitizeDetails = (details?: FlightEventDetails): FlightEventDetails | undefined => {
  if (!details) return undefined
  const clean: FlightEventDetails = {}
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEY_PATTERN.test(key)) continue
    if (typeof value === 'object' && value !== null) continue // no nested/raw payloads
    clean[key] = value
  }
  return clean
}

// ── Event store (module-level singleton) ────────────────────────────────────

let _seq = 0
let _events: FlightEvent[] = []
let _listeners: Array<(events: FlightEvent[]) => void> = []
let _initialized = false
let _sessionStart = Date.now()

const notify = (): void => {
  const snapshot = [..._events]
  for (const fn of _listeners) fn(snapshot)
}

const readPersistedEvents = (): FlightEvent[] => {
  try {
    const raw = storage.getItem(EVENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FlightEvent[]) : []
  } catch { return [] }
}

const persistEvents = (): void => {
  try { storage.setItem(EVENTS_KEY, JSON.stringify(_events)) } catch { /* quota/etc - diagnostic only */ }
}

const pushEvent = (actor: FlightActor, label: string, context: FlightEventContext = {}): void => {
  const ts = Date.now()
  _seq += 1
  const event: FlightEvent = {
    id: _seq,
    ts,
    elapsedMs: ts - _sessionStart,
    actor,
    label,
    ...context,
    details: sanitizeDetails(context.details),
  }
  _events.push(event)
  if (_events.length > MAX_EVENTS) _events.splice(0, _events.length - MAX_EVENTS)
  persistEvents()
  notify()
}

const recordSessionMetaIfNeeded = (): void => {
  let sessionId: string | null = null
  try { sessionId = storage.getItem(SESSION_ID_KEY) } catch { /* ignore */ }
  if (sessionId) return
  sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try { storage.setItem(SESSION_ID_KEY, sessionId) } catch { /* ignore */ }
  const hasWindow = typeof window !== 'undefined'
  const hasNavigator = typeof navigator !== 'undefined'
  pushEvent('browser', 'SESSION_META', {
    details: {
      userAgent: hasNavigator ? navigator.userAgent : 'unknown',
      platform: hasNavigator ? navigator.platform || 'unknown' : 'unknown',
      screenWidth: hasWindow && window.screen ? window.screen.width : null,
      screenHeight: hasWindow && window.screen ? window.screen.height : null,
      viewportWidth: hasWindow ? window.innerWidth : null,
      viewportHeight: hasWindow ? window.innerHeight : null,
      devicePixelRatio: hasWindow ? window.devicePixelRatio : null,
      url: hasWindow ? window.location.href : null,
      path: hasWindow ? window.location.pathname : null,
      buildId: typeof import.meta.env !== 'undefined' ? import.meta.env.MODE : 'unknown',
    },
  })
}

const ensureInit = (): void => {
  if (_initialized) return
  _initialized = true
  if (!isFlightRecorderEnabled()) return
  _events = readPersistedEvents()
  _seq = _events.reduce((max, event) => Math.max(max, event.id), 0)
  const oldestEvent = _events[0]
  _sessionStart = oldestEvent ? oldestEvent.ts - oldestEvent.elapsedMs : Date.now()
  recordSessionMetaIfNeeded()
}

/** Records one event. No-op (cheap boolean check only) when disabled. */
export const record = (actor: FlightActor, label: string, context: FlightEventContext = {}): void => {
  if (!isFlightRecorderEnabled()) return
  ensureInit()
  pushEvent(actor, label, context)
}

export const subscribeFlightEvents = (fn: (events: FlightEvent[]) => void): (() => void) => {
  ensureInit()
  _listeners = [..._listeners, fn]
  fn([..._events])
  return () => { _listeners = _listeners.filter((listener) => listener !== fn) }
}

export const getFlightEvents = (): FlightEvent[] => {
  ensureInit()
  return [..._events]
}

export const clearFlightRecorder = (): void => {
  _events = []
  _seq = 0
  try {
    storage.removeItem(EVENTS_KEY)
    storage.removeItem(SESSION_ID_KEY)
  } catch { /* ignore */ }
  _sessionStart = Date.now()
  if (isFlightRecorderEnabled()) recordSessionMetaIfNeeded()
  notify()
}

/** Test-only: resets all module state as if freshly loaded. Not used by app code. */
export const __resetFlightRecorderForTests = (): void => {
  _seq = 0
  _events = []
  _listeners = []
  _initialized = false
  _sessionStart = Date.now()
  _lastSnapshotAt.clear()
  _anomalySeen.clear()
  _lastActionResult.clear()
  _lastAction = null
  _latestTeacherSnapshot = null
  try {
    storage.removeItem(LEVEL_KEY)
    storage.removeItem(EVENTS_KEY)
    storage.removeItem(SESSION_ID_KEY)
  } catch { /* ignore */ }
}

/** Test-only: sets the enabled flag directly, without needing a URL/window. */
export const __setFlightRecorderEnabledForTests = (enabled: boolean): void => {
  try {
    if (enabled) storage.setItem(LEVEL_KEY, '2')
    else storage.removeItem(LEVEL_KEY)
  } catch { /* ignore */ }
}

// ── Listener lifecycle telemetry ────────────────────────────────────────────

export type SubscribeKind = 'room' | 'players' | 'answers' | 'rounds' | 'crisisResults' | 'preAssessments'

const _lastSnapshotAt = new Map<string, number>()

const snapshotKey = (kind: string, roomId: string): string => `${kind}:${roomId}`

export const getSnapshotAgeMs = (kind: string, roomId: string): number | null => {
  const at = _lastSnapshotAt.get(snapshotKey(kind, roomId))
  return at === undefined ? null : Date.now() - at
}

/**
 * Transparently taps a `(listener, onError) => unsubscribe` subscribe
 * function (the exact shape subscribeWithIdentityGuard takes) to record
 * SUBSCRIBE_START/SNAPSHOT_RECEIVED/SUBSCRIBE_ERROR/SUBSCRIBE_STOP around
 * it, without altering what it does. When disabled, returns the original
 * function unchanged - no wrapper, no overhead, no behavior change.
 */
export const tapSubscribe = <T>(
  kind: SubscribeKind,
  roomId: string,
  subscribeFn: (listener: (data: T) => void, onError: (message: string) => void) => () => void,
): ((listener: (data: T) => void, onError: (message: string) => void) => () => void) => {
  if (!isFlightRecorderEnabled()) return subscribeFn
  return (listener, onError) => {
    record('service', `SUBSCRIBE_START ${kind}`, { roomId })
    const unsubscribe = subscribeFn(
      (data) => {
        const now = Date.now()
        const key = snapshotKey(kind, roomId)
        const previous = _lastSnapshotAt.get(key)
        _lastSnapshotAt.set(key, now)
        const count = Array.isArray(data) ? data.length : data ? 1 : 0
        record('service', `SNAPSHOT_RECEIVED ${kind}`, {
          roomId,
          details: { count, sincePreviousMs: previous === undefined ? null : now - previous },
        })
        listener(data)
      },
      (message) => {
        record('service', `SUBSCRIBE_ERROR ${kind}`, { roomId, details: { message } })
        onError(message)
      },
    )
    return () => {
      record('service', `SUBSCRIBE_STOP ${kind}`, { roomId })
      unsubscribe()
    }
  }
}

// ── Service action timings ──────────────────────────────────────────────────

interface LastActionResult {
  action: string
  status: 'pending' | 'ok' | 'error'
  ts: number
  message?: string
}

const _lastActionResult = new Map<string, LastActionResult>()
let _lastAction: LastActionResult | null = null

export const getLastActionResult = (action: string): LastActionResult | null => _lastActionResult.get(action) ?? null
export const getLastAction = (): LastActionResult | null => _lastAction

// Deliberately not importing classroomFriendlyError from ../services here:
// that module's import graph eagerly bootstraps the real game service
// (Firebase or demo) as a side effect of import, which this purely
// diagnostic, independently-testable module must not trigger. Error
// messages throughout this codebase are already safe, Thai, user-facing
// strings with no secrets (prefixed "ผู้ใช้:" by convention) - stripping
// that prefix reproduces the same safe text without the extra coupling.
const safeErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const withoutPrefix = raw.startsWith('ผู้ใช้:') ? raw.slice('ผู้ใช้:'.length) : raw
  return withoutPrefix.length > 300 ? `${withoutPrefix.slice(0, 300)}…` : withoutPrefix
}

/**
 * Wraps an existing async service call with ACTION_START/ACTION_OK/
 * ACTION_ERROR timing. Preserves the return value and rethrows the original
 * error unchanged - it never alters retry behavior, sequencing, or error
 * handling. When disabled, it degrades to a plain `fn()` call.
 */
export const withActionTiming = async <T>(
  action: string,
  roomId: string,
  fn: () => Promise<T>,
  details?: FlightEventDetails,
): Promise<T> => {
  if (!isFlightRecorderEnabled()) return fn()
  const startedAt = Date.now()
  record('service', `ACTION_START ${action}`, { roomId, details })
  const pending: LastActionResult = { action, status: 'pending', ts: startedAt }
  _lastActionResult.set(action, pending)
  _lastAction = pending
  try {
    const result = await fn()
    const ok: LastActionResult = { action, status: 'ok', ts: Date.now() }
    _lastActionResult.set(action, ok)
    _lastAction = ok
    record('service', `ACTION_OK ${action}`, { roomId, details: { ...details, elapsedMs: Date.now() - startedAt } })
    return result
  } catch (error) {
    const message = safeErrorMessage(error)
    const failed: LastActionResult = { action, status: 'error', ts: Date.now(), message }
    _lastActionResult.set(action, failed)
    _lastAction = failed
    record('service', `ACTION_ERROR ${action}`, { roomId, details: { elapsedMs: Date.now() - startedAt, message } })
    throw error
  }
}

// ── Anomaly detectors ────────────────────────────────────────────────────────

const _anomalySeen = new Set<string>()

/** Records an ANOMALY event at most once per dedupeKey (e.g. room+gameCycle+question identity). */
export const recordAnomalyOnce = (dedupeKey: string, label: string, context: FlightEventContext = {}): void => {
  if (!isFlightRecorderEnabled()) return
  if (_anomalySeen.has(dedupeKey)) return
  _anomalySeen.add(dedupeKey)
  record('anomaly', label, context)
}

export const NORMAL_ADVANCE_GRACE_MS = 1300
export const CRISIS_AUTOCLOSE_GRACE_MS = 2000
export const SNAPSHOT_MISSING_GRACE_MS = 1200
export const REALTIME_GAP_THRESHOLD_MS = 8000

/** Pure predicate: is the "everyone answered but the next-question action never became available" bug present? */
export const isNormalAdvanceBlocked = (input: {
  roomStatus: string
  lockedPlayerCount: number
  answerCount: number
  canAdvanceQuestion: boolean
}): boolean =>
  input.roomStatus === 'playing'
  && input.lockedPlayerCount > 0
  && input.answerCount >= input.lockedPlayerCount
  && !input.canAdvanceQuestion

/** Pure predicate: is the "everyone answered the crisis but it never auto-finalized" bug present? */
export const isCrisisAutocloseBlocked = (input: {
  roomStatus: string
  lockedPlayerCount: number
  crisisAnswerCount: number
}): boolean =>
  input.roomStatus === 'crisis-playing'
  && input.lockedPlayerCount > 0
  && input.crisisAnswerCount >= input.lockedPlayerCount

export const isPageVisible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible'
export const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

/** For active room/answers subscriptions: flag an unusually long snapshot gap while visible+online. */
export const checkRealtimeGap = (kind: SubscribeKind, roomId: string): void => {
  if (!isFlightRecorderEnabled()) return
  if (!isPageVisible() || !isOnline()) return
  const age = getSnapshotAgeMs(kind, roomId)
  if (age === null || age < REALTIME_GAP_THRESHOLD_MS) return
  const bucket = Math.floor(age / REALTIME_GAP_THRESHOLD_MS)
  recordAnomalyOnce(`realtime-gap:${kind}:${roomId}:${bucket}`, 'REALTIME_GAP', {
    roomId,
    details: { kind, ageMs: age, visible: isPageVisible(), online: isOnline() },
  })
}

// ── Teacher diagnostic snapshot (for the debug panel, published from TeacherPage) ──

export interface TeacherDiagnosticSnapshot {
  roomId: string | null
  roomStatus: string | null
  questionNumber: number | null
  gameCycle: number | null
  crisisEventId: string | null
  answerCount: number
  lockedPlayerCount: number
  crisisAnswerCount: number
  trustedSnapshotPresent: boolean
  canAdvanceQuestion: boolean
}

let _latestTeacherSnapshot: TeacherDiagnosticSnapshot | null = null
let _snapshotListeners: Array<(snapshot: TeacherDiagnosticSnapshot | null) => void> = []

export const publishTeacherDiagnosticSnapshot = (snapshot: TeacherDiagnosticSnapshot): void => {
  _latestTeacherSnapshot = snapshot
  for (const fn of _snapshotListeners) fn(snapshot)
}

export const subscribeTeacherDiagnosticSnapshot = (
  fn: (snapshot: TeacherDiagnosticSnapshot | null) => void,
): (() => void) => {
  _snapshotListeners = [..._snapshotListeners, fn]
  fn(_latestTeacherSnapshot)
  return () => { _snapshotListeners = _snapshotListeners.filter((listener) => listener !== fn) }
}

// ── Browser lifecycle ────────────────────────────────────────────────────────

/** Installs global browser lifecycle listeners once. Returns a cleanup function. No-op when disabled. */
export const installBrowserLifecycleRecorder = (): (() => void) => {
  if (typeof window === 'undefined' || !isFlightRecorderEnabled()) return () => {}
  ensureInit()
  const onOnline = (): void => record('browser', 'online')
  const onOffline = (): void => record('browser', 'offline')
  const onVisibility = (): void => record('browser', 'visibilitychange', { details: { state: document.visibilityState } })
  const onFocus = (): void => record('browser', 'focus')
  const onBlur = (): void => record('browser', 'blur')
  const onPageHide = (): void => record('browser', 'pagehide')
  const onPageShow = (): void => record('browser', 'pageshow')
  const onBeforeUnload = (): void => record('browser', 'beforeunload')
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}

// ── Report format ────────────────────────────────────────────────────────────

export const FLIGHT_REPORT_SCHEMA_VERSION = 1

export interface FlightReport {
  schemaVersion: number
  generatedAt: number
  session: { sessionId: string | null; startedAt: number }
  browser: FlightEventDetails | null
  currentState: TeacherDiagnosticSnapshot | null
  anomalies: FlightEvent[]
  events: FlightEvent[]
}

export const buildFlightReport = (): FlightReport => {
  ensureInit()
  const events = [..._events]
  const sessionMeta = events.find((event) => event.actor === 'browser' && event.label === 'SESSION_META')
  let sessionId: string | null = null
  try { sessionId = storage.getItem(SESSION_ID_KEY) } catch { /* ignore */ }
  return {
    schemaVersion: FLIGHT_REPORT_SCHEMA_VERSION,
    generatedAt: Date.now(),
    session: { sessionId, startedAt: _sessionStart },
    browser: sessionMeta?.details ?? null,
    currentState: _latestTeacherSnapshot,
    anomalies: events.filter((event) => event.actor === 'anomaly'),
    events,
  }
}

const formatDetails = (details?: FlightEventDetails): string => (details ? ` ${JSON.stringify(details)}` : '')

export const buildFlightTextSummary = (recentCount = 40): string => {
  const report = buildFlightReport()
  const lines: string[] = []
  lines.push(`ROOM: ${report.currentState?.roomId ?? '-'}`)
  lines.push(`DEVICE: ${report.browser?.userAgent ?? 'unknown'}`)
  lines.push('')
  lines.push('ANOMALIES:')
  if (report.anomalies.length === 0) {
    lines.push('- none')
  } else {
    for (const anomaly of report.anomalies) lines.push(`- ${anomaly.label}${formatDetails(anomaly.details)}`)
  }
  lines.push('')
  lines.push('RECENT TIMELINE:')
  const recent = report.events.slice(-recentCount)
  if (recent.length === 0) lines.push('(no events yet)')
  for (const event of recent) lines.push(`+${event.elapsedMs}ms [${event.actor}] ${event.label}${formatDetails(event.details)}`)
  return lines.join('\n')
}
