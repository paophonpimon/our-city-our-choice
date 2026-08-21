import { isQuestionAnswerRecord, type ClassroomAnswerRecord } from '../types/classroomGame'
import type { RoomQuestionSnapshot } from './classroomQuestions'
import { LOCATION_BY_ROLE, SCORE_POLICY, type LocationId } from './cityScoring'

export interface LiveAnswerImpact {
  id: string
  locationId: LocationId
  score: number
}

export const resolveLiveAnswerImpact = (
  answer: ClassroomAnswerRecord,
  snapshot: RoomQuestionSnapshot,
): LiveAnswerImpact | null => {
  if (!isQuestionAnswerRecord(answer)) return null
  const question = snapshot.trustedQuestions.find((candidate) => candidate.questionId === answer.questionId)
  if (!question || !question.choices.some((choice) => choice.id === answer.choiceId)) return null
  return {
    id: answer.answerId,
    locationId: LOCATION_BY_ROLE[question.roleId],
    score: answer.choiceId === question.integrityChoiceId ? SCORE_POLICY.integrity : SCORE_POLICY.corruption,
  }
}
