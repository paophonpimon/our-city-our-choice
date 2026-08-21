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
  roleRotation: RoleId[]
  createdAt: number
  updatedAt: number
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
