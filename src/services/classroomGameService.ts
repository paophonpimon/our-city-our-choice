import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomPostAssessment,
  ClassroomPreAssessment,
  ClassroomReflection,
  ClassroomRoom,
  ClassroomCrisisResult,
  ClassroomPersonalDecisionResult,
  ClassroomRoundResult,
  ClassroomUnsubscribe,
  PublicRoomQuestion,
} from '../types/classroomGame'
import type { ReflectionInput } from '../domain/assessment'

export interface ClassroomGameService {
  readonly isDemo: boolean
  ensureSession(): Promise<string>
  createRoom(teacherSessionId: string, questionDurationSec: number): Promise<ClassroomRoom>
  joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer>
  submitPreAssessment(roomId: string, playerId: string, ownerUid: string, responses: number[]): Promise<void>
  subscribePreAssessment(
    roomId: string,
    playerId: string,
    listener: (assessment: ClassroomPreAssessment | null) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  /** Teacher-only, room-wide PRE roster. Caller is responsible for only ever subscribing while room.status === 'lobby' && preAssessmentOpened === true. */
  subscribeAssessments(
    roomId: string,
    listener: (assessments: ClassroomPreAssessment[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  /** One-way false -> true. Requires teacher ownership and room.status === 'lobby'. Idempotent: a repeat call while already open is a safe no-op. */
  openPreAssessment(roomId: string, teacherSessionId: string): Promise<void>
  /** Isolated from room status, exactly like PRE - create-once, immutable. A repeat call for the same player is a safe no-op, never an error. */
  submitPostAssessment(roomId: string, playerId: string, ownerUid: string, responses: number[]): Promise<void>
  subscribePostAssessment(
    roomId: string,
    playerId: string,
    listener: (assessment: ClassroomPostAssessment | null) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  /** Isolated from room status, exactly like PRE - create-once, immutable. A repeat call for the same player is a safe no-op, never an error. */
  submitReflection(roomId: string, playerId: string, ownerUid: string, reflection: ReflectionInput): Promise<void>
  subscribeReflection(
    roomId: string,
    playerId: string,
    listener: (reflection: ClassroomReflection | null) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribeRoom(
    roomId: string,
    listener: (room: ClassroomRoom | null) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribePlayers(
    roomId: string,
    listener: (players: ClassroomPlayer[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribePlayer(
    roomId: string,
    playerId: string,
    listener: (player: ClassroomPlayer | null) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribeQuestions(
    roomId: string,
    listener: (questions: PublicRoomQuestion[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribeAnswers(
    roomId: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribePlayerAnswers(
    roomId: string,
    playerId: string,
    ownerUid: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribeRounds(
    roomId: string,
    listener: (rounds: ClassroomRoundResult[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribeCrisisResults(
    roomId: string,
    listener: (results: ClassroomCrisisResult[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  subscribePersonalDecisionResults(
    roomId: string,
    playerId: string,
    ownerUid: string,
    listener: (results: ClassroomPersonalDecisionResult[]) => void,
    onError: (message: string) => void,
  ): ClassroomUnsubscribe
  startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void>
  beginQuestions(roomId: string, teacherSessionId: string): Promise<ClassroomRoom>
  submitAnswer(
    roomId: string,
    playerId: string,
    ownerUid: string,
    questionNumber: number,
    questionId: string,
    choiceId: string,
  ): Promise<void>
  closeQuestion(
    roomId: string,
    teacherSessionId: string,
    snapshot: RoomQuestionSnapshot,
  ): Promise<ClassroomRoundResult>
  beginCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomRoom>
  submitCrisisAnswer(roomId: string, playerId: string, ownerUid: string, choiceId: string): Promise<void>
  closeCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomCrisisResult>
  openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom>
  finishGame(roomId: string, teacherSessionId: string): Promise<void>
  continueCityProgress(roomId: string, teacherSessionId: string): Promise<ClassroomRoom>
  endActivity(roomId: string, teacherSessionId: string): Promise<void>
}

export const classroomFriendlyError = (error: unknown): string => {
  if (error instanceof Error && error.message.startsWith('ผู้ใช้:')) return error.message.slice('ผู้ใช้:'.length)
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'ส่งคำตอบไม่สำเร็จ อาจหมดเวลาหรือข้อนี้ปิดรับคำตอบแล้ว หากยังอยู่ในเวลาให้รีเฟรชหน้าแล้วลองใหม่'
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบสัญญาณแล้วลองใหม่'
  }
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}
