import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetFlightRecorderForTests,
  __setFlightRecorderEnabledForTests,
  buildFlightReport,
  buildFlightTextSummary,
  CRISIS_AUTOCLOSE_GRACE_MS,
  getFlightEvents,
  isCrisisAutocloseBlocked,
  isFlightRecorderEnabled,
  isNormalAdvanceBlocked,
  NORMAL_ADVANCE_GRACE_MS,
  record,
  recordAnomalyOnce,
} from './flightRecorder'

beforeEach(() => {
  __resetFlightRecorderForTests()
})

describe('disabled by default - no persistence, no meaningful runtime work', () => {
  it('reports disabled and record() is a no-op', () => {
    expect(isFlightRecorderEnabled()).toBe(false)
    record('teacher', 'PROGRESSION_STATE', { roomId: 'ROOM01' })
    expect(getFlightEvents()).toHaveLength(0)
  })

  it('recordAnomalyOnce is also a no-op while disabled', () => {
    recordAnomalyOnce('key-1', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    expect(getFlightEvents()).toHaveLength(0)
  })
})

describe('event cap', () => {
  it('keeps at most ~750 events, dropping the oldest first', () => {
    __setFlightRecorderEnabledForTests(true)
    for (let index = 0; index < 900; index += 1) {
      record('service', `EVENT_${index}`, { roomId: 'ROOM01' })
    }
    const events = getFlightEvents()
    expect(events.length).toBeLessThanOrEqual(750)
    // SESSION_META is recorded once on first enable, then 900 more events -
    // the buffer should have dropped early ones and kept the most recent.
    expect(events[events.length - 1]?.label).toBe('EVENT_899')
    expect(events.some((event) => event.label === 'EVENT_0')).toBe(false)
  })
})

describe('persistence / reload restoration', () => {
  it('restores events from storage after a simulated page reload', async () => {
    vi.resetModules()
    const fresh = await import('./flightRecorder')
    fresh.__resetFlightRecorderForTests()
    fresh.__setFlightRecorderEnabledForTests(true)
    fresh.record('teacher', 'PROGRESSION_STATE', { roomId: 'ROOM01', details: { count: 1 } })
    fresh.record('teacher', 'PROGRESSION_STATE', { roomId: 'ROOM01', details: { count: 2 } })
    const beforeReload = fresh.getFlightEvents()
    expect(beforeReload.length).toBeGreaterThanOrEqual(2)

    // Simulate a fresh page load: re-import the module (fresh module-level
    // state) without clearing the underlying storage the first instance
    // wrote to - a real F5 does exactly this.
    vi.resetModules()
    const reloaded = await import('./flightRecorder')
    const afterReload = reloaded.getFlightEvents()

    expect(afterReload.map((event) => event.label)).toEqual(beforeReload.map((event) => event.label))
    reloaded.__resetFlightRecorderForTests()
  })
})

describe('anomaly deduplication', () => {
  it('records an anomaly only once per dedupe key', () => {
    __setFlightRecorderEnabledForTests(true)
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:3', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:3', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:3', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    const anomalies = getFlightEvents().filter((event) => event.actor === 'anomaly')
    expect(anomalies).toHaveLength(1)
  })

  it('records separately for a genuinely different identity (different question number)', () => {
    __setFlightRecorderEnabledForTests(true)
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:3', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:4', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01' })
    const anomalies = getFlightEvents().filter((event) => event.actor === 'anomaly')
    expect(anomalies).toHaveLength(2)
  })
})

describe('NORMAL_ADVANCE_BLOCKED detector predicate', () => {
  it('is true when everyone has answered but canAdvanceQuestion never became true', () => {
    expect(isNormalAdvanceBlocked({
      roomStatus: 'playing', lockedPlayerCount: 1, answerCount: 1, canAdvanceQuestion: false,
    })).toBe(true)
  })

  it('is false once canAdvanceQuestion is true (the button did appear - not a bug)', () => {
    expect(isNormalAdvanceBlocked({
      roomStatus: 'playing', lockedPlayerCount: 1, answerCount: 1, canAdvanceQuestion: true,
    })).toBe(false)
  })

  it('is false when not everyone has answered yet', () => {
    expect(isNormalAdvanceBlocked({
      roomStatus: 'playing', lockedPlayerCount: 2, answerCount: 1, canAdvanceQuestion: false,
    })).toBe(false)
  })

  it('is false outside the playing status', () => {
    expect(isNormalAdvanceBlocked({
      roomStatus: 'round-result', lockedPlayerCount: 1, answerCount: 1, canAdvanceQuestion: false,
    })).toBe(false)
  })

  it('is false with no locked players', () => {
    expect(isNormalAdvanceBlocked({
      roomStatus: 'playing', lockedPlayerCount: 0, answerCount: 0, canAdvanceQuestion: false,
    })).toBe(false)
  })

  it('grace period constant is in the requested 1000-1500ms range', () => {
    expect(NORMAL_ADVANCE_GRACE_MS).toBeGreaterThanOrEqual(1000)
    expect(NORMAL_ADVANCE_GRACE_MS).toBeLessThanOrEqual(1500)
  })
})

describe('CRISIS_AUTOCLOSE_BLOCKED detector predicate', () => {
  it('is true when the crisis has full answers but the room is still crisis-playing', () => {
    expect(isCrisisAutocloseBlocked({
      roomStatus: 'crisis-playing', lockedPlayerCount: 1, crisisAnswerCount: 1,
    })).toBe(true)
  })

  it('is false once the room has moved on to crisis-result (auto-close worked)', () => {
    expect(isCrisisAutocloseBlocked({
      roomStatus: 'crisis-result', lockedPlayerCount: 1, crisisAnswerCount: 1,
    })).toBe(false)
  })

  it('is false when not everyone has answered the crisis yet', () => {
    expect(isCrisisAutocloseBlocked({
      roomStatus: 'crisis-playing', lockedPlayerCount: 2, crisisAnswerCount: 1,
    })).toBe(false)
  })

  it('grace period constant is in the requested 1500-2500ms range', () => {
    expect(CRISIS_AUTOCLOSE_GRACE_MS).toBeGreaterThanOrEqual(1500)
    expect(CRISIS_AUTOCLOSE_GRACE_MS).toBeLessThanOrEqual(2500)
  })
})

describe('report serialization', () => {
  it('builds a JSON-serializable report with the expected shape', () => {
    __setFlightRecorderEnabledForTests(true)
    record('teacher', 'PROGRESSION_STATE', { roomId: 'ROOM01', gameCycle: 0, roomStatus: 'playing', questionNumber: 3 })
    recordAnomalyOnce('normal-advance-blocked:ROOM01:0:3', 'NORMAL_ADVANCE_BLOCKED', { roomId: 'ROOM01', details: { answerCount: 1 } })

    const report = buildFlightReport()
    expect(report.schemaVersion).toBe(1)
    expect(typeof report.generatedAt).toBe('number')
    expect(Array.isArray(report.events)).toBe(true)
    expect(Array.isArray(report.anomalies)).toBe(true)
    expect(report.anomalies).toHaveLength(1)
    expect(() => JSON.stringify(report)).not.toThrow()
  })

  it('builds a compact text summary containing ROOM/ANOMALIES/RECENT TIMELINE sections', () => {
    __setFlightRecorderEnabledForTests(true)
    recordAnomalyOnce('crisis-autoclose-blocked:ROOM01:0:1', 'CRISIS_AUTOCLOSE_BLOCKED', { roomId: 'ROOM01' })
    record('teacher', 'PROGRESSION_STATE', { roomId: 'ROOM01' })

    const summary = buildFlightTextSummary()
    expect(summary).toContain('ROOM:')
    expect(summary).toContain('ANOMALIES:')
    expect(summary).toContain('- CRISIS_AUTOCLOSE_BLOCKED')
    expect(summary).toContain('RECENT TIMELINE:')
  })
})

describe('no sensitive response payload is included', () => {
  it('strips forbidden keys (responses, choiceId, tokens, PII) from event details', () => {
    __setFlightRecorderEnabledForTests(true)
    record('service', 'ACTION_OK submitAnswer', {
      roomId: 'ROOM01',
      details: {
        responses: [1, 2, 3, 4, 5] as unknown as number, // deliberately wrong-shaped to prove object values are also dropped
        choiceId: 'integrity-a',
        answerText: 'should never appear',
        token: 'secret-token',
        nickname: 'Somchai',
        questionNumber: 4, // safe field, must survive
      },
    })
    const events = getFlightEvents()
    const event = events[events.length - 1]
    expect(event?.details).toEqual({ questionNumber: 4 })
    expect(JSON.stringify(event)).not.toMatch(/responses|choiceId|answerText|token|nickname/i)
  })

  it('drops nested object/array values defensively even under a safe-looking key', () => {
    __setFlightRecorderEnabledForTests(true)
    record('service', 'SNAPSHOT_RECEIVED answers', {
      roomId: 'ROOM01',
      details: { count: 3, rawPayload: { anything: 'should be dropped' } as unknown as string },
    })
    const events = getFlightEvents()
    const event = events[events.length - 1]
    expect(event?.details).toEqual({ count: 3 })
  })
})
