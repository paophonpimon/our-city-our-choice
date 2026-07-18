import { ROLE_IDS, type CityLevel, type QuestionNumber, type RoleId } from './ourCity'
import type { RoomTrustedQuestion } from './classroomQuestions'

export const SCORE_POLICY = {
  integrity: 50,
  corruption: -100,
  timeout: -20,
  initialCityScore: 500,
  minCityScore: 0,
  maxCityScore: 1000,
} as const

export const LOCATION_BY_ROLE = {
  doctor: 'hospital',
  municipal: 'municipal-office',
  police: 'police-station',
  teacher: 'school',
  merchant: 'market',
  contractor: 'construction',
  student: 'school',
  journalist: 'news-office',
} as const satisfies Record<RoleId, string>

export type LocationId = (typeof LOCATION_BY_ROLE)[RoleId]
export type AnswerOutcome = 'integrity' | 'corruption' | 'timeout'

export interface LockedPlayer {
  playerId: string
  roleId: RoleId
}

export interface SubmittedAnswer {
  playerId: string
  questionId: string
  choiceId: string
}

export interface LocationSummary {
  integrityCount: number
  corruptionCount: number
  timeoutCount: number
  participantCount: number
  scoreTotal: number
  scoreAverage: number
}

export interface RoundScoreResult {
  questionNumber: QuestionNumber
  integrityCount: number
  corruptionCount: number
  timeoutCount: number
  roundTotal: number
  roundAverage: number
  previousCityScore: number
  newCityScore: number
  cityLevel: CityLevel
  locationSummaries: Record<LocationId, LocationSummary>
}

const emptyLocationSummary = (): LocationSummary => ({
  integrityCount: 0,
  corruptionCount: 0,
  timeoutCount: 0,
  participantCount: 0,
  scoreTotal: 0,
  scoreAverage: 0,
})

const emptyLocationSummaries = (): Record<LocationId, LocationSummary> => {
  const locations = new Set<LocationId>(ROLE_IDS.map((roleId) => LOCATION_BY_ROLE[roleId]))
  return Object.fromEntries([...locations].map((locationId) => [locationId, emptyLocationSummary()])) as Record<
    LocationId,
    LocationSummary
  >
}

export const clampCityScore = (score: number): number =>
  Math.min(SCORE_POLICY.maxCityScore, Math.max(SCORE_POLICY.minCityScore, score))

export const getCityLevel = (score: number): CityLevel => {
  const clamped = clampCityScore(score)
  if (clamped <= 199) return 'critical'
  if (clamped <= 399) return 'declining'
  if (clamped <= 599) return 'neutral'
  if (clamped <= 799) return 'improving'
  return 'prosperous'
}

export const scoreClassroomRound = (
  previousCityScore: number,
  questionNumber: QuestionNumber,
  lockedPlayers: readonly LockedPlayer[],
  trustedQuestions: readonly RoomTrustedQuestion[],
  submittedAnswers: readonly SubmittedAnswer[],
): RoundScoreResult => {
  if (lockedPlayers.length === 0) throw new Error('lockedPlayerCount must be greater than zero')

  const questionsByRole = new Map(
    trustedQuestions
      .filter((question) => question.questionNumber === questionNumber)
      .map((question) => [question.roleId, question]),
  )
  const firstAnswerByKey = new Map<string, SubmittedAnswer>()
  for (const answer of submittedAnswers) {
    const key = `${answer.playerId}\u0000${answer.questionId}`
    if (!firstAnswerByKey.has(key)) firstAnswerByKey.set(key, answer)
  }

  const locationSummaries = emptyLocationSummaries()
  let integrityCount = 0
  let corruptionCount = 0
  let timeoutCount = 0
  let roundTotal = 0

  for (const player of lockedPlayers) {
    const question = questionsByRole.get(player.roleId)
    if (!question) throw new Error(`missing question ${questionNumber} for role ${player.roleId}`)
    const answer = firstAnswerByKey.get(`${player.playerId}\u0000${question.questionId}`)
    let outcome: AnswerOutcome = 'timeout'
    let impact: number = SCORE_POLICY.timeout

    if (answer && question.choices.some((choice) => choice.id === answer.choiceId)) {
      outcome = answer.choiceId === question.integrityChoiceId ? 'integrity' : 'corruption'
      impact = outcome === 'integrity' ? SCORE_POLICY.integrity : SCORE_POLICY.corruption
    }

    if (outcome === 'integrity') integrityCount += 1
    else if (outcome === 'corruption') corruptionCount += 1
    else timeoutCount += 1
    roundTotal += impact

    const location = locationSummaries[LOCATION_BY_ROLE[player.roleId]]
    location.participantCount += 1
    location.scoreTotal += impact
    if (outcome === 'integrity') location.integrityCount += 1
    else if (outcome === 'corruption') location.corruptionCount += 1
    else location.timeoutCount += 1
  }

  for (const summary of Object.values(locationSummaries)) {
    summary.scoreAverage = summary.participantCount === 0 ? 0 : summary.scoreTotal / summary.participantCount
  }

  const roundAverage = roundTotal / lockedPlayers.length
  const newCityScore = clampCityScore(previousCityScore + roundAverage)
  return {
    questionNumber,
    integrityCount,
    corruptionCount,
    timeoutCount,
    roundTotal,
    roundAverage,
    previousCityScore,
    newCityScore,
    cityLevel: getCityLevel(newCityScore),
    locationSummaries,
  }
}
