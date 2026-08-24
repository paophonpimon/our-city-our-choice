import type { PublicRoomQuestion, RoomQuestionSnapshot } from './classroomQuestions'
import type { CrisisEventId } from './cityCrisisEvents'
import type { CityLevel, QuestionNumber, RoleId } from './ourCity'
import { isCrisisAnswerRecord, isQuestionAnswerRecord, type ClassroomAnswerRecord, type ClassroomPlayer, type ClassroomPreAssessment, type ClassroomRoomStatus, type ClassroomRoundResult } from '../types/classroomGame'
import { clampCityScore, SCORE_POLICY } from './cityScoring'

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
): number => new Set(answers.filter((answer) => isQuestionAnswerRecord(answer) && answer.questionNumber === questionNumber && (gameCycle === undefined || answer.gameCycle === gameCycle)).map((answer) => answer.playerId)).size

export const shouldCloseQuestion = (
  answerCount: number,
  lockedPlayerCount: number,
  questionDeadlineAt: number | null,
  now = Date.now(),
): boolean =>
  lockedPlayerCount > 0 &&
  (answerCount >= lockedPlayerCount || (questionDeadlineAt !== null && now >= questionDeadlineAt))

export const countCrisisAnswersForEvent = (
  answers: readonly ClassroomAnswerRecord[],
  gameCycle: number,
  eventId: CrisisEventId,
): number => new Set(
  answers
    .filter((answer) => isCrisisAnswerRecord(answer) && answer.gameCycle === gameCycle && answer.eventId === eventId)
    .map((answer) => answer.playerId),
).size

/**
 * Crisis auto-close is intentionally stricter than normal-question closure.
 * A timeout is trusted only when the currently observed crisis-playing room
 * carries its own complete, forward-moving timing pair.
 */
export const shouldAutoCloseCrisis = (
  answerCount: number,
  lockedPlayerCount: number,
  questionStartedAt: number | null,
  questionDeadlineAt: number | null,
  now = Date.now(),
): boolean => lockedPlayerCount > 0 && (
  answerCount >= lockedPlayerCount
  || (
    questionStartedAt !== null
    && questionDeadlineAt !== null
    && questionDeadlineAt > questionStartedAt
    && now >= questionDeadlineAt
  )
)

/**
 * Shows the teacher how submitted answers are moving the city before the
 * authoritative round result is committed. Missing answers are deliberately
 * omitted until the round closes, when they become timeouts.
 */
export const getLiveCityScore = (
  previousCityScore: number,
  lockedPlayerCount: number,
  questionNumber: QuestionNumber | 0,
  gameCycle: number,
  answers: readonly ClassroomAnswerRecord[],
  snapshot: RoomQuestionSnapshot | null,
): number => {
  if (!snapshot || lockedPlayerCount <= 0 || questionNumber === 0) return previousCityScore

  const questionsById = new Map(
    snapshot.trustedQuestions
      .filter((question) => question.questionNumber === questionNumber)
      .map((question) => [question.questionId, question]),
  )
  const answeredPlayers = new Set<string>()
  let submittedImpact = 0

  for (const answer of answers) {
    if (
      !isQuestionAnswerRecord(answer)
      || answer.gameCycle !== gameCycle
      || answer.questionNumber !== questionNumber
      || answeredPlayers.has(answer.playerId)
    ) continue
    const question = questionsById.get(answer.questionId)
    if (!question || !question.choices.some((choice) => choice.id === answer.choiceId)) continue
    answeredPlayers.add(answer.playerId)
    submittedImpact += answer.choiceId === question.integrityChoiceId
      ? SCORE_POLICY.integrity
      : SCORE_POLICY.corruption
  }

  return clampCityScore(previousCityScore + submittedImpact / lockedPlayerCount)
}

export const getRemainingSeconds = (deadlineAt: number | null, now = Date.now()): number =>
  deadlineAt === null ? 0 : Math.max(0, Math.ceil((deadlineAt - now) / 1_000))

export const getCityImagePath = (cityLevel: CityLevel): string => {
  if (cityLevel === 'critical' || cityLevel === 'declining') return '/images/new-city/backgrounds/city-overview-degraded.webp'
  if (cityLevel === 'improving' || cityLevel === 'prosperous') return '/images/new-city/backgrounds/city-overview-developed.webp'
  return '/images/new-city/backgrounds/city-overview-normal.webp'
}

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

/**
 * Where a student should land for a given room status - shared by the lobby
 * guard and the PRE-assessment page's post-submit routing so a student who
 * finishes an earlier step while the teacher has already moved the room
 * forward always lands on the correct current screen, never a stale one.
 */
