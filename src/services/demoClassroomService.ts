import { scoreClassroomRound } from '../domain/cityScoring'
import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import {
  assignRolesForCycle,
  createBalancedRoleOffsets,
  createRoleRotation,
  MAX_GAME_CYCLES,
  type QuestionNumber,
} from '../domain/ourCity'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import type { ClassroomGameService } from './classroomGameService'
import { createClassroomAnswerId, createClassroomRoundId } from './classroomFirestore'

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

const STORAGE_KEY = 'our_city_classroom_demo_state_v2'
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
      status: 'lobby',
      gameCycle: 0,
      completedGameCount: 0,
      currentQuestionNumber: 0,
      questionDurationSec,
      questionStartedAt: null,
      questionDeadlineAt: null,
      lockedPlayerCount: 0,
      cityScore: 500,
      cityLevel: 'neutral',
      integrityTotal: 0,
      corruptionTotal: 0,
      timeoutTotal: 0,
      roleRotation: [],
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
    if (roomState.room.status !== 'lobby') throw new Error('ผู้ใช้:เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('ผู้ใช้:กรุณากรอกชื่อ')
    const nicknameKey = nickname.toLocaleLowerCase('th')
    const existing = Object.values(roomState.players).find((player) => player.nicknameKey === nicknameKey)
    if (existing) {
      if (existing.ownerUid === ownerUid) return clone(existing)
      throw new Error('ผู้ใช้:ชื่อนี้ถูกใช้แล้วในห้อง')
    }
    const now = Date.now()
    const player: ClassroomPlayer = {
      playerId: `player-${createId()}`,
      nickname,
      nicknameKey,
      ownerUid,
      roleId: null,
      roleHistory: [],
      roleOffset: null,
      joinedAt: now,
      lastSeenAt: now,
    }
    roomState.players[player.playerId] = player
    roomState.room.updatedAt = now
    writeState(state)
    return clone(player)
  }

  subscribeRoom(roomId: string, listener: (room: ClassroomRoom | null) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(readState().rooms[roomId.toUpperCase()]?.room ?? null, listener)
    emit()
    return listen(emit)
  }

  subscribePlayers(roomId: string, listener: (players: ClassroomPlayer[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(
      Object.values(readState().rooms[roomId.toUpperCase()]?.players ?? {}).sort((left, right) => left.joinedAt - right.joinedAt),
      listener,
    )
    emit()
    return listen(emit)
  }

  subscribePlayer(roomId: string, playerId: string, listener: (player: ClassroomPlayer | null) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(readState().rooms[roomId.toUpperCase()]?.players[playerId] ?? null, listener)
    emit()
    return listen(emit)
  }

  subscribeQuestions(roomId: string, listener: (questions: PublicRoomQuestion[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(
      Object.values(readState().rooms[roomId.toUpperCase()]?.questions ?? {}).sort(
        (left, right) => left.questionNumber - right.questionNumber || left.roleId.localeCompare(right.roleId),
      ),
      listener,
    )
    emit()
    return listen(emit)
  }

  subscribeAnswers(roomId: string, listener: (answers: ClassroomAnswerRecord[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(Object.values(readState().rooms[roomId.toUpperCase()]?.answers ?? {}), listener)
    emit()
    return listen(emit)
  }

  subscribePlayerAnswers(roomId: string, playerId: string, _ownerUid: string, listener: (answers: ClassroomAnswerRecord[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(
      Object.values(readState().rooms[roomId.toUpperCase()]?.answers ?? {}).filter((answer) => answer.playerId === playerId),
      listener,
    )
    emit()
    return listen(emit)
  }

  subscribeRounds(roomId: string, listener: (rounds: ClassroomRoundResult[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(
      Object.values(readState().rooms[roomId.toUpperCase()]?.rounds ?? {}).sort(
        (left, right) => left.gameCycle - right.gameCycle || left.questionNumber - right.questionNumber,
      ),
      listener,
    )
    emit()
    return listen(emit)
  }

  async startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'lobby') throw new Error('ผู้ใช้:เกมเริ่มแล้ว')
    if (snapshot.roomId !== roomState.room.roomId) throw new Error('ผู้ใช้:snapshot ไม่ตรงกับห้อง')
    const players = Object.values(roomState.players)
    if (players.length === 0) throw new Error('ผู้ใช้:ยังไม่มีนักเรียนในห้อง')
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
    for (const player of assignRolesForCycle(players, roleRotation, 0, offsets)) roomState.players[player.playerId] = player
    roomState.questions = Object.fromEntries(snapshot.publicQuestions.map((question) => [question.questionId, clone(question)]))
    Object.assign(roomState.room, {
      status: 'role-draw',
      roleRotation,
      currentQuestionNumber: 0,
      questionStartedAt: null,
      questionDeadlineAt: null,
      lockedPlayerCount: players.length,
      updatedAt: Date.now(),
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
  }

  async beginQuestions(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'role-draw') throw new Error('ผู้ใช้:ยังไม่อยู่ในหน้าสุ่มอาชีพ')
    const now = Date.now()
    Object.assign(roomState.room, {
      status: 'playing',
      currentQuestionNumber: 1,
      questionStartedAt: now,
      questionDeadlineAt: now + roomState.room.questionDurationSec * 1_000,
      updatedAt: now,
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
    return clone(roomState.room)
  }

  async submitAnswer(roomId: string, playerId: string, ownerUid: string, questionNumber: number, questionId: string, choiceId: string): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    const player = roomState.players[playerId]
    if (!player || player.ownerUid !== ownerUid) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
    if (roomState.room.status !== 'playing' || roomState.room.currentQuestionNumber !== questionNumber) {
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
    const answerId = createClassroomAnswerId(roomState.room.gameCycle, playerId, questionId)
    if (roomState.answers[answerId]) return
    roomState.answers[answerId] = {
      answerId,
      roomId: roomState.room.roomId,
      playerId,
      ownerUid,
      gameCycle: roomState.room.gameCycle,
      questionNumber: questionNumber as QuestionNumber,
      questionId,
      choiceId,
      submittedAt: Date.now(),
    }
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }

  async closeQuestion(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<ClassroomRoundResult> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    const questionNumber = roomState.room.currentQuestionNumber
    if (questionNumber === 0) throw new Error('ผู้ใช้:ยังไม่ได้เริ่มคำถาม')
    const roundId = createClassroomRoundId(roomState.room.gameCycle, questionNumber)
    const existing = roomState.rounds[roundId]
    if (existing) return clone(existing)
    if (roomState.room.status !== 'playing') throw new Error('ผู้ใช้:คำถามไม่ได้เปิดอยู่')
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
      Object.values(roomState.answers).filter((answer) => answer.gameCycle === roomState.room.gameCycle),
    )
    const round: ClassroomRoundResult = { ...result, gameCycle: roomState.room.gameCycle, finalizedAt: Date.now() }
    roomState.rounds[roundId] = round
    Object.assign(roomState.room, {
      status: 'round-result',
      cityScore: result.newCityScore,
      cityLevel: result.cityLevel,
      integrityTotal: roomState.room.integrityTotal + result.integrityCount,
      corruptionTotal: roomState.room.corruptionTotal + result.corruptionCount,
      timeoutTotal: roomState.room.timeoutTotal + result.timeoutCount,
      updatedAt: Date.now(),
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
    return clone(round)
  }

  async openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'round-result') throw new Error('ผู้ใช้:กรุณาปิดคำถามปัจจุบันก่อน')
    if (roomState.room.currentQuestionNumber >= 10) throw new Error('ผู้ใช้:ครบ 10 ข้อแล้ว กรุณาดูผลเมือง')
    const now = Date.now()
    roomState.room.currentQuestionNumber = (roomState.room.currentQuestionNumber + 1) as QuestionNumber
    roomState.room.status = 'playing'
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
    if (roomState.room.currentQuestionNumber !== 10 || roomState.room.status !== 'round-result') {
      throw new Error('ผู้ใช้:เกมยังไม่จบครบ 10 ข้อ')
    }
    roomState.room.status = 'game-result'
    roomState.room.completedGameCount = roomState.room.gameCycle + 1
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }

  async continueCityProgress(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'game-result') throw new Error('ผู้ใช้:เกมชุดปัจจุบันยังไม่จบ')
    if (roomState.room.gameCycle >= MAX_GAME_CYCLES - 1) throw new Error('ผู้ใช้:นักเรียนทดลองครบทั้ง 8 อาชีพแล้ว')
    const nextCycle = roomState.room.gameCycle + 1
    const players = Object.values(roomState.players)
    for (const player of assignRolesForCycle(players, roomState.room.roleRotation, nextCycle)) {
      roomState.players[player.playerId] = player
    }
    Object.assign(roomState.room, {
      gameCycle: nextCycle,
      status: 'role-draw',
      currentQuestionNumber: 0,
      questionStartedAt: null,
      questionDeadlineAt: null,
      updatedAt: Date.now(),
    } satisfies Partial<ClassroomRoom>)
    writeState(state)
    return clone(roomState.room)
  }

  async endActivity(roomId: string, teacherSessionId: string): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'game-result') throw new Error('ผู้ใช้:เกมชุดปัจจุบันยังไม่จบ')
    roomState.room.status = 'finished'
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }
}
