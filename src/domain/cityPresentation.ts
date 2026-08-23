import { BUILDING_IDS, type BuildingId, type BuildingLevels } from './cityBuildings'

export type BuildingTransitionDirection = 'improved' | 'declined'

export interface BuildingLevelTransition {
  buildingId: BuildingId
  direction: BuildingTransitionDirection
}

export interface NormalPresentationTiming {
  darken: number
  title: number
  textFade: number
  reveal: number
  settle: number
}

export interface CrisisPresentationTiming {
  preRevealHold: number
  resolutionCue: number
  settle: number
}

export const LIVE_ANSWER_IMPACT_DURATION_MS = 2_500

const NORMAL_PRESENTATION_BASE = {
  standard: { darken: 180, title: 650, textFade: 180, reveal: 300 },
  reduced: { darken: 40, title: 500, textFade: 40, reveal: 100 },
} as const

export const getNormalPresentationTiming = (
  hasBuildingLevelChanges: boolean,
  reducedMotion: boolean,
): NormalPresentationTiming => {
  const base = reducedMotion ? NORMAL_PRESENTATION_BASE.reduced : NORMAL_PRESENTATION_BASE.standard
  return {
    ...base,
    settle: hasBuildingLevelChanges ? (reducedMotion ? 800 : 1_450) : 0,
  }
}

export const getCrisisPresentationTiming = (reducedMotion: boolean): CrisisPresentationTiming => reducedMotion
  ? { preRevealHold: 600, resolutionCue: 100, settle: 1_200 }
  : { preRevealHold: 900, resolutionCue: 400, settle: 1_900 }

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
