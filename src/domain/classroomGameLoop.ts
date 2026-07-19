import type { PublicRoomQuestion } from './classroomQuestions'
import type { CityLevel, QuestionNumber, RoleId } from './ourCity'
import type { ClassroomAnswerRecord, ClassroomPlayer, ClassroomRoundResult } from '../types/classroomGame'

export const getRoleQuestion = (
  questions: readonly PublicRoomQuestion[],
  roleId: RoleId,
  questionNumber: QuestionNumber,
): PublicRoomQuestion | null =>
  questions.find((question) => question.roleId === roleId && question.questionNumber === questionNumber) ?? null

export const countAnswersForQuestion = (
  answers: readonly ClassroomAnswerRecord[],
  questionNumber: QuestionNumber | 0,
  gameCycle?: number,
): number => new Set(answers.filter((answer) => answer.questionNumber === questionNumber && (gameCycle === undefined || answer.gameCycle === gameCycle)).map((answer) => answer.playerId)).size

export const shouldCloseQuestion = (
  answerCount: number,
  lockedPlayerCount: number,
  questionDeadlineAt: number | null,
  now = Date.now(),
): boolean =>
  lockedPlayerCount > 0 &&
  (answerCount >= lockedPlayerCount || (questionDeadlineAt !== null && now >= questionDeadlineAt))

export const getRemainingSeconds = (deadlineAt: number | null, now = Date.now()): number =>
  deadlineAt === null ? 0 : Math.max(0, Math.ceil((deadlineAt - now) / 1_000))

export const getCityImagePath = (cityLevel: CityLevel): string => `/images/city/city-${cityLevel}.png`

export const getFinalAnswerTotals = (
  rounds: readonly ClassroomRoundResult[],
  gameCycle?: number,
): { integrityCount: number; corruptionCount: number; timeoutCount: number } =>
  rounds.filter((round) => gameCycle === undefined || round.gameCycle === gameCycle).reduce(
    (total, round) => ({
      integrityCount: total.integrityCount + round.integrityCount,
      corruptionCount: total.corruptionCount + round.corruptionCount,
      timeoutCount: total.timeoutCount + round.timeoutCount,
    }),
    { integrityCount: 0, corruptionCount: 0, timeoutCount: 0 },
  )

export const hasBalancedLockedRoles = (players: readonly ClassroomPlayer[]): boolean => {
  if (players.some((player) => player.roleId === null)) return false
  const counts = new Map<RoleId, number>()
  for (const player of players) {
    if (player.roleId) counts.set(player.roleId, (counts.get(player.roleId) ?? 0) + 1)
  }
  const values = [...counts.values()]
  return values.length > 0 && Math.max(...values) - Math.min(...values) <= 1
}
