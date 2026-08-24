import { BUILDING_IDS, type BuildingId, type BuildingLevels } from './cityBuildings'
import type { ClassroomRoomStatus } from '../types/classroomGame'

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

export type TeacherRoundProgressionAction =
  | 'present-round'
  | 'open-next-question'
  | 'enter-crisis'
  | 'finish-game'
  | 'none'

/**
 * Pure UI orchestration for the teacher's normal-round result flow. The
 * service remains authoritative for every room transition; this only decides
 * whether the already-finalized city should be presented or a checkpoint CTA
 * may invoke the existing transition.
 */
export const resolveTeacherRoundProgressionAction = (
  status: ClassroomRoomStatus,
  questionNumber: number,
  checkpointReady: boolean,
): TeacherRoundProgressionAction => {
  if (status === 'playing') return 'present-round'
  if (status !== 'round-result') return 'none'
  if (!checkpointReady) return 'present-round'
  if (questionNumber === 4 || questionNumber === 8) return 'enter-crisis'
  if (questionNumber === 10) return 'finish-game'
  return 'open-next-question'
}

export const resolvePostPresentationAction = (
  questionNumber: number,
): TeacherRoundProgressionAction => {
  if (questionNumber === 4 || questionNumber === 8 || questionNumber === 10) return 'none'
  return 'open-next-question'
}

const NORMAL_PRESENTATION_BASE = {
  standard: { darken: 180, title: 2_750, textFade: 180, reveal: 300 },
  reduced: { darken: 40, title: 2_750, textFade: 40, reveal: 100 },
} as const

export const getNormalPresentationTiming = (
  hasBuildingLevelChanges: boolean,
  reducedMotion: boolean,
): NormalPresentationTiming => {
  const base = reducedMotion ? NORMAL_PRESENTATION_BASE.reduced : NORMAL_PRESENTATION_BASE.standard
  return {
    ...base,
    settle: reducedMotion ? 1_600 : hasBuildingLevelChanges ? 1_450 : 1_200,
  }
}

export const getCrisisPresentationTiming = (reducedMotion: boolean): CrisisPresentationTiming => reducedMotion
  ? { preRevealHold: 900, resolutionCue: 100, settle: 3_500 }
  : { preRevealHold: 1_200, resolutionCue: 400, settle: 3_000 }

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
