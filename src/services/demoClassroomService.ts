import { scoreClassroomRound } from '../domain/cityScoring'
import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import { assignBalancedRoles, type QuestionNumber } from '../domain/ourCity'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import type { ClassroomGameService } from './classroomGameService'
import { createClassroomAnswerId } from './classroomFirestore'

interface DemoClassroomRoomState {
  room: ClassroomRoom
  players: Record<string, ClassroomPlayer>
  questions: Record<string, PublicRoomQuestion>
  answers: Record<string, ClassroomAnswerRecord>
  rounds: Record<string, ClassroomRoundResult>
}

interface DemoClassroomState {
  rooms: Record<string, DemoClassroomRoomState>
}

const STORAGE_KEY = 'our_city_classroom_demo_state_v1'
const UPDATE_EVENT = 'our-city-classroom-demo-update'
let memoryState: DemoClassroomState = { rooms: {} }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const readState = (): DemoClassroomState => {
  if (!canUseStorage()) return clone(memoryState)
  const serialized = window.localStorage.getItem(STORAGE_KEY)
  if (!serialized) return { rooms: {} }
  try {
    return JSON.parse(serialized) as DemoClassroomState
  } catch {
    return { rooms: {} }
  }
}

const writeState = (state: DemoClassroomState): void => {
  memoryState = clone(state)
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

const listen = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) callback()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(UPDATE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(UPDATE_EVENT, callback)
  }
}

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14)

const createRoomId = (state: DemoClassroomState): string => {
  let roomId = ''
  do roomId = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X')
  while (state.rooms[roomId])
  return roomId
}

const getRoomState = (state: DemoClassroomState, roomId: string): DemoClassroomRoomState => {
  const roomState = state.rooms[roomId.toUpperCase()]
  if (!roomState) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
  return roomState
}

const assertTeacher = (room: ClassroomRoom, teacherSessionId: string): void => {
  if (room.teacherSessionId !== teacherSessionId) throw new Error('ผู้ใช้:ไม่มีสิทธิ์ควบคุมห้องนี้')
}

const emitNow = <T>(value: T, listener: (value: T) => void): void => listener(clone(value))

export const resetDemoClassroomStateForTests = (): void => {
  memoryState = { rooms: {} }
}

export class DemoClassroomGameService implements ClassroomGameService {
  readonly isDemo = true

