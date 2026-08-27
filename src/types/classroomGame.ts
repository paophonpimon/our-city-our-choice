import type { PublicRoomQuestion } from '../domain/classroomQuestions'
import type { CityLevel, QuestionNumber, RoleId } from '../domain/ourCity'
import type { RoundScoreResult } from '../domain/cityScoring'
import type { BuildingLevels, BuildingScores } from '../domain/cityBuildings'
import type { CrisisEventId, CrisisEventIndex, CrisisEventScoreResult } from '../domain/cityCrisisEvents'

export type ClassroomRoomStatus =
  | 'lobby'
  | 'role-draw'
  | 'playing'
  | 'round-result'
  | 'crisis-intro'
  | 'crisis-playing'
  | 'crisis-result'
  | 'game-result'
  | 'finished'

export type ClassSection = string

export const isClassSection = (value: unknown): value is ClassSection =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 20

export interface ClassroomRoom {
  roomId: string
  teacherSessionId: string
  status: ClassroomRoomStatus
  gameCycle: number
  completedGameCount: number
  currentQuestionNumber: QuestionNumber | 0
  currentCrisisEventIndex: CrisisEventIndex | 0
  currentCrisisEventId: CrisisEventId | null
  questionDurationSec: number
  questionStartedAt: number | null
  questionDeadlineAt: number | null
  lockedPlayerCount: number
  cityScore: number
  cityLevel: CityLevel
  buildingLevels?: BuildingLevels
  buildingScores?: BuildingScores
  integrityTotal: number
  corruptionTotal: number
  timeoutTotal: number
  /** Teacher-published, whitelist-only aggregate for permanently readable finished results. */
  publicLearningEvidence?: ClassroomPublicLearningEvidence | null
  roleRotation: RoleId[]
  /**
   * Teacher-controlled, one-way false -> true gate for the PRE assessment.
   * Not a new room status: students keep following the existing status flow
   * (Join -> Lobby) until the teacher opens PRE, at which point incomplete
   * students are routed to it. A room created before this field existed has
   * no value here at all and must be read as false, never as an error.
   */
  preAssessmentOpened: boolean
  createdAt: number
  updatedAt: number
}

export interface ClassroomPublicObservationEvidence {
  o1: ObservationScaleValue
  o2: ObservationScaleValue
  o3: ObservationScaleValue
  o4: ObservationScaleValue
  mean: number
}

export interface ClassroomPublicLearningEvidence {
  schemaVersion: 1
  participantCount: number
  preCompleteCount: number
  postCompleteCount: number
  matchedCount: number
  preMean: number | null
  postMean: number | null
  meanGainFivePoint: number | null
  improvedCount: number
  unchangedCount: number
  decreasedCount: number
  improvedPercent: number | null
  unchangedPercent: number | null
  decreasedPercent: number | null
  reflectionCompleteCount: number
  reflectionCompletionPercent: number | null
  observation: ClassroomPublicObservationEvidence | null
}

export interface ClassroomPlayer {
  playerId: string
  nickname: string
  nicknameKey: string
  classSection: ClassSection | null
  studentNumber: number | null
  ownerUid: string
  roleId: RoleId | null
  roleHistory: RoleId[]
  roleOffset: number | null
  joinedAt: number
  lastSeenAt: number
}

export interface ClassroomQuestionAnswerRecord {
  recordType?: 'question'
  answerId: string
  roomId: string
  playerId: string
  ownerUid: string
  gameCycle: number
  questionNumber: QuestionNumber
  questionId: string
  choiceId: string
  submittedAt: number
}

export interface ClassroomCrisisAnswerRecord {
  recordType: 'crisis'
  answerId: string
  roomId: string
  playerId: string
  ownerUid: string
  gameCycle: number
  eventIndex: CrisisEventIndex
  eventId: CrisisEventId
  roleId: RoleId
  choiceId: string
  submittedAt: number
}

export type ClassroomAnswerRecord = ClassroomQuestionAnswerRecord | ClassroomCrisisAnswerRecord

export const isQuestionAnswerRecord = (answer: ClassroomAnswerRecord): answer is ClassroomQuestionAnswerRecord =>
  answer.recordType !== 'crisis'