export const resolveStudentRouteForStatus = (
  status: ClassroomRoomStatus | undefined,
  roomId: string,
): string => {
  if (status === 'role-draw') return `/role-draw/${roomId}`
  if (status && ['playing', 'round-result', 'crisis-intro', 'crisis-playing', 'crisis-result'].includes(status)) {
    return `/game/${roomId}`
  }
  if (status === 'game-result' || status === 'finished') return `/result/${roomId}`
  return `/lobby/${roomId}`
}

/**
 * The lobby page's routing guard, as a pure decision: where (if anywhere) a
 * student on /lobby must be sent instead of staying there. Returns `null`
 * to mean "stay on the lobby page as normal."
 *
 * PRE only gates once the teacher has opened it (`preAssessmentOpened`).
 * Before that, students simply follow the room's status like any other step
 * - Join always lands on Lobby, and the room cannot leave 'lobby' status at
 * all until PRE has been opened (enforced by startGame's own precondition),
 * so there is nothing to gate yet. Once opened, an incomplete student must
 * not slip into role-draw/playing/crisis/game-result just by navigating to
 * /lobby after the teacher has advanced the room - 'finished' remains the
 * one deliberate exception, since a closed room is a dead end with no game
 * to route to afterward and a stale student must never be trapped filling
 * PRE for it.
 */
export const resolveLobbyGuardRoute = (
  status: ClassroomRoomStatus | undefined,
  preAssessmentOpened: boolean,
  hasCompletedPreAssessment: boolean,
  roomId: string,
): string | null => {
  if (status === 'finished') return resolveStudentRouteForStatus(status, roomId)
  if (preAssessmentOpened && !hasCompletedPreAssessment) return `/assessment/pre/${roomId}`
  if (status === 'lobby' && hasCompletedPreAssessment) return `/assessment/pre/${roomId}`
  const statusRoute = resolveStudentRouteForStatus(status, roomId)
  return statusRoute === `/lobby/${roomId}` ? null : statusRoute
}

/**
 * How many of the CURRENT players have a matching PRE submission, matched
 * by playerId rather than a raw document count - so a stale/orphaned
 * assessment record (e.g. from a player who left) can never inflate the
 * teacher's completion count above the size of the actual roster.
 */
export const countCompletedPreAssessments = (
  players: readonly ClassroomPlayer[],
  assessments: readonly ClassroomPreAssessment[],
): number => {
  const assessedPlayerIds = new Set(assessments.map((assessment) => assessment.playerId))
  return players.filter((player) => assessedPlayerIds.has(player.playerId)).length
}

/**
 * The POST-assessment route's guard, as a pure decision: where (if
 * anywhere) a student on /assessment/post/:roomCode must be sent instead
 * of staying there. Mirrors resolveLobbyGuardRoute's shape.
 *
 * POST/Reflection are only ever appropriate once the activity is truly
 * over (`status === 'finished'`) - every earlier status (including
 * 'game-result', where the teacher may still choose to continue playing)
 * must bounce the student to wherever the room actually is, exactly like
 * every other status-based redirect in this app. Returns `null` to mean
 * "stay on this page."
 */
export const resolvePostAssessmentGuardRoute = (
  status: ClassroomRoomStatus | undefined,
  roomId: string,
): string | null => (status === 'finished' ? null : resolveStudentRouteForStatus(status, roomId))

export type AssessmentFlowStep = 'post' | 'reflection' | 'complete'

/**
 * Pure derivation of which step the combined POST+Reflection page should
 * show. Existing server records drive refresh/resume, while a resolved
 * active write may acknowledge the same immutable record immediately
 * without waiting for a second listener delivery.
 */
export const resolveAssessmentFlowStep = (
  hasPostAssessment: boolean,
  hasReflection: boolean,
  hasPostWriteAcknowledgement = false,
  hasReflectionWriteAcknowledgement = false,
): AssessmentFlowStep => {
  if (!hasPostAssessment && !hasPostWriteAcknowledgement) return 'post'
  if (!hasReflection && !hasReflectionWriteAcknowledgement) return 'reflection'
  return 'complete'
}

export const hasBalancedLockedRoles = (players: readonly ClassroomPlayer[]): boolean => {
  if (players.some((player) => player.roleId === null)) return false
  const counts = new Map<RoleId, number>()
  for (const player of players) {
    if (player.roleId) counts.set(player.roleId, (counts.get(player.roleId) ?? 0) + 1)
  }
  const values = [...counts.values()]
  return values.length > 0 && Math.max(...values) - Math.min(...values) <= 1
}
