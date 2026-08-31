import type { LocationId, LocationSummary } from '../domain/cityScoring'
import type { ClassroomRoundResult } from '../types/classroomGame'

interface CumulativeBuildingImpactInput {
  currentGameCycle: number
  currentQuestionNumber: number
  currentLocationImpacts: Record<LocationId, LocationSummary> | null | undefined
  locationId: LocationId
  roundHistory: readonly ClassroomRoundResult[]
}

/**
 * Presentation-only total of the per-round building averages for the current
 * cycle. The current summary is added only while its persisted round is not
 * already present, preventing subscription timing from counting it twice.
 */
export const calculateCumulativeBuildingImpact = ({
  currentGameCycle,
  currentQuestionNumber,
  currentLocationImpacts,
  locationId,
  roundHistory,
}: CumulativeBuildingImpactInput): number => {
  const completedRounds = roundHistory.filter((round) =>
    round.gameCycle === currentGameCycle && round.questionNumber <= currentQuestionNumber)
  const currentRoundIsPersisted = completedRounds.some((round) =>
    round.questionNumber === currentQuestionNumber)
  const completedImpact = completedRounds.reduce((total, round) =>
    total + (round.locationSummaries[locationId]?.scoreAverage ?? 0), 0)
  const currentImpact = currentLocationImpacts && !currentRoundIsPersisted
    ? currentLocationImpacts[locationId]?.scoreAverage ?? 0
    : 0

  return completedImpact + currentImpact
}
