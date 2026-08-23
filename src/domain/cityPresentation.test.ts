import { describe, expect, it } from 'vitest'
import { INITIAL_BUILDING_LEVELS, type BuildingLevels } from './cityBuildings'
import { deriveBuildingLevelTransitions } from './cityPresentation'

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
