import {
  calculateMatchedAssessmentEvidence,
  isValidAssessmentResponses,
  isValidObservationInput,
  isValidReflection,
  type MatchedGroupAssessmentEvidence,
} from './assessment'
import type {
  ClassroomAssessmentRecord,
  ClassroomPostAssessment,
  ClassroomPreAssessment,
  ClassroomReflection,
  ClassroomTeacherObservation,
} from '../types/classroomGame'

export const NORMAL_SCENARIOS_PER_CYCLE = 10
export const CRISIS_SCENARIOS_PER_CYCLE = 2
export const DECISIONS_PER_CYCLE = NORMAL_SCENARIOS_PER_CYCLE + CRISIS_SCENARIOS_PER_CYCLE

const countUniquePlayers = <T extends { playerId: string }>(records: readonly T[]): number =>
  new Set(records.map((record) => record.playerId)).size

const completionPercent = (completeCount: number, participantCount: number): number | null =>
  participantCount > 0 ? completeCount / participantCount * 100 : null

export interface CompetitionAssessmentEvidence {
  participantCount: number
  preCompleteCount: number
  postCompleteCount: number
  reflectionCompleteCount: number
  preCompletionPercent: number | null
  postCompletionPercent: number | null
  reflectionCompletionPercent: number | null
  matched: MatchedGroupAssessmentEvidence
  matchedPreTotal: number
  matchedPostTotal: number
  observation: ClassroomTeacherObservation | null
  observationMean: number | null
}

/** Pure judge-facing summary. Raw identities and Reflection text never leave this boundary. */
export const calculateCompetitionAssessmentEvidence = (
  participantCount: number,
  records: readonly ClassroomAssessmentRecord[],
): CompetitionAssessmentEvidence => {
  const preRecords = records.filter(
    (record): record is ClassroomPreAssessment => record.recordType === 'pre' && isValidAssessmentResponses(record.responses),
  )
  const postRecords = records.filter(
    (record): record is ClassroomPostAssessment => record.recordType === 'post' && isValidAssessmentResponses(record.responses),
  )
  const reflectionRecords = records.filter(
    (record): record is ClassroomReflection => record.recordType === 'reflection' && isValidReflection(record),
  )
  const observation = records.find(
    (record): record is ClassroomTeacherObservation => record.recordType === 'observation' && isValidObservationInput(record),
  ) ?? null
  const matchedEvidence = calculateMatchedAssessmentEvidence(preRecords, postRecords)

  const preCompleteCount = countUniquePlayers(preRecords)
  const postCompleteCount = countUniquePlayers(postRecords)
  const reflectionCompleteCount = countUniquePlayers(reflectionRecords)

  return {
    participantCount,
    preCompleteCount,
    postCompleteCount,
    reflectionCompleteCount,
    preCompletionPercent: completionPercent(preCompleteCount, participantCount),
    postCompletionPercent: completionPercent(postCompleteCount, participantCount),
    reflectionCompletionPercent: completionPercent(reflectionCompleteCount, participantCount),
    matched: matchedEvidence.group,
    matchedPreTotal: matchedEvidence.students.reduce((total, student) => total + student.preTotal, 0),
    matchedPostTotal: matchedEvidence.students.reduce((total, student) => total + student.postTotal, 0),
    observation,
    observationMean: observation
      ? (observation.o1 + observation.o2 + observation.o3 + observation.o4) / 4
      : null,
  }
}

export interface CompetitionSimulationEvidence {
  normalScenariosCompleted: number
  crisisScenariosCompleted: number
  expectedDecisionOpportunities: number | null
  actualDecisionOutcomes: number
  reconciles: boolean | null
}

export const calculateCompetitionSimulationEvidence = (
  participantCount: number,
  completedGameCount: number,
  integrityTotal: number,
  corruptionTotal: number,
  timeoutTotal: number,
): CompetitionSimulationEvidence => {
  const completedCycles = Math.max(0, completedGameCount)
  const expectedDecisionOpportunities = participantCount > 0 && completedCycles > 0
    ? participantCount * DECISIONS_PER_CYCLE * completedCycles
    : null
  const actualDecisionOutcomes = integrityTotal + corruptionTotal + timeoutTotal

  return {
    normalScenariosCompleted: completedCycles * NORMAL_SCENARIOS_PER_CYCLE,
    crisisScenariosCompleted: completedCycles * CRISIS_SCENARIOS_PER_CYCLE,
    expectedDecisionOpportunities,
    actualDecisionOutcomes,
    reconciles: expectedDecisionOpportunities === null ? null : actualDecisionOutcomes === expectedDecisionOpportunities,
  }
}
