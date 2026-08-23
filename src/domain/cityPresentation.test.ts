import { describe, expect, it } from 'vitest'
import { INITIAL_BUILDING_LEVELS, type BuildingLevels } from './cityBuildings'
import { deriveBuildingLevelTransitions, getCrisisPresentationTiming, getNormalPresentationTiming, LIVE_ANSWER_IMPACT_DURATION_MS } from './cityPresentation'

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

  it('keeps ordinary no-change transitions within 1.2–1.6 seconds', () => {
    expect(totalNormal(getNormalPresentationTiming(false, false))).toBe(1_310)
  })

  it('keeps building-change transitions within 2.5–3.2 seconds', () => {
    expect(totalNormal(getNormalPresentationTiming(true, false))).toBe(2_760)
  })

  it('keeps Crisis reveal within 3.0–4.0 seconds and live impacts perceptible', () => {
    const crisis = getCrisisPresentationTiming(false)
    expect(crisis.preRevealHold + crisis.resolutionCue + crisis.settle).toBe(3_200)
    expect(LIVE_ANSWER_IMPACT_DURATION_MS).toBe(2_500)
  })
})