  async ensureSession(): Promise<string> {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem('our_city_demo_uid_v1')
      if (existing) return existing
      const uid = `demo-${createId()}`
      sessionStorage.setItem('our_city_demo_uid_v1', uid)
      return uid
    }
    return `demo-${createId()}`
  }

  async createRoom(teacherSessionId: string, questionDurationSec: number): Promise<ClassroomRoom> {
    if (!Number.isInteger(questionDurationSec) || questionDurationSec <= 0) {
      throw new Error('ผู้ใช้:เวลาต่อคำถามต้องเป็นจำนวนเต็มบวก')
    }
    const state = readState()
    const roomId = createRoomId(state)
    const now = Date.now()
    const room: ClassroomRoom = {
      roomId,
      teacherSessionId,
      status: 'waiting',
      currentQuestionNumber: 1,
      questionDurationSec,
      questionStartedAt: null,
      questionDeadlineAt: null,
      lockedPlayerCount: 0,
      cityScore: 500,
      cityLevel: 'neutral',
      createdAt: now,
      updatedAt: now,
    }
    state.rooms[roomId] = { room, players: {}, questions: {}, answers: {}, rounds: {} }
    writeState(state)
    return clone(room)
  }

  async joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer> {
    const state = readState()
    const roomState = getRoomState(state, input.roomId.trim().toUpperCase())
    if (roomState.room.status !== 'waiting') throw new Error('ผู้ใช้:เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('ผู้ใช้:กรุณากรอกชื่อ')
    const nicknameKey = nickname.toLocaleLowerCase('th')
    if (Object.values(roomState.players).some((player) => player.nicknameKey === nicknameKey)) {
      throw new Error('ผู้ใช้:ชื่อนี้ถูกใช้แล้วในห้อง')
    }
    const now = Date.now()
    const player: ClassroomPlayer = {
      playerId: `player-${createId()}`,
      nickname,
      nicknameKey,
      ownerUid,
      roleId: null,
      joinedAt: now,
      lastSeenAt: now,
    }
    roomState.players[player.playerId] = player
    roomState.room.updatedAt = now
    writeState(state)
    return clone(player)
  }

  subscribeRoom(
    roomId: string,
    listener: (room: ClassroomRoom | null) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => emitNow(readState().rooms[roomId.toUpperCase()]?.room ?? null, listener)
    emit()
    return listen(emit)
  }

  subscribePlayers(
    roomId: string,
    listener: (players: ClassroomPlayer[]) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => {
      const players = Object.values(readState().rooms[roomId.toUpperCase()]?.players ?? {}).sort(
        (left, right) => left.joinedAt - right.joinedAt,
      )
      emitNow(players, listener)
    }
    emit()
    return listen(emit)
  }

  subscribePlayer(
    roomId: string,
    playerId: string,
    listener: (player: ClassroomPlayer | null) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => emitNow(readState().rooms[roomId.toUpperCase()]?.players[playerId] ?? null, listener)
    emit()
    return listen(emit)
  }

  subscribeQuestions(
    roomId: string,
    listener: (questions: PublicRoomQuestion[]) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => {
      const questions = Object.values(readState().rooms[roomId.toUpperCase()]?.questions ?? {}).sort(
        (left, right) => left.questionNumber - right.questionNumber || left.roleId.localeCompare(right.roleId),
      )
      emitNow(questions, listener)
    }
    emit()
    return listen(emit)
  }

  subscribeAnswers(
    roomId: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => emitNow(Object.values(readState().rooms[roomId.toUpperCase()]?.answers ?? {}), listener)
    emit()
    return listen(emit)
  }

  subscribePlayerAnswers(
    roomId: string,
    playerId: string,
    _ownerUid: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void =>
      emitNow(
        Object.values(readState().rooms[roomId.toUpperCase()]?.answers ?? {}).filter(
          (answer) => answer.playerId === playerId,
        ),
        listener,
      )
    emit()
    return listen(emit)
  }

  subscribeRounds(
    roomId: string,
    listener: (rounds: ClassroomRoundResult[]) => void,
    onError: (message: string) => void,
  ): () => void {
    void onError
    const emit = (): void => {
      const rounds = Object.values(readState().rooms[roomId.toUpperCase()]?.rounds ?? {}).sort(
        (left, right) => left.questionNumber - right.questionNumber,
      )
      emitNow(rounds, listener)
    }
    emit()
    return listen(emit)
  }

  async startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'waiting') throw new Error('ผู้ใช้:เกมเริ่มแล้ว')
    const players = Object.values(roomState.players)
    if (players.length === 0) throw new Error('ผู้ใช้:ยังไม่มีนักเรียนในห้อง')
    if (snapshot.roomId !== roomState.room.roomId) throw new Error('ผู้ใช้:snapshot ไม่ตรงกับห้อง')

    for (const player of assignBalancedRoles(players)) roomState.players[player.playerId] = player
    roomState.questions = Object.fromEntries(snapshot.publicQuestions.map((question) => [question.questionId, clone(question)]))
    const now = Date.now()
    Object.assign(roomState.room, {
      status: 'question',
      currentQuestionNumber: 1,
      questionStartedAt: now,
      questionDeadlineAt: now + roomState.room.questionDurationSec * 1_000,
      lockedPlayerCount: players.length,
      cityScore: 500,
      cityLevel: 'neutral',
      updatedAt: now,
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
  }

  async submitAnswer(
    roomId: string,
    playerId: string,
    ownerUid: string,
    questionNumber: number,
    questionId: string,
    choiceId: string,
  ): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    const player = roomState.players[playerId]
    if (!player || player.ownerUid !== ownerUid) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
    if (roomState.room.status !== 'question' || roomState.room.currentQuestionNumber !== questionNumber) {
      throw new Error('ผู้ใช้:คำถามข้อนี้ปิดแล้ว')
    }
    if (roomState.room.questionDeadlineAt !== null && Date.now() >= roomState.room.questionDeadlineAt) {
      throw new Error('ผู้ใช้:หมดเวลาตอบคำถามแล้ว')
    }
    const question = roomState.questions[questionId]
    if (!question || question.roleId !== player.roleId || question.questionNumber !== questionNumber) {
      throw new Error('ผู้ใช้:คำถามไม่ตรงกับอาชีพหรือข้อปัจจุบัน')
    }
    if (!question.choices.some((choice) => choice.id === choiceId)) throw new Error('ผู้ใช้:ไม่พบตัวเลือกนี้')
    const answerId = createClassroomAnswerId(playerId, questionId)
    if (roomState.answers[answerId]) return
    roomState.answers[answerId] = {
      answerId,
      roomId: roomState.room.roomId,
      playerId,
      ownerUid,
      questionNumber: questionNumber as QuestionNumber,
      questionId,
      choiceId,
      submittedAt: Date.now(),
    }
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }

  async closeQuestion(
    roomId: string,
    teacherSessionId: string,
    snapshot: RoomQuestionSnapshot,
  ): Promise<ClassroomRoundResult> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    const questionNumber = roomState.room.currentQuestionNumber
    const existing = roomState.rounds[String(questionNumber)]
    if (existing) return clone(existing)
    if (roomState.room.status !== 'question') throw new Error('ผู้ใช้:คำถามไม่ได้เปิดอยู่')
    if (snapshot.roomId !== roomState.room.roomId) throw new Error('ผู้ใช้:trusted snapshot ไม่ตรงกับห้อง')
    const lockedPlayers = Object.values(roomState.players).map((player) => {
      if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ')
      return { playerId: player.playerId, roleId: player.roleId }
    })
    const result = scoreClassroomRound(
      roomState.room.cityScore,
      questionNumber,
      lockedPlayers,
      snapshot.trustedQuestions,
      Object.values(roomState.answers),
    )
    const round: ClassroomRoundResult = { ...result, finalizedAt: Date.now() }
    roomState.rounds[String(questionNumber)] = round
    Object.assign(roomState.room, {
      status: 'question-closed',
      cityScore: result.newCityScore,
      cityLevel: result.cityLevel,
      updatedAt: Date.now(),
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
    return clone(round)
  }

  async openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'question-closed') throw new Error('ผู้ใช้:กรุณาปิดคำถามปัจจุบันก่อน')
    if (roomState.room.currentQuestionNumber >= 10) throw new Error('ผู้ใช้:ครบ 10 ข้อแล้ว กรุณาดูผลเมือง')
    const now = Date.now()
    roomState.room.currentQuestionNumber = (roomState.room.currentQuestionNumber + 1) as QuestionNumber
    roomState.room.status = 'question'
    roomState.room.questionStartedAt = now
    roomState.room.questionDeadlineAt = now + roomState.room.questionDurationSec * 1_000
    roomState.room.updatedAt = now
    writeState(state)
    return clone(roomState.room)
  }

  async finishGame(roomId: string, teacherSessionId: string): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.currentQuestionNumber !== 10 || roomState.room.status !== 'question-closed') {
      throw new Error('ผู้ใช้:เกมยังไม่จบครบ 10 ข้อ')
    }
    roomState.room.status = 'finished'
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }
}
