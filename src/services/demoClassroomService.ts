import { scoreClassroomRound } from '../domain/cityScoring'
import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import { assertPersonalOutcomeTotals, resolveCrisisPersonalResults, resolveQuestionPersonalResults } from '../domain/personalDecisionResults'
import {
  assignRolesForCycle,
  createBalancedRoleOffsets,
  createRoleRotation,
  MAX_GAME_CYCLES,
  type QuestionNumber,
} from '../domain/ourCity'
import { compareClassroomPlayersByStudentNumber, isClassSection } from '../types/classroomGame'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  ClassroomPersonalDecisionResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import type { ClassroomGameService } from './classroomGameService'
import { createClassroomAnswerId, createClassroomRoundId } from './classroomFirestore'
import { deriveBuildingLevels, INITIAL_BUILDING_SCORES, updateBuildingScores } from '../domain/cityBuildings'
import { getCrisisEvent, getCrisisEventAfterQuestion, scoreCrisisEvent } from '../domain/cityCrisisEvents'
import { isCrisisAnswerRecord, isQuestionAnswerRecord, type ClassroomCrisisResult } from '../types/classroomGame'
import { createCrisisAnswerId, createCrisisResultId } from './classroomFirestore'

interface DemoClassroomRoomState {
  room: ClassroomRoom
  players: Record<string, ClassroomPlayer>
  questions: Record<string, PublicRoomQuestion>
  answers: Record<string, ClassroomAnswerRecord>
  rounds: Record<string, ClassroomRoundResult>
  crisisResults: Record<string, ClassroomCrisisResult>
  personalResults: Record<string, ClassroomPersonalDecisionResult>
}

interface DemoClassroomState {
  rooms: Record<string, DemoClassroomRoomState>
}

const STORAGE_KEY = 'our_city_classroom_demo_state_v2'
const UPDATE_EVENT = 'our-city-classroom-demo-update'
const SHARED_STATE_PATH = '/__matana_demo_state'
let memoryState: DemoClassroomState = { rooms: {} }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const canUseStorage = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
const canShareState = (): boolean => canUseStorage() && import.meta.env.DEV

const pushSharedState = (state: DemoClassroomState): void => {
  if (!canShareState()) return
  void fetch(SHARED_STATE_PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch(() => undefined)
}

const pullSharedState = async (): Promise<boolean> => {
  if (!canShareState()) return false
  try {
    const response = await fetch(SHARED_STATE_PATH, { cache: 'no-store' })
    if (!response.ok) return false
    const payload = await response.json() as { state?: DemoClassroomState | null }
    if (!payload.state?.rooms) return false
    const localState = readState()
    const sharedRoomCount = Object.keys(payload.state.rooms).length
    const localRoomCount = Object.keys(localState.rooms).length
    if (sharedRoomCount === 0 && localRoomCount > 0) {
      pushSharedState(localState)
      return true
    }
    const serialized = JSON.stringify(payload.state)
    if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
      memoryState = clone(payload.state)
      window.localStorage.setItem(STORAGE_KEY, serialized)
    }
    return true
  } catch {
    return false
  }
}

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
  pushSharedState(state)
}

const listen = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) callback()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(UPDATE_EVENT, callback)
  const sync = async (): Promise<void> => {
    const hadSharedState = await pullSharedState()
    if (!hadSharedState) pushSharedState(readState())
    callback()
  }
  void sync()
  const syncTimer = window.setInterval(() => { void sync() }, 300)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(UPDATE_EVENT, callback)
    window.clearInterval(syncTimer)
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
  roomState.crisisResults ??= {}
  roomState.personalResults ??= {}
  roomState.room.currentCrisisEventIndex ??= 0
  roomState.room.currentCrisisEventId ??= null
  return roomState
}

const assertTeacher = (room: ClassroomRoom, teacherSessionId: string): void => {
  if (room.teacherSessionId !== teacherSessionId) throw new Error('ผู้ใช้:ไม่มีสิทธิ์ควบคุมห้องนี้')
}

const emitNow = <T>(value: T, listener: (value: T) => void): void => listener(clone(value))