export const isCrisisAnswerRecord = (answer: ClassroomAnswerRecord): answer is ClassroomCrisisAnswerRecord =>
  answer.recordType === 'crisis'

export interface ClassroomRoundResult extends RoundScoreResult {
  gameCycle: number
  finalizedAt: number
}

export interface ClassroomCrisisResult extends CrisisEventScoreResult {
  gameCycle: number
  finalizedAt: number
}

export type PersonalDecisionOutcome = 'integrity' | 'corruption' | 'timeout'

/**
 * Private, resolved result for one student's decision. This record is written
 * by the trusted teacher resolution flow and deliberately contains no choice
 * id, answer key, or score impact.
 */
export interface ClassroomPersonalDecisionResult {
  decisionId: string
  roomId: string
  playerId: string
  ownerUid: string
  gameCycle: number
  roleId: RoleId
  source: 'question' | 'crisis'
  sequenceNumber: number
  outcome: PersonalDecisionOutcome
  resolvedAt: number
}

/**
 * One student's PRE assessment submission. Deliberately minimal: no
 * nickname/classSection/studentNumber duplication (read the player record
 * for that), and no derived preTotal/preMean (computed later from
 * `responses` when needed - see src/domain/assessment.ts).
 */
export interface ClassroomPreAssessment {
  schemaVersion: 1
  recordType: 'pre'
  roomId: string
  playerId: string
  ownerUid: string
  responses: number[]
  submittedAt: number
}

/**
 * One student's POST assessment submission - same shape as PRE, same 10
 * statements and 1-5 scale, stored as its own immutable record so PRE
 * evidence is never overwritten. No derived postTotal/postMean/gain here;
 * those are computed later from the raw PRE/POST responses when needed.
 */
export interface ClassroomPostAssessment {
  schemaVersion: 1
  recordType: 'post'
  roomId: string
  playerId: string
  ownerUid: string
  responses: number[]
  submittedAt: number
}

/**
 * One student's open-ended reflection (R1-R3). Deliberately unscored: no
 * theme, tag, or derived field is stored here - just the student's
 * original wording, exactly as submitted.
 */
export interface ClassroomReflection {
  schemaVersion: 1
  recordType: 'reflection'
  roomId: string
  playerId: string
  ownerUid: string
  r1: string
  r2: string
  r3: string
  submittedAt: number
}

export type ObservationScaleValue = 1 | 2 | 3 | 4

/**
 * Teacher-owned classroom observation evidence (O1-O4, Phase B2a).
 * Room-level single record, created once and immutable.
 */
export interface ClassroomTeacherObservation {
  schemaVersion: 1
  recordType: 'observation'
  roomId: string
  teacherSessionId: string
  o1: ObservationScaleValue
  o2: ObservationScaleValue
  o3: ObservationScaleValue
  o4: ObservationScaleValue
  notes: string
  submittedAt: number
}

/** Any record stored under a room's `assessments` collection/map. */
export type ClassroomAssessmentRecord =
  | ClassroomPreAssessment
  | ClassroomPostAssessment
  | ClassroomReflection
  | ClassroomTeacherObservation

export interface ClassroomJoinInput {
  roomId: string
  nickname: string
  classSection: ClassSection
  studentNumber: number
}

export interface ClassroomTeacherSession {
  roomId: string
  role: 'teacher'
  sessionVersion: 2
}

export interface ClassroomStudentSession {
  roomId: string
  playerId: string
  nickname: string
  classSection: ClassSection
  studentNumber: number
  role: 'student'
  sessionVersion: 1
}

export const compareClassroomPlayersByStudentNumber = (left: ClassroomPlayer, right: ClassroomPlayer): number => {
  const numberDifference = (left.studentNumber ?? Number.MAX_SAFE_INTEGER) - (right.studentNumber ?? Number.MAX_SAFE_INTEGER)
  if (numberDifference !== 0) return numberDifference
  const sectionDifference = (left.classSection ?? '').localeCompare(right.classSection ?? '', 'th', { numeric: true, sensitivity: 'base' })
  if (sectionDifference !== 0) return sectionDifference
  return left.nickname.localeCompare(right.nickname, 'th')
}

export type ClassroomUnsubscribe = () => void

export type { PublicRoomQuestion }
