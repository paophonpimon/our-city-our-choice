import type { PublicRoomQuestion } from '../domain/classroomQuestions'
import type { CityLevel, QuestionNumber, RoleId } from '../domain/ourCity'
import type { RoundScoreResult } from '../domain/cityScoring'

export type ClassroomRoomStatus = 'waiting' | 'question' | 'question-closed' | 'finished' | 'closed'

export interface ClassroomRoom {
  roomId: string
  teacherSessionId: string
  status: ClassroomRoomStatus
  currentQuestionNumber: QuestionNumber
  questionDurationSec: number
  questionStartedAt: number | null
  questionDeadlineAt: number | null
  lockedPlayerCount: number
  cityScore: number
  cityLevel: CityLevel
  createdAt: number
  updatedAt: number
}

export interface ClassroomPlayer {
  playerId: string
  nickname: string
  nicknameKey: string
  ownerUid: string
  roleId: RoleId | null
  joinedAt: number
  lastSeenAt: number
}

export interface ClassroomAnswerRecord {
  answerId: string
  roomId: string
  playerId: string
  ownerUid: string
  questionNumber: QuestionNumber
  questionId: string
  choiceId: string
  submittedAt: number
}

export interface ClassroomRoundResult extends RoundScoreResult {
  finalizedAt: number
}

export interface ClassroomJoinInput {
  roomId: string
  nickname: string
}

export interface ClassroomTeacherSession {
  roomId: string
  role: 'teacher'
  sessionVersion: 1
}

export interface ClassroomStudentSession {
  roomId: string
  playerId: string
  nickname: string
  role: 'student'
  sessionVersion: 1
}

export type ClassroomUnsubscribe = () => void

export type { PublicRoomQuestion }
