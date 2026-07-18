import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  ClassroomUnsubscribe,
  PublicRoomQuestion,
} from '../types/classroomGame'

export interface ClassroomGameService {
  readonly isDemo: boolean
  ensureSession(): Promise<string>
  createRoom(teacherSessionId: string, questionDurationSec: number): Promise<ClassroomRoom>
  joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer>
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
  startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void>
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
  openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom>
  finishGame(roomId: string, teacherSessionId: string): Promise<void>
}

export const classroomFriendlyError = (error: unknown): string => {
  if (error instanceof Error && error.message.startsWith('ผู้ใช้:')) return error.message.slice('ผู้ใช้:'.length)
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'ไม่มีสิทธิ์ดำเนินการหรือเซสชันหมดอายุ กรุณาเข้าห้องใหม่'
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบสัญญาณแล้วลองใหม่'
  }
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}
