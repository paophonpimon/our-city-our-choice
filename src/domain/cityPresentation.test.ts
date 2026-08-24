import { describe, expect, it } from 'vitest'
import { INITIAL_BUILDING_LEVELS, type BuildingLevels } from './cityBuildings'
import {
  deriveBuildingLevelTransitions,
  getCrisisPresentationTiming,
  getNormalPresentationTiming,
  LIVE_ANSWER_IMPACT_DURATION_MS,
  resolvePostPresentationAction,
  resolveTeacherRoundProgressionAction,
} from './cityPresentation'

const levels = (overrides: Partial<BuildingLevels> = {}): BuildingLevels => ({
  ...INITIAL_BUILDING_LEVELS,
  ...overrides,
})

describe('deriveBuildingLevelTransitions', () => {
  it('derives improvement and decline only from old/new building levels', () => {
    expect(deriveBuildingLevelTransitions(
      levels({ school: 1, market: 2 }),
      levels({ school: 2, market: 1 }),
    )).toEqual([
      { buildingId: 'market', direction: 'declined' },
      { buildingId: 'school', direction: 'improved' },
    ])
  })

  it('omits unchanged buildings and does not mutate either state', () => {
    const previous = levels({ hospital: 2 })
    const next = levels({ hospital: 2 })
    const previousSnapshot = { ...previous }
    const nextSnapshot = { ...next }

    expect(deriveBuildingLevelTransitions(previous, next)).toEqual([])
    expect(previous).toEqual(previousSnapshot)
    expect(next).toEqual(nextSnapshot)
  })
})

describe('teacher presentation timings', () => {
  const totalNormal = (timing: ReturnType<typeof getNormalPresentationTiming>) =>
    timing.darken + timing.title + timing.textFade + timing.reveal + timing.settle

  it('keeps ordinary no-change transitions within 4.5–5.0 seconds with readable title dwell', () => {
    const timing = getNormalPresentationTiming(false, false)
    expect(timing.title).toBeGreaterThanOrEqual(2_500)
    expect(timing.title).toBeLessThanOrEqual(3_000)
    expect(totalNormal(timing)).toBeGreaterThanOrEqual(4_500)
    expect(totalNormal(timing)).toBeLessThanOrEqual(5_000)
  })

  it('keeps building-change and reduced-motion transitions within 4.5–5.0 seconds', () => {
    for (const timing of [getNormalPresentationTiming(true, false), getNormalPresentationTiming(true, true)]) {
      expect(timing.title).toBeGreaterThanOrEqual(2_500)
      expect(timing.title).toBeLessThanOrEqual(3_000)
      expect(totalNormal(timing)).toBeGreaterThanOrEqual(4_500)
      expect(totalNormal(timing)).toBeLessThanOrEqual(5_000)
    }
  })

  it('keeps Crisis reveal within 4.5–5.0 seconds and live impacts perceptible', () => {
    for (const crisis of [getCrisisPresentationTiming(false), getCrisisPresentationTiming(true)]) {
      const total = crisis.preRevealHold + crisis.resolutionCue + crisis.settle
      expect(total).toBeGreaterThanOrEqual(4_500)
      expect(total).toBeLessThanOrEqual(5_000)
    }
    expect(LIVE_ANSWER_IMPACT_DURATION_MS).toBe(2_500)
  })
})

describe('teacher normal-round checkpoints', () => {
  it.each([4, 8])('holds Q%s after presentation, then enters the existing crisis intro', (questionNumber) => {
    expect(resolveTeacherRoundProgressionAction('playing', questionNumber, false)).toBe('present-round')
    expect(resolvePostPresentationAction(questionNumber)).toBe('none')
    expect(resolveTeacherRoundProgressionAction('round-result', questionNumber, true)).toBe('enter-crisis')
  })

  it('holds Q10 after presentation, then finishes only from its explicit CTA', () => {
    expect(resolveTeacherRoundProgressionAction('playing', 10, false)).toBe('present-round')
    expect(resolvePostPresentationAction(10)).toBe('none')
    expect(resolveTeacherRoundProgressionAction('round-result', 10, true)).toBe('finish-game')
  })

  it.each([1, 2, 3, 5, 6, 7, 9])('preserves automatic post-presentation progression for Q%s', (questionNumber) => {
    expect(resolvePostPresentationAction(questionNumber)).toBe('open-next-question')
  })

  it('never exposes a checkpoint action before a finalized round is ready', () => {
    expect(resolveTeacherRoundProgressionAction('playing', 4, true)).toBe('present-round')
    expect(resolveTeacherRoundProgressionAction('crisis-intro', 4, true)).toBe('none')
  })
})
