import { BUILDING_IDS, type BuildingId, type BuildingLevel, type BuildingLevels } from './cityBuildings'
import type { ClassroomRoomStatus } from '../types/classroomGame'

export type BuildingTransitionDirection = 'improved' | 'declined'

export interface BuildingLevelTransition {
  buildingId: BuildingId
  direction: BuildingTransitionDirection
}

export type BuildingLevelChangeDirection = 'up' | 'down' | 'same'

export interface BuildingLevelDisplayTransition {
  previousLevel: BuildingLevel
  currentLevel: BuildingLevel
  changeDirection: BuildingLevelChangeDirection
}

export type BuildingVisualEffectState = 'upgrade' | 'neutral' | 'downgrade'
export type BuildingVisualEffectIntensity = 'none' | 'light' | 'medium' | 'strong'
export type BuildingLabelTone = 'critical' | 'degraded' | 'neutral' | 'improved' | 'thriving'
export type BuildingChangeIndicatorTone = 'positive' | 'negative' | 'neutral'

export interface BuildingVisualEffect {
  state: BuildingVisualEffectState
  intensity: BuildingVisualEffectIntensity
}

export const resolveBuildingLabelTone = (level: BuildingLevel): BuildingLabelTone => {
  if (level <= -2) return 'critical'
  if (level === -1) return 'degraded'
  if (level === 1) return 'improved'
  if (level >= 2) return 'thriving'
  return 'neutral'
}

/**
 * Color communicates the resolved current health, not direction alone. A
 * downward transition that lands on Lv.0/Lv.1 must not look damaged; red is
 * reserved for buildings whose current level is actually negative.
 */
export const resolveBuildingChangeIndicatorTone = (
  transition: BuildingLevelDisplayTransition,
): BuildingChangeIndicatorTone => {
  if (transition.currentLevel < 0) return 'negative'
  if (transition.changeDirection === 'up' && transition.currentLevel > 0) return 'positive'
  return 'neutral'
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

/**
 * Resolves label-ready transitions from the already-authoritative building
 * levels. This is presentation data only: it never reads scores or changes
 * any gameplay state.
 */
export const resolveBuildingLevelDisplayTransitions = (
  previousLevels: BuildingLevels,
  currentLevels: BuildingLevels,
): Record<BuildingId, BuildingLevelDisplayTransition> => Object.fromEntries(
  BUILDING_IDS.map((buildingId) => {
    const previousLevel = previousLevels[buildingId]
    const currentLevel = currentLevels[buildingId]
    const changeDirection = currentLevel > previousLevel
      ? 'up'
      : currentLevel < previousLevel
        ? 'down'
        : 'same'
    return [buildingId, { previousLevel, currentLevel, changeDirection }]
  }),
) as Record<BuildingId, BuildingLevelDisplayTransition>

/**
 * Shared presentation mapping for every building model. The resolved level
 * transition is the only input: building identity, scores, and gameplay data
 * cannot change the visual language.
 */
export const resolveBuildingVisualEffect = (
  transition: BuildingLevelDisplayTransition,
): BuildingVisualEffect => {
  // A damaged model remains visibly in warning state after a reload or after
  // the transition animation has settled. This still reads only the resolved
  // current level; no score or building identity participates.
  if (transition.currentLevel < 0) {
    return {
      state: 'downgrade',
      intensity: transition.currentLevel <= -2 ? 'strong' : 'medium',
    }
  }

  if (transition.currentLevel > 0) {
    return {
      state: 'upgrade',
      intensity: transition.currentLevel >= 2 ? 'strong' : 'light',
    }
  }

  return { state: 'neutral', intensity: 'none' }
}
