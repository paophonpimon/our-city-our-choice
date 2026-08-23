import { BUILDING_IDS, type BuildingId, type BuildingLevels } from './cityBuildings'

export type BuildingTransitionDirection = 'improved' | 'declined'

export interface BuildingLevelTransition {
  buildingId: BuildingId
  direction: BuildingTransitionDirection
}

/**
 * Presentation-only comparison of two already-calculated building states.
 * It never reads scores and never derives or persists a building level.
 */
export const deriveBuildingLevelTransitions = (
  previousLevels: BuildingLevels,
  nextLevels: BuildingLevels,
): BuildingLevelTransition[] => BUILDING_IDS.flatMap((buildingId) => {
  const direction = nextLevels[buildingId] > previousLevels[buildingId]
    ? 'improved'
    : nextLevels[buildingId] < previousLevels[buildingId]
      ? 'declined'
      : null
  return direction ? [{ buildingId, direction }] : []
})