export const resetDemoClassroomStateForTests = (): void => {
  memoryState = { rooms: {} }
}

/** Test-only escape hatch to simulate room documents persisted before a given field existed. */
export const setRoomFieldsForTests = (roomId: string, patch: Partial<ClassroomRoom>): void => {
  const state = readState()
  const roomState = getRoomState(state, roomId)
  Object.assign(roomState.room, patch)
  writeState(state)
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
      currentCrisisEventIndex: 0,
      currentCrisisEventId: null,
      questionDurationSec,
      questionStartedAt: null,
      questionDeadlineAt: null,
      lockedPlayerCount: 0,
      cityScore: 500,
      cityLevel: 'neutral',
      buildingScores: { ...INITIAL_BUILDING_SCORES },
      buildingLevels: deriveBuildingLevels(INITIAL_BUILDING_SCORES),
      integrityTotal: 0,
      corruptionTotal: 0,
      timeoutTotal: 0,
      roleRotation: [],
      createdAt: now,
      updatedAt: now,
    }
    state.rooms[roomId] = { room, players: {}, questions: {}, answers: {}, rounds: {}, crisisResults: {}, personalResults: {} }
    writeState(state)
    return clone(room)
  }

  async joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer> {
    await pullSharedState()
    const state = readState()
    const roomState = getRoomState(state, input.roomId.trim().toUpperCase())
    if (roomState.room.status === 'finished') throw new Error('ผู้ใช้:ห้องนี้ถูกยุติแล้ว กรุณาขอรหัสห้องใหม่จากครู')
    if (roomState.room.status !== 'lobby') throw new Error('ผู้ใช้:เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('ผู้ใช้:กรุณากรอกชื่อ')
    if (!isClassSection(input.classSection)) throw new Error('ผู้ใช้:กรุณากรอกชั้นเรียนให้ถูกต้อง')
    if (!Number.isInteger(input.studentNumber) || input.studentNumber <= 0) throw new Error('ผู้ใช้:เลขที่ต้องเป็นจำนวนเต็มบวก')
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
      classSection: input.classSection,
      studentNumber: input.studentNumber,
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
      Object.values(readState().rooms[roomId.toUpperCase()]?.players ?? {}).sort(compareClassroomPlayersByStudentNumber),
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

  subscribeCrisisResults(roomId: string, listener: (results: ClassroomCrisisResult[]) => void, onError: (message: string) => void): () => void {
    void onError
    const emit = (): void => emitNow(
      Object.values(readState().rooms[roomId.toUpperCase()]?.crisisResults ?? {}).sort(
        (left, right) => left.gameCycle - right.gameCycle || left.eventIndex - right.eventIndex,
      ),
      listener,
    )
    emit()
    return listen(emit)
  }

  subscribePersonalDecisionResults(roomId: string, playerId: string, ownerUid: string, listener: (results: ClassroomPersonalDecisionResult[]) => void, onError: (message: string) => void): () => void {
    try {
      const emit = (): void => emitNow(
        Object.values(getRoomState(readState(), roomId).personalResults)
          .filter((result) => result.playerId === playerId && result.ownerUid === ownerUid)
          .sort((left, right) => left.gameCycle - right.gameCycle || left.resolvedAt - right.resolvedAt),
        listener,
      )
      emit()
      return listen(emit)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
      return () => undefined
    }
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
      currentCrisisEventIndex: 0,
      currentCrisisEventId: null,
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
    const question = roomState.questions[questionId]
    if (!question || question.roleId !== player.roleId || question.questionNumber !== questionNumber) {
      throw new Error('ผู้ใช้:คำถามไม่ตรงกับอาชีพหรือข้อปัจจุบัน')
    }
    if (!question.choices.some((choice) => choice.id === choiceId)) throw new Error('ผู้ใช้:ไม่พบตัวเลือกนี้')
    const answerId = createClassroomAnswerId(roomState.room.gameCycle, playerId, questionId)
    if (roomState.answers[answerId]) return
    roomState.answers[answerId] = {
      recordType: 'question',
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
    const resolvedPlayers = Object.values(roomState.players).map((player) => {
      if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ')
      return { playerId: player.playerId, ownerUid: player.ownerUid, roleId: player.roleId }
    })
    const result = scoreClassroomRound(
      roomState.room.cityScore,
      questionNumber,
      resolvedPlayers,
      snapshot.trustedQuestions,
      Object.values(roomState.answers).filter(isQuestionAnswerRecord).filter((answer) => answer.gameCycle === roomState.room.gameCycle),
    )
    const round: ClassroomRoundResult = { ...result, gameCycle: roomState.room.gameCycle, finalizedAt: Date.now() }
    const personalResults = resolveQuestionPersonalResults(roomState.room.roomId, roomState.room.gameCycle, questionNumber, resolvedPlayers, snapshot, Object.values(roomState.answers).filter(isQuestionAnswerRecord).filter((answer) => answer.gameCycle === roomState.room.gameCycle), round.finalizedAt)
    assertPersonalOutcomeTotals(personalResults, result)
    for (const personalResult of personalResults) roomState.personalResults[personalResult.decisionId] = personalResult
    roomState.rounds[roundId] = round
    const buildingScores = updateBuildingScores(roomState.room.buildingScores, result.locationSummaries, roomState.room.buildingLevels)
    const buildingLevels = deriveBuildingLevels(buildingScores)
    Object.assign(roomState.room, {
      status: 'round-result',
      cityScore: result.newCityScore,
      cityLevel: result.cityLevel,
      buildingScores,
      buildingLevels,
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
    if (roomState.room.status !== 'round-result' && roomState.room.status !== 'crisis-result') throw new Error('ผู้ใช้:กรุณาปิดคำถามหรือเหตุการณ์ปัจจุบันก่อน')
    if (roomState.room.currentQuestionNumber >= 10) throw new Error('ผู้ใช้:ครบ 10 ข้อแล้ว กรุณาดูผลเมือง')
    const now = Date.now()
    if (roomState.room.status === 'round-result') {
      const crisis = getCrisisEventAfterQuestion(roomState.room.currentQuestionNumber)
      if (crisis) {
        roomState.room.status = 'crisis-intro'
        roomState.room.currentCrisisEventIndex = crisis.index
        roomState.room.currentCrisisEventId = crisis.id
        roomState.room.questionStartedAt = null
        roomState.room.questionDeadlineAt = null
        roomState.room.updatedAt = now
        writeState(state)
        return clone(roomState.room)
      }
    }
    roomState.room.currentQuestionNumber = (roomState.room.currentQuestionNumber + 1) as QuestionNumber
    roomState.room.status = 'playing'
    roomState.room.currentCrisisEventIndex = 0
    roomState.room.currentCrisisEventId = null
    roomState.room.questionStartedAt = now
    roomState.room.questionDeadlineAt = now + roomState.room.questionDurationSec * 1_000
    roomState.room.updatedAt = now
    writeState(state)
    return clone(roomState.room)
  }

  async beginCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const state = readState(); const roomState = getRoomState(state, roomId); assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.status !== 'crisis-intro' || !roomState.room.currentCrisisEventId) throw new Error('ผู้ใช้:ยังไม่อยู่ในช่วงแนะนำเหตุการณ์วิกฤต')
    const now = Date.now()
    Object.assign(roomState.room, { status: 'crisis-playing', questionStartedAt: now, questionDeadlineAt: now + roomState.room.questionDurationSec * 1_000, updatedAt: now } satisfies Partial<ClassroomRoom>)
    writeState(state); return clone(roomState.room)
  }

  async submitCrisisAnswer(roomId: string, playerId: string, ownerUid: string, choiceId: string): Promise<void> {
    const state = readState(); const roomState = getRoomState(state, roomId); const player = roomState.players[playerId]
    if (!player || player.ownerUid !== ownerUid || !player.roleId) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
    if (roomState.room.status !== 'crisis-playing' || !roomState.room.currentCrisisEventId || roomState.room.currentCrisisEventIndex === 0) throw new Error('ผู้ใช้:เหตุการณ์นี้ปิดแล้ว')
    const event = getCrisisEvent(roomState.room.currentCrisisEventId); const roleDilemma = event.dilemmas[player.roleId]
    if (!roleDilemma.choices.some((choice) => choice.id === choiceId)) throw new Error('ผู้ใช้:ไม่พบตัวเลือกนี้')
    const answerId = createCrisisAnswerId(roomState.room.gameCycle, playerId, event.id); if (roomState.answers[answerId]) return
    roomState.answers[answerId] = { recordType: 'crisis', answerId, roomId: roomState.room.roomId, playerId, ownerUid, gameCycle: roomState.room.gameCycle, eventIndex: event.index, eventId: event.id, roleId: player.roleId, choiceId, submittedAt: Date.now() }
    roomState.room.updatedAt = Date.now(); writeState(state)
  }

  async closeCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomCrisisResult> {
    const state = readState(); const roomState = getRoomState(state, roomId); assertTeacher(roomState.room, teacherSessionId)
    if (!roomState.room.currentCrisisEventId || roomState.room.currentCrisisEventIndex === 0) throw new Error('ผู้ใช้:ไม่มีเหตุการณ์วิกฤตที่กำลังดำเนินอยู่')
    const resultId = createCrisisResultId(roomState.room.gameCycle, roomState.room.currentCrisisEventIndex)
    const existing = roomState.crisisResults[resultId]; if (existing) return clone(existing)
    if (roomState.room.status !== 'crisis-playing') throw new Error('ผู้ใช้:เหตุการณ์วิกฤตไม่ได้เปิดอยู่')
    const resolvedPlayers = Object.values(roomState.players).map((player) => { if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ'); return { playerId: player.playerId, ownerUid: player.ownerUid, roleId: player.roleId } })
    const event = getCrisisEvent(roomState.room.currentCrisisEventId)
    const eventAnswers = Object.values(roomState.answers).filter(isCrisisAnswerRecord).filter((answer) => answer.gameCycle === roomState.room.gameCycle && answer.eventId === event.id)
    const scored = scoreCrisisEvent(roomState.room.cityScore, event, resolvedPlayers, eventAnswers)
    const result: ClassroomCrisisResult = { ...scored, gameCycle: roomState.room.gameCycle, finalizedAt: Date.now() }
    const personalResults = resolveCrisisPersonalResults(roomState.room.roomId, roomState.room.gameCycle, event, resolvedPlayers, eventAnswers, result.finalizedAt)
    assertPersonalOutcomeTotals(personalResults, result)
    for (const personalResult of personalResults) roomState.personalResults[personalResult.decisionId] = personalResult
    roomState.crisisResults[resultId] = result
    const crisisBuildingScores = updateBuildingScores(roomState.room.buildingScores, result.locationSummaries, roomState.room.buildingLevels)
    Object.assign(roomState.room, { status: 'crisis-result', cityScore: result.newCityScore, cityLevel: result.cityLevel, buildingScores: crisisBuildingScores, buildingLevels: deriveBuildingLevels(crisisBuildingScores), integrityTotal: roomState.room.integrityTotal + result.integrityCount, corruptionTotal: roomState.room.corruptionTotal + result.corruptionCount, timeoutTotal: roomState.room.timeoutTotal + result.timeoutCount, updatedAt: Date.now() } satisfies Partial<ClassroomRoom>)
    writeState(state); return clone(result)
  }

  async finishGame(roomId: string, teacherSessionId: string): Promise<void> {
    const state = readState()
    const roomState = getRoomState(state, roomId)
    assertTeacher(roomState.room, teacherSessionId)
    if (roomState.room.currentQuestionNumber !== 10 || roomState.room.status !== 'round-result' || !roomState.crisisResults[createCrisisResultId(roomState.room.gameCycle, 1)] || !roomState.crisisResults[createCrisisResultId(roomState.room.gameCycle, 2)]) {
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
      currentCrisisEventIndex: 0,
      currentCrisisEventId: null,
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
    if (roomState.room.status === 'finished') throw new Error('ผู้ใช้:ห้องนี้ถูกยุติแล้ว')
    roomState.room.status = 'finished'
    roomState.room.questionStartedAt = null
    roomState.room.questionDeadlineAt = null
    roomState.room.updatedAt = Date.now()
    writeState(state)
  }
}
