import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getCityLevel, scoreClassroomRound } from '../domain/cityScoring'
import { isValidAssessmentResponses, isValidReflection, type ReflectionInput } from '../domain/assessment'
import { assertPersonalOutcomeTotals, resolveCrisisPersonalResults, resolveQuestionPersonalResults } from '../domain/personalDecisionResults'
import { computeChoiceOrderByQuestion, type RoomQuestionSnapshot } from '../domain/classroomQuestions'
import { assertStagingBuildNotUsingProduction, resolveFirebaseEnvironmentName } from '../domain/firebaseEnvironment'
import { randomRoomId } from '../domain/roomCode'
import {
  assignRolesForCycle,
  createBalancedRoleOffsets,
  createRoleRotation,
  isRoleId,
  MAX_GAME_CYCLES,
  type QuestionNumber,
  type RoleId,
} from '../domain/ourCity'
import { compareClassroomPlayersByStudentNumber, isClassSection } from '../types/classroomGame'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomPostAssessment,
  ClassroomPreAssessment,
  ClassroomReflection,
  ClassroomRoom,
  ClassroomRoundResult,
  ClassroomPersonalDecisionResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import { createClassroomAnswerId, createPostAssessmentId, createPreAssessmentId, createReflectionId, classroomPaths, toPublicQuestionDocument } from './classroomFirestore'
import { classroomFriendlyError, type ClassroomGameService } from './classroomGameService'
import { deriveBuildingLevels, INITIAL_BUILDING_SCORES, normalizeBuildingLevels, normalizeBuildingScores, updateBuildingScores } from '../domain/cityBuildings'
import { getCrisisEvent, getCrisisEventAfterQuestion, scoreCrisisEvent, type CrisisEventId, type CrisisEventIndex } from '../domain/cityCrisisEvents'
import { isCrisisAnswerRecord, isQuestionAnswerRecord, type ClassroomCrisisResult } from '../types/classroomGame'
import { createCrisisAnswerId } from './classroomFirestore'
// DIAGNOSTIC FLIGHT RECORDER — opt-in via ?debug=2, see src/debug/flightRecorder.ts.
// Only timestamps stages of closeCrisisEvent that already exist below - no
// new Firestore reads/writes, no new network operation.
import { isFlightRecorderEnabled, record } from '../debug/flightRecorder'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.length === 0)
  .map(([key]) => key)
if (missingFirebaseConfig.length > 0) throw new Error(`ผู้ใช้:Firebase config ไม่ครบ: ${missingFirebaseConfig.join(', ')}`)
// Production behavior is unchanged: 'our-city-our-choice' is still the only
// project id that has ever worked. This now also accepts the reserved
// staging id once that project exists — nothing else.
const firebaseEnvironmentName = resolveFirebaseEnvironmentName(firebaseConfig.projectId)
if (!firebaseEnvironmentName) {
  throw new Error(
    `ผู้ใช้:Firebase Project ID ต้องเป็นหนึ่งใน our-city-our-choice, our-city-our-choice-staging เท่านั้น`,
  )
}
try {
  assertStagingBuildNotUsingProduction(import.meta.env.MODE, firebaseEnvironmentName)
} catch (error) {
  throw new Error(`ผู้ใช้:${error instanceof Error ? error.message : String(error)}`)
}
// Production stays silent (unchanged); non-production connections get a
// visible marker so nobody mistakes a staging session for the real thing.
if (firebaseEnvironmentName !== 'production') {
  console.info(`[firebase] connected to "${firebaseEnvironmentName}" (${firebaseConfig.projectId})`)
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })

// Opt-in only, off by default — never changes behavior unless a developer
// explicitly sets this for local QA against `firebase emulators:start`.
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}

let firebaseSessionPromise: Promise<string> | null = null

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Timestamp) return value.toMillis()
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis(): number }).toMillis()
  return null
}

const roleList = (value: unknown): RoleId[] => Array.isArray(value) ? value.filter(isRoleId) : []

const mapRoom = (data: DocumentData): ClassroomRoom => {
  const createdAt = toMillis(data.createdAt) ?? Date.now()
  const cityScore = Number(data.cityScore ?? 500)
  return {
    roomId: String(data.roomId ?? ''),
    teacherSessionId: String(data.teacherSessionId ?? ''),
    status: data.status as ClassroomRoom['status'],
    gameCycle: Number(data.gameCycle ?? 0),
    completedGameCount: Number(data.completedGameCount ?? 0),
    currentQuestionNumber: Number(data.currentQuestionNumber ?? 0) as ClassroomRoom['currentQuestionNumber'],
    currentCrisisEventIndex: Number(data.currentCrisisEventIndex ?? 0) as ClassroomRoom['currentCrisisEventIndex'],
    currentCrisisEventId: typeof data.currentCrisisEventId === 'string' ? data.currentCrisisEventId as CrisisEventId : null,
    questionDurationSec: Number(data.questionDurationSec ?? 30),
    questionStartedAt: toMillis(data.questionStartedAt),
    questionDeadlineAt: toMillis(data.questionDeadlineAt),
    lockedPlayerCount: Number(data.lockedPlayerCount ?? 0),
    cityScore,
    // Derive the visual/status level from the authoritative score so rooms
    // created under an older threshold do not remain stuck on a stale scene.
    cityLevel: getCityLevel(cityScore),
    buildingScores: normalizeBuildingScores(data.buildingScores, data.buildingLevels),
    buildingLevels: normalizeBuildingLevels(data.buildingLevels),
    integrityTotal: Number(data.integrityTotal ?? 0),
    corruptionTotal: Number(data.corruptionTotal ?? 0),
    timeoutTotal: Number(data.timeoutTotal ?? 0),
    roleRotation: roleList(data.roleRotation),
    // A room written before this field existed has no value here at all -
    // Boolean(undefined) is false, so a legacy/missing room reads safely as
    // "not opened" with no separate migration path required.
    preAssessmentOpened: Boolean(data.preAssessmentOpened),
    createdAt,
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  }
}

const mapPlayer = (snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data(): DocumentData }): ClassroomPlayer => {
  const data = snapshot.data()
  return {
    playerId: snapshot.id,
    nickname: String(data.nickname ?? ''),
    nicknameKey: String(data.nicknameKey ?? ''),
    classSection: isClassSection(data.classSection) ? data.classSection : null,
    studentNumber: Number.isInteger(data.studentNumber) && data.studentNumber > 0 ? Number(data.studentNumber) : null,
    ownerUid: String(data.ownerUid ?? ''),
    roleId: isRoleId(data.roleId) ? data.roleId : null,
    roleHistory: roleList(data.roleHistory),
    roleOffset: Number.isInteger(data.roleOffset) ? Number(data.roleOffset) : null,
    joinedAt: toMillis(data.joinedAt) ?? Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) ?? Date.now(),
  }
}

const mapChoiceOrder = (value: unknown): Record<string, 0 | 1> => {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, 0 | 1] => entry[1] === 0 || entry[1] === 1,
  )
  return Object.fromEntries(entries)
}

const mapQuestion = (data: DocumentData): PublicRoomQuestion => ({
  questionId: String(data.questionId),
  roleId: data.roleId,
  questionNumber: Number(data.questionNumber) as QuestionNumber,
  prompt: String(data.prompt ?? ''),
  choices: [
    { id: String(data.choices?.[0]?.id ?? ''), text: String(data.choices?.[0]?.text ?? '') },
    { id: String(data.choices?.[1]?.id ?? ''), text: String(data.choices?.[1]?.text ?? '') },
  ],
  choiceOrder: mapChoiceOrder(data.choiceOrder),
  imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null,
})

const mapAnswer = (snapshot: QueryDocumentSnapshot<DocumentData>): ClassroomAnswerRecord => {
  const data = snapshot.data()
  if (data.recordType === 'crisis') return {
    recordType: 'crisis', answerId: snapshot.id, roomId: String(data.roomId), playerId: String(data.playerId), ownerUid: String(data.ownerUid),
    gameCycle: Number(data.gameCycle ?? 0), eventIndex: Number(data.eventIndex) as CrisisEventIndex, eventId: String(data.eventId) as CrisisEventId,
    roleId: data.roleId as RoleId, choiceId: String(data.choiceId), submittedAt: toMillis(data.submittedAt) ?? Date.now(),
  }
  return {
    recordType: 'question',
    answerId: snapshot.id,
    roomId: String(data.roomId),
    playerId: String(data.playerId),
    ownerUid: String(data.ownerUid),
    gameCycle: Number(data.gameCycle ?? 0),
    questionNumber: Number(data.questionNumber) as QuestionNumber,
    questionId: String(data.questionId),
    choiceId: String(data.choiceId),
    submittedAt: toMillis(data.submittedAt) ?? Date.now(),
  }
}

const mapCrisisResult = (data: DocumentData): ClassroomCrisisResult => ({
  gameCycle: Number(data.gameCycle ?? 0),
  eventIndex: Number(data.eventIndex) as CrisisEventIndex,
  eventId: String(data.eventId) as CrisisEventId,
  integrityCount: Number(data.integrityCount ?? 0),
  corruptionCount: Number(data.corruptionCount ?? 0),
  timeoutCount: Number(data.timeoutCount ?? 0),
  eventTotal: Number(data.eventTotal ?? 0),
  eventAverage: Number(data.eventAverage ?? 0),
  previousCityScore: Number(data.previousCityScore ?? 500),
  newCityScore: Number(data.newCityScore ?? 500),
  cityLevel: data.cityLevel,
  locationSummaries: data.locationSummaries,
  finalizedAt: toMillis(data.finalizedAt) ?? Date.now(),
})

const mapRound = (data: DocumentData): ClassroomRoundResult => ({
  gameCycle: Number(data.gameCycle ?? 0),
  questionNumber: Number(data.questionNumber) as QuestionNumber,
  integrityCount: Number(data.integrityCount ?? 0),
  corruptionCount: Number(data.corruptionCount ?? 0),
  timeoutCount: Number(data.timeoutCount ?? 0),
  roundTotal: Number(data.roundTotal ?? 0),
  roundAverage: Number(data.roundAverage ?? 0),
  previousCityScore: Number(data.previousCityScore ?? 500),
  newCityScore: Number(data.newCityScore ?? 500),
  cityLevel: data.cityLevel,
  locationSummaries: data.locationSummaries,
  finalizedAt: toMillis(data.finalizedAt) ?? Date.now(),
})

const mapPersonalDecisionResult = (snapshot: QueryDocumentSnapshot<DocumentData>): ClassroomPersonalDecisionResult => {
  const data = snapshot.data()
  if (!isRoleId(data.roleId) || !['integrity', 'corruption', 'timeout'].includes(String(data.outcome))) {
    throw new Error('invalid private personal decision result')
  }
  return {
    decisionId: snapshot.id,
    roomId: String(data.roomId ?? ''),
    playerId: String(data.playerId ?? ''),
    ownerUid: String(data.ownerUid ?? ''),
    gameCycle: Number(data.gameCycle ?? 0),
    roleId: data.roleId,
    source: data.source === 'crisis' ? 'crisis' : 'question',
    sequenceNumber: Number(data.sequenceNumber ?? 0),
    outcome: data.outcome as ClassroomPersonalDecisionResult['outcome'],
    resolvedAt: toMillis(data.resolvedAt) ?? Date.now(),
  }
}

const mapPreAssessment = (data: DocumentData): ClassroomPreAssessment => ({
  schemaVersion: 1,
  recordType: 'pre',
  roomId: String(data.roomId ?? ''),
  playerId: String(data.playerId ?? ''),
  ownerUid: String(data.ownerUid ?? ''),
  responses: Array.isArray(data.responses) ? data.responses.map(Number) : [],
  submittedAt: toMillis(data.submittedAt) ?? Date.now(),
})

const mapPostAssessment = (data: DocumentData): ClassroomPostAssessment => ({
  schemaVersion: 1,
  recordType: 'post',
  roomId: String(data.roomId ?? ''),
  playerId: String(data.playerId ?? ''),
  ownerUid: String(data.ownerUid ?? ''),
  responses: Array.isArray(data.responses) ? data.responses.map(Number) : [],
  submittedAt: toMillis(data.submittedAt) ?? Date.now(),
})

const mapReflection = (data: DocumentData): ClassroomReflection => ({
  schemaVersion: 1,
  recordType: 'reflection',
  roomId: String(data.roomId ?? ''),
  playerId: String(data.playerId ?? ''),
  ownerUid: String(data.ownerUid ?? ''),
  r1: String(data.r1 ?? ''),
  r2: String(data.r2 ?? ''),
  r3: String(data.r3 ?? ''),
  submittedAt: toMillis(data.submittedAt) ?? Date.now(),
})

const fnvHash = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const ROOM_CODE_CREATE_ATTEMPTS = 12

class RoomIdCollisionError extends Error {}
const requireRoom = async (roomId: string): Promise<ClassroomRoom> => {
  const snapshot = await getDoc(doc(db, classroomPaths.room(roomId)))
  if (!snapshot.exists()) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
  return mapRoom(snapshot.data())
}
const assertTeacher = (room: ClassroomRoom, uid: string): void => {
  if (room.teacherSessionId !== uid) throw new Error('ผู้ใช้:ไม่มีสิทธิ์ควบคุมห้องนี้')
}
const onErrorMessage = (listener: (message: string) => void) => (error: Error): void => listener(classroomFriendlyError(error))

// Each personal-result rule reads both the room and its player document.
// Keeping these batches small stays below Firestore's 20 document-access-call
// limit for a multi-document request, even when a classroom has 40 players.
const PERSONAL_RESULTS_PER_BATCH = 5
const writePersonalResults = async (
  roomId: string,
  personalResults: readonly ClassroomPersonalDecisionResult[],
): Promise<void> => {
  for (let start = 0; start < personalResults.length; start += PERSONAL_RESULTS_PER_BATCH) {
    const batch = writeBatch(db)
    for (const personalResult of personalResults.slice(start, start + PERSONAL_RESULTS_PER_BATCH)) {
      batch.set(
        doc(db, classroomPaths.personalDecisionResult(roomId, personalResult.decisionId)),
        { ...personalResult, resolvedAt: serverTimestamp() },
      )
    }
    await batch.commit()
  }
}

export class FirebaseClassroomGameService implements ClassroomGameService {
  readonly isDemo = false

  async ensureSession(): Promise<string> {
    if (!firebaseSessionPromise) {
      firebaseSessionPromise = (async () => {
        // Wait for IndexedDB/local persistence to restore the existing anonymous
        // teacher before deciding to create a new identity. Never sign the user
        // out merely because a token refresh or the network is temporarily slow.
        await auth.authStateReady()
        if (auth.currentUser) {
          await auth.currentUser.getIdToken()
          return auth.currentUser.uid
        }
        const credential = await signInAnonymously(auth)
        return credential.user.uid
      })().finally(() => {
        firebaseSessionPromise = null
      })
    }
    return firebaseSessionPromise
  }

  async createRoom(teacherSessionId: string, questionDurationSec: number): Promise<ClassroomRoom> {
    if (!Number.isInteger(questionDurationSec) || questionDurationSec <= 0) throw new Error('ผู้ใช้:เวลาต่อคำถามต้องเป็นจำนวนเต็มบวก')
    const now = Date.now()
    const buildRoom = (roomId: string): ClassroomRoom => ({
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
      preAssessmentOpened: false,
      createdAt: now,
      updatedAt: now,
    })

    for (let attempt = 0; attempt < ROOM_CODE_CREATE_ATTEMPTS; attempt += 1) {
      const candidate = randomRoomId()
      const roomRef = doc(db, classroomPaths.room(candidate))
      const room = buildRoom(candidate)
      try {
        // A transaction (not a check-then-write) so two teachers racing on
        // the same candidate code can never both succeed: Firestore aborts
        // and retries the loser against fresh data, so it observes the
        // winner's doc and throws here instead of overwriting it.
        await runTransaction(db, async (transaction) => {
          const existing = await transaction.get(roomRef)
          if (existing.exists()) throw new RoomIdCollisionError()
          transaction.set(roomRef, { ...room, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        })
        return room
      } catch (error) {
        if (error instanceof RoomIdCollisionError) continue
        throw error
      }
    }
    throw new Error('ผู้ใช้:สร้างรหัสห้องไม่ได้ กรุณาลองใหม่')
  }

  async joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer> {
    const roomId = input.roomId.trim().toUpperCase()
    const room = await requireRoom(roomId)
    if (room.status === 'finished') throw new Error('ผู้ใช้:ห้องนี้ถูกยุติแล้ว กรุณาขอรหัสห้องใหม่จากครู')
    if (room.status !== 'lobby') throw new Error('ผู้ใช้:เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('ผู้ใช้:กรุณากรอกชื่อ')
    if (!isClassSection(input.classSection)) throw new Error('ผู้ใช้:กรุณากรอกชั้นเรียนให้ถูกต้อง')
    if (!Number.isInteger(input.studentNumber) || input.studentNumber <= 0) throw new Error('ผู้ใช้:เลขที่ต้องเป็นจำนวนเต็มบวก')
    const nicknameKey = nickname.toLocaleLowerCase('th')
    const playerId = `player-${fnvHash(nicknameKey)}`
    const playerRef = doc(db, classroomPaths.player(roomId, playerId))
    const existing = await getDoc(playerRef)
    if (existing.exists()) {
      const player = mapPlayer({ id: existing.id, data: () => existing.data() })
      if (player.ownerUid === ownerUid) return player
      throw new Error('ผู้ใช้:ชื่อนี้ถูกใช้แล้วในห้อง')
    }
    const now = Date.now()
    const player: ClassroomPlayer = {
      playerId,
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
    await setDoc(playerRef, { ...player, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp() })
    return player
  }

  async submitPreAssessment(roomId: string, playerId: string, ownerUid: string, responses: number[]): Promise<void> {
    if (!isValidAssessmentResponses(responses)) throw new Error('ผู้ใช้:คำตอบแบบสำรวจไม่ถูกต้อง กรุณาตอบให้ครบ 10 ข้อ')
    const assessmentRef = doc(db, classroomPaths.assessment(roomId, createPreAssessmentId(playerId)))
    try {
      await setDoc(assessmentRef, {
        schemaVersion: 1,
        recordType: 'pre',
        roomId,
        playerId,
        ownerUid,
        responses,
        submittedAt: serverTimestamp(),
      })
    } catch (error) {
      // The record is immutable (rules reject any update), so a collision
      // here means it already exists - a retry after a network glitch or a
      // double-tap must still resolve as success for this same owner.
      const existing = await getDoc(assessmentRef).catch(() => null)
      if (existing?.exists() && existing.data().ownerUid === ownerUid) return
      throw error
    }
  }

  async submitPostAssessment(roomId: string, playerId: string, ownerUid: string, responses: number[]): Promise<void> {
    if (!isValidAssessmentResponses(responses)) throw new Error('ผู้ใช้:คำตอบแบบประเมินไม่ถูกต้อง กรุณาตอบให้ครบ 10 ข้อ')
    const assessmentRef = doc(db, classroomPaths.assessment(roomId, createPostAssessmentId(playerId)))
    try {
      await setDoc(assessmentRef, {
        schemaVersion: 1,
        recordType: 'post',
        roomId,
        playerId,
        ownerUid,
        responses,
        submittedAt: serverTimestamp(),
      })
    } catch (error) {
      // Same immutable-retry semantics as PRE: a collision here means the
      // record already exists - a retry after a network glitch or a
      // double-tap must still resolve as success for this same owner.
      const existing = await getDoc(assessmentRef).catch(() => null)
      if (existing?.exists() && existing.data().ownerUid === ownerUid) return
      throw error
    }
  }

  async submitReflection(roomId: string, playerId: string, ownerUid: string, reflection: ReflectionInput): Promise<void> {
    if (!isValidReflection(reflection)) throw new Error('ผู้ใช้:กรุณาตอบคำถามทั้ง 3 ข้อให้ครบถ้วน')
    const assessmentRef = doc(db, classroomPaths.assessment(roomId, createReflectionId(playerId)))
    try {
      await setDoc(assessmentRef, {
        schemaVersion: 1,
        recordType: 'reflection',
        roomId,
        playerId,
        ownerUid,
        r1: reflection.r1,
        r2: reflection.r2,
        r3: reflection.r3,
        submittedAt: serverTimestamp(),
      })
    } catch (error) {
      const existing = await getDoc(assessmentRef).catch(() => null)
      if (existing?.exists() && existing.data().ownerUid === ownerUid) return
      throw error
    }
  }

  subscribeRoom(roomId: string, listener: (room: ClassroomRoom | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(doc(db, classroomPaths.room(roomId)), (snapshot) => listener(snapshot.exists() ? mapRoom(snapshot.data()) : null), onErrorMessage(onError))
  }
  subscribePlayers(roomId: string, listener: (players: ClassroomPlayer[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(collection(db, `${classroomPaths.room(roomId)}/players`), (snapshot) => listener(snapshot.docs.map(mapPlayer).sort(compareClassroomPlayersByStudentNumber)), onErrorMessage(onError))
  }
  subscribePlayer(roomId: string, playerId: string, listener: (player: ClassroomPlayer | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(doc(db, classroomPaths.player(roomId, playerId)), (snapshot) => listener(snapshot.exists() ? mapPlayer({ id: snapshot.id, data: () => snapshot.data() }) : null), onErrorMessage(onError))
  }
  subscribePreAssessment(roomId: string, playerId: string, listener: (assessment: ClassroomPreAssessment | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      doc(db, classroomPaths.assessment(roomId, createPreAssessmentId(playerId))),
      { includeMetadataChanges: true },
      (snapshot) => {
        // A local optimistic write (this client's own in-flight setDoc,
        // reflected immediately in cache) must never be reported as a
        // completed submission - only once the server has actually
        // acknowledged it. includeMetadataChanges is what guarantees a
        // second event fires when hasPendingWrites flips to false, even if
        // the document contents themselves did not change again.
        if (snapshot.metadata.hasPendingWrites) return
        listener(snapshot.exists() ? mapPreAssessment(snapshot.data()) : null)
      },
      onErrorMessage(onError),
    )
  }
  subscribePostAssessment(roomId: string, playerId: string, listener: (assessment: ClassroomPostAssessment | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      doc(db, classroomPaths.assessment(roomId, createPostAssessmentId(playerId))),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return
        listener(snapshot.exists() ? mapPostAssessment(snapshot.data()) : null)
      },
      onErrorMessage(onError),
    )
  }
  subscribeReflection(roomId: string, playerId: string, listener: (reflection: ClassroomReflection | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      doc(db, classroomPaths.assessment(roomId, createReflectionId(playerId))),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return
        listener(snapshot.exists() ? mapReflection(snapshot.data()) : null)
      },
      onErrorMessage(onError),
    )
  }
  subscribeAssessments(roomId: string, listener: (assessments: ClassroomPreAssessment[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      query(collection(db, `${classroomPaths.room(roomId)}/assessments`), where('recordType', '==', 'pre')),
      (snapshot) => listener(snapshot.docs.map((item) => mapPreAssessment(item.data()))),
      onErrorMessage(onError),
    )
  }
  async openPreAssessment(roomId: string, teacherSessionId: string): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'lobby') throw new Error('ผู้ใช้:เปิดแบบประเมินได้เฉพาะตอนอยู่ในห้องรอเท่านั้น')
    if (room.preAssessmentOpened) return
    await updateDoc(doc(db, classroomPaths.room(roomId)), {
      preAssessmentOpened: true,
      updatedAt: serverTimestamp(),
    })
  }
  subscribeQuestions(roomId: string, listener: (questions: PublicRoomQuestion[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(collection(db, `${classroomPaths.room(roomId)}/questions`), (snapshot) => listener(snapshot.docs.map((item) => mapQuestion(item.data())).sort((a, b) => a.questionNumber - b.questionNumber || a.roleId.localeCompare(b.roleId))), onErrorMessage(onError))
  }
  subscribeAnswers(roomId: string, listener: (answers: ClassroomAnswerRecord[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(collection(db, `${classroomPaths.room(roomId)}/answers`), (snapshot) => listener(snapshot.docs.map(mapAnswer)), onErrorMessage(onError))
  }
  subscribePlayerAnswers(roomId: string, _playerId: string, ownerUid: string, listener: (answers: ClassroomAnswerRecord[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(query(collection(db, `${classroomPaths.room(roomId)}/answers`), where('ownerUid', '==', ownerUid)), (snapshot) => listener(snapshot.docs.map(mapAnswer)), onErrorMessage(onError))
  }
  subscribeRounds(roomId: string, listener: (rounds: ClassroomRoundResult[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(collection(db, `${classroomPaths.room(roomId)}/rounds`), (snapshot) => listener(snapshot.docs.map((item) => mapRound(item.data())).sort((a, b) => a.gameCycle - b.gameCycle || a.questionNumber - b.questionNumber)), onErrorMessage(onError))
  }
  subscribeCrisisResults(roomId: string, listener: (results: ClassroomCrisisResult[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(collection(db, `${classroomPaths.room(roomId)}/crisisResults`), (snapshot) => listener(snapshot.docs.map((item) => mapCrisisResult(item.data())).sort((a, b) => a.gameCycle - b.gameCycle || a.eventIndex - b.eventIndex)), onErrorMessage(onError))
  }
  subscribePersonalDecisionResults(roomId: string, playerId: string, ownerUid: string, listener: (results: ClassroomPersonalDecisionResult[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      query(collection(db, `${classroomPaths.room(roomId)}/personalResults`), where('ownerUid', '==', ownerUid)),
      (snapshot) => listener(snapshot.docs.map(mapPersonalDecisionResult).filter((result) => result.playerId === playerId).sort((a, b) => a.gameCycle - b.gameCycle || a.resolvedAt - b.resolvedAt)),
      onErrorMessage(onError),
    )
  }

  async startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'lobby') throw new Error('ผู้ใช้:เกมเริ่มแล้ว')
    if (!room.preAssessmentOpened) throw new Error('ผู้ใช้:กรุณาเปิดแบบประเมินก่อนกิจกรรมก่อนเริ่มเกม')
    if (snapshot.roomId !== roomId) throw new Error('ผู้ใช้:snapshot ไม่ตรงกับห้อง')
    const playerSnapshot = await getDocs(collection(db, `${classroomPaths.room(roomId)}/players`))
    const players = playerSnapshot.docs.map(mapPlayer)
    if (players.length === 0) throw new Error('ผู้ใช้:ยังไม่มีนักเรียนในห้อง')
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
    const assigned = assignRolesForCycle(players, roleRotation, 0, offsets)
    // Computed once, up front, for every cycle a player will ever reach:
    // question documents are immutable (firestore.rules) and no one can
    // join after this point, so this is the only chance to record it.
    const choiceOrderByQuestion = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, roomId)
    const batch = writeBatch(db)
    for (const player of assigned) batch.update(doc(db, classroomPaths.player(roomId, player.playerId)), { roleId: player.roleId, roleHistory: player.roleHistory, roleOffset: player.roleOffset })
    for (const question of snapshot.publicQuestions) {
      batch.set(doc(db, classroomPaths.question(roomId, question.questionId)), {
        ...toPublicQuestionDocument(question),
        choiceOrder: choiceOrderByQuestion[question.questionId] ?? {},
      })
    }
    batch.update(doc(db, classroomPaths.room(roomId)), {
      status: 'role-draw', roleRotation, currentQuestionNumber: 0, currentCrisisEventIndex: 0, currentCrisisEventId: null, questionStartedAt: null, questionDeadlineAt: null,
      lockedPlayerCount: players.length, updatedAt: serverTimestamp(),
    })
    await batch.commit()
  }

  async beginQuestions(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'role-draw') throw new Error('ผู้ใช้:ยังไม่อยู่ในหน้าสุ่มอาชีพ')
    const now = Date.now()
    await updateDoc(doc(db, classroomPaths.room(roomId)), {
      status: 'playing', currentQuestionNumber: 1, questionStartedAt: Timestamp.fromMillis(now),
      questionDeadlineAt: Timestamp.fromMillis(now + room.questionDurationSec * 1_000), updatedAt: serverTimestamp(),
    })
    return { ...room, status: 'playing', currentQuestionNumber: 1, questionStartedAt: now, questionDeadlineAt: now + room.questionDurationSec * 1_000, updatedAt: now }
  }

  async submitAnswer(roomId: string, playerId: string, ownerUid: string, questionNumber: number, questionId: string, choiceId: string): Promise<void> {
    const roomRef = doc(db, classroomPaths.room(roomId))
    const playerRef = doc(db, classroomPaths.player(roomId, playerId))
    const questionRef = doc(db, classroomPaths.question(roomId, questionId))
    await runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef)
      const playerSnapshot = await transaction.get(playerRef)
      const questionSnapshot = await transaction.get(questionRef)
      if (!roomSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
      if (!playerSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
      if (!questionSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบคำถามนี้')

      const room = mapRoom(roomSnapshot.data())
      const player = mapPlayer({ id: playerSnapshot.id, data: () => playerSnapshot.data() })
      const question = mapQuestion(questionSnapshot.data())
      if (room.status !== 'playing' || room.currentQuestionNumber !== questionNumber) throw new Error('ผู้ใช้:คำถามข้อนี้ปิดแล้ว')
      if (!player.roleId) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
      if (question.questionId !== questionId || question.questionNumber !== room.currentQuestionNumber || question.roleId !== player.roleId) {
        throw new Error('ผู้ใช้:คำถามไม่ตรงกับอาชีพหรือข้อปัจจุบัน')
      }
      if (!question.choices.some((choice) => choice.id === choiceId)) throw new Error('ผู้ใช้:ไม่พบตัวเลือกนี้')

      const answerId = createClassroomAnswerId(room.gameCycle, playerId, questionId)
      const answerRef = doc(db, classroomPaths.answer(roomId, answerId))
      const existing = await transaction.get(answerRef)
      if (existing.exists()) {
        if (existing.data().ownerUid === ownerUid) return
        throw new Error('ผู้ใช้:คำตอบนี้ถูกบันทึกแล้ว')
      }
      if (player.ownerUid !== ownerUid) {
        transaction.update(playerRef, { ownerUid, lastSeenAt: serverTimestamp() })
      }
      transaction.set(answerRef, {
        recordType: 'question', answerId, roomId, playerId, ownerUid, gameCycle: room.gameCycle,
        questionNumber: room.currentQuestionNumber, questionId, choiceId, submittedAt: serverTimestamp(),
      })
    })
  }

  async closeQuestion(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<ClassroomRoundResult> {
    const stageEnabled = isFlightRecorderEnabled()
    const totalStart = Date.now()
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE start', { roomId })

    // requireRoom and the players/answers reads are independent of each
    // other - the reads only need `roomId` (a parameter, known up front),
    // not any field of `room` - so they do not need to wait for requireRoom
    // to resolve first. Running them concurrently removes one full
    // sequential network round trip from the critical path versus fetching
    // them only after `room` comes back. Authorization (assertTeacher),
    // idempotency (the existing-round check), and every other guard below
    // still run in the same order as before, before any of this fetched
    // data is used or any write happens - only the timing of these two
    // independent reads changed, not what is checked or written.
    const requireRoomAndReadsStart = Date.now()
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE requireRoomAndReads start', { roomId })
    const [room, playerSnapshot, answerSnapshot] = await Promise.all([
      requireRoom(roomId),
      getDocs(collection(db, `${classroomPaths.room(roomId)}/players`)),
      getDocs(collection(db, `${classroomPaths.room(roomId)}/answers`)),
    ])
    if (stageEnabled) {
      record('service', 'CLOSE_QUESTION_STAGE requireRoomAndReads ok', {
        roomId,
        details: { elapsedMs: Date.now() - requireRoomAndReadsStart, playerCount: playerSnapshot.docs.length, answerDocumentCount: answerSnapshot.docs.length },
      })
    }

    assertTeacher(room, teacherSessionId)
    if (room.currentQuestionNumber === 0) throw new Error('ผู้ใช้:ยังไม่ได้เริ่มคำถาม')
    const roundRef = doc(db, classroomPaths.round(roomId, room.gameCycle, room.currentQuestionNumber))

    const existingRoundStart = Date.now()
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE existingRound start', { roomId })
    const existing = await getDoc(roundRef)
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE existingRound ok', { roomId, details: { elapsedMs: Date.now() - existingRoundStart, existing: existing.exists() } })
    if (existing.exists()) return mapRound(existing.data())
    if (room.status !== 'playing') throw new Error('ผู้ใช้:คำถามไม่ได้เปิดอยู่')
    if (snapshot.roomId !== roomId) throw new Error('ผู้ใช้:trusted snapshot ไม่ตรงกับห้อง')

    const scoringStart = Date.now()
    const resolvedPlayers = playerSnapshot.docs.map(mapPlayer).map((player) => {
      if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ')
      return { playerId: player.playerId, ownerUid: player.ownerUid, roleId: player.roleId }
    })
    const answers = answerSnapshot.docs.map(mapAnswer).filter(isQuestionAnswerRecord).filter((answer) => answer.gameCycle === room.gameCycle)
    const result = scoreClassroomRound(room.cityScore, room.currentQuestionNumber, resolvedPlayers, snapshot.trustedQuestions, answers)
    const buildingScores = updateBuildingScores(room.buildingScores, result.locationSummaries, room.buildingLevels)
    const buildingLevels = deriveBuildingLevels(buildingScores)
    const finalizedAt = Date.now()
    const personalResults = resolveQuestionPersonalResults(roomId, room.gameCycle, room.currentQuestionNumber, resolvedPlayers, snapshot, answers, finalizedAt)
    assertPersonalOutcomeTotals(personalResults, result)
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE scoring', { roomId, details: { elapsedMs: Date.now() - scoringStart } })

    const writePersonalStart = Date.now()
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE writePersonalResults start', { roomId })
    try {
      await writePersonalResults(roomId, personalResults)
      if (stageEnabled) {
        record('service', 'CLOSE_QUESTION_STAGE writePersonalResults ok', {
          roomId, details: { elapsedMs: Date.now() - writePersonalStart, resultCount: personalResults.length },
        })
      }
    } catch (error) {
      if (stageEnabled) {
        record('service', 'CLOSE_QUESTION_STAGE writePersonalResults error', {
          roomId, details: { elapsedMs: Date.now() - writePersonalStart, message: error instanceof Error ? error.message : String(error) },
        })
      }
      throw error
    }

    const batch = writeBatch(db)
    batch.set(roundRef, { ...result, gameCycle: room.gameCycle, finalizedAt: serverTimestamp() })
    batch.update(doc(db, classroomPaths.room(roomId)), {
      status: 'round-result', cityScore: result.newCityScore, cityLevel: result.cityLevel,
      buildingScores,
      buildingLevels,
      integrityTotal: room.integrityTotal + result.integrityCount,
      corruptionTotal: room.corruptionTotal + result.corruptionCount,
      timeoutTotal: room.timeoutTotal + result.timeoutCount,
      updatedAt: serverTimestamp(),
    })

    const batchCommitStart = Date.now()
    if (stageEnabled) record('service', 'CLOSE_QUESTION_STAGE batchCommit start', { roomId })
    try {
      await batch.commit()
    } catch (error) {
      if (stageEnabled) {
        record('service', 'CLOSE_QUESTION_STAGE batchCommit error', {
          roomId, details: { elapsedMs: Date.now() - batchCommitStart, message: error instanceof Error ? error.message : String(error) },
        })
        record('service', 'CLOSE_QUESTION_STAGE total', { roomId, details: { elapsedMs: Date.now() - totalStart } })
      }
      throw error
    }
    if (stageEnabled) {
      record('service', 'CLOSE_QUESTION_STAGE batchCommit ok', { roomId, details: { elapsedMs: Date.now() - batchCommitStart } })
      record('service', 'CLOSE_QUESTION_STAGE total', { roomId, details: { elapsedMs: Date.now() - totalStart } })
    }
    return { ...result, gameCycle: room.gameCycle, finalizedAt }
  }

  async openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'round-result' && room.status !== 'crisis-result') throw new Error('ผู้ใช้:กรุณาปิดคำถามหรือเหตุการณ์ปัจจุบันก่อน')
    if (room.currentQuestionNumber === 0 || room.currentQuestionNumber >= 10) throw new Error('ผู้ใช้:ครบ 10 ข้อแล้ว กรุณาดูผลเมือง')
    const now = Date.now()
    if (room.status === 'round-result') {
      const crisis = getCrisisEventAfterQuestion(room.currentQuestionNumber)
      if (crisis) {
        await updateDoc(doc(db, classroomPaths.room(roomId)), {
          status: 'crisis-intro', currentCrisisEventIndex: crisis.index, currentCrisisEventId: crisis.id,
          questionStartedAt: null, questionDeadlineAt: null, updatedAt: serverTimestamp(),
        })
        return { ...room, status: 'crisis-intro', currentCrisisEventIndex: crisis.index, currentCrisisEventId: crisis.id, questionStartedAt: null, questionDeadlineAt: null, updatedAt: now }
      }
    }
    const nextQuestionNumber = (room.currentQuestionNumber + 1) as QuestionNumber
    await updateDoc(doc(db, classroomPaths.room(roomId)), {
      status: 'playing', currentQuestionNumber: nextQuestionNumber, currentCrisisEventIndex: 0, currentCrisisEventId: null, questionStartedAt: Timestamp.fromMillis(now),
      questionDeadlineAt: Timestamp.fromMillis(now + room.questionDurationSec * 1_000), updatedAt: serverTimestamp(),
    })
    return { ...room, status: 'playing', currentQuestionNumber: nextQuestionNumber, currentCrisisEventIndex: 0, currentCrisisEventId: null, questionStartedAt: now, questionDeadlineAt: now + room.questionDurationSec * 1_000, updatedAt: now }
  }

  async beginCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'crisis-intro' || !room.currentCrisisEventId) throw new Error('ผู้ใช้:ยังไม่อยู่ในช่วงแนะนำเหตุการณ์วิกฤต')
    const now = Date.now()
    const deadline = now + room.questionDurationSec * 1_000
    await updateDoc(doc(db, classroomPaths.room(roomId)), { status: 'crisis-playing', questionStartedAt: Timestamp.fromMillis(now), questionDeadlineAt: Timestamp.fromMillis(deadline), updatedAt: serverTimestamp() })
    return { ...room, status: 'crisis-playing', questionStartedAt: now, questionDeadlineAt: deadline, updatedAt: now }
  }

  async submitCrisisAnswer(roomId: string, playerId: string, ownerUid: string, choiceId: string): Promise<void> {
    const roomRef = doc(db, classroomPaths.room(roomId))
    const playerRef = doc(db, classroomPaths.player(roomId, playerId))
    await runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef)
      const playerSnapshot = await transaction.get(playerRef)
      if (!roomSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
      if (!playerSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')

      const room = mapRoom(roomSnapshot.data())
      const player = mapPlayer({ id: playerSnapshot.id, data: () => playerSnapshot.data() })
      if (room.status !== 'crisis-playing' || !room.currentCrisisEventId || room.currentCrisisEventIndex === 0) throw new Error('ผู้ใช้:เหตุการณ์นี้ปิดแล้ว')
      if (!player.roleId) throw new Error('ผู้ใช้:ไม่พบผู้เล่นของคุณ')
      const event = getCrisisEvent(room.currentCrisisEventId)
      if (event.index !== room.currentCrisisEventIndex) throw new Error('ผู้ใช้:เหตุการณ์นี้ปิดแล้ว')
      if (!event.dilemmas[player.roleId].choices.some((choice) => choice.id === choiceId)) throw new Error('ผู้ใช้:ไม่พบตัวเลือกนี้')

      const answerId = createCrisisAnswerId(room.gameCycle, playerId, event.id)
      const answerRef = doc(db, classroomPaths.answer(roomId, answerId))
      const existing = await transaction.get(answerRef)
      if (existing.exists()) {
        if (existing.data().ownerUid === ownerUid) return
        throw new Error('ผู้ใช้:คำตอบนี้ถูกบันทึกแล้ว')
      }
      if (player.ownerUid !== ownerUid) {
        transaction.update(playerRef, { ownerUid, lastSeenAt: serverTimestamp() })
      }
      transaction.set(answerRef, {
        recordType: 'crisis', answerId, roomId, playerId, ownerUid, gameCycle: room.gameCycle,
        eventIndex: event.index, eventId: event.id, roleId: player.roleId, choiceId, submittedAt: serverTimestamp(),
      })
    })
  }

  async closeCrisisEvent(roomId: string, teacherSessionId: string): Promise<ClassroomCrisisResult> {
    const stageEnabled = isFlightRecorderEnabled()
    const totalStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE start', { roomId })

    const requireRoomStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE requireRoom start', { roomId })
    const initialRoom = await requireRoom(roomId)
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE requireRoom ok', { roomId, details: { elapsedMs: Date.now() - requireRoomStart } })

    assertTeacher(initialRoom, teacherSessionId)
    if (!initialRoom.currentCrisisEventId || initialRoom.currentCrisisEventIndex === 0) throw new Error('ผู้ใช้:ไม่มีเหตุการณ์วิกฤตที่กำลังดำเนินอยู่')
    const resultRef = doc(db, classroomPaths.crisisResult(roomId, initialRoom.gameCycle, initialRoom.currentCrisisEventIndex))

    const existingResultStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE existingResult start', { roomId })
    const existingResult = await getDoc(resultRef)
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE existingResult ok', { roomId, details: { elapsedMs: Date.now() - existingResultStart, existing: existingResult.exists() } })
    if (existingResult.exists()) return mapCrisisResult(existingResult.data())
    if (initialRoom.status !== 'crisis-playing') throw new Error('ผู้ใช้:เหตุการณ์วิกฤตไม่ได้เปิดอยู่')

    const playersAndAnswersStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE playersAndAnswers start', { roomId })
    const [playerSnapshot, answerSnapshot] = await Promise.all([
      getDocs(collection(db, `${classroomPaths.room(roomId)}/players`)),
      getDocs(collection(db, `${classroomPaths.room(roomId)}/answers`)),
    ])
    if (stageEnabled) {
      record('service', 'CRISIS_CLOSE_STAGE playersAndAnswers ok', {
        roomId,
        details: { elapsedMs: Date.now() - playersAndAnswersStart, playerCount: playerSnapshot.docs.length, answerDocumentCount: answerSnapshot.docs.length },
      })
    }

    const scoringStart = Date.now()
    const players = playerSnapshot.docs.map(mapPlayer).map((player) => {
      if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ')
      return { playerId: player.playerId, ownerUid: player.ownerUid, roleId: player.roleId }
    })
    const answers = answerSnapshot.docs.map(mapAnswer).filter(isCrisisAnswerRecord)
    const roomRef = doc(db, classroomPaths.room(roomId))
    const finalizedAt = Date.now()
    const event = getCrisisEvent(initialRoom.currentCrisisEventId)
    const eventAnswers = answers.filter((answer) => answer.gameCycle === initialRoom.gameCycle && answer.eventId === event.id)
    const scored = scoreCrisisEvent(initialRoom.cityScore, event, players, eventAnswers)
    const result: ClassroomCrisisResult = { ...scored, gameCycle: initialRoom.gameCycle, finalizedAt }
    const personalResults = resolveCrisisPersonalResults(roomId, initialRoom.gameCycle, event, players, eventAnswers, finalizedAt)
    assertPersonalOutcomeTotals(personalResults, result)
    const crisisBuildingScores = updateBuildingScores(initialRoom.buildingScores, result.locationSummaries, initialRoom.buildingLevels)
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE scoring', { roomId, details: { elapsedMs: Date.now() - scoringStart } })

    const writePersonalStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE writePersonalResults start', { roomId })
    try {
      await writePersonalResults(roomId, personalResults)
      if (stageEnabled) {
        record('service', 'CRISIS_CLOSE_STAGE writePersonalResults ok', {
          roomId, details: { elapsedMs: Date.now() - writePersonalStart, resultCount: personalResults.length },
        })
      }
    } catch (error) {
      if (stageEnabled) {
        record('service', 'CRISIS_CLOSE_STAGE writePersonalResults error', {
          roomId, details: { elapsedMs: Date.now() - writePersonalStart, message: error instanceof Error ? error.message : String(error) },
        })
      }
      throw error
    }

    const transactionStart = Date.now()
    if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE runTransaction start', { roomId })
    try {
      const transactionResult = await runTransaction(db, async (transaction) => {
        const freshRoomSnapshot = await transaction.get(roomRef)
        if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE runTransaction freshRoom read completed', { roomId, details: { elapsedMs: Date.now() - transactionStart } })
        const freshExistingResult = await transaction.get(resultRef)
        if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE runTransaction freshCrisisResult read completed', { roomId, details: { elapsedMs: Date.now() - transactionStart } })
        if (freshExistingResult.exists()) return mapCrisisResult(freshExistingResult.data())
        if (!freshRoomSnapshot.exists()) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
        const room = mapRoom(freshRoomSnapshot.data())
        assertTeacher(room, teacherSessionId)
        if (room.status !== 'crisis-playing' || !room.currentCrisisEventId || room.currentCrisisEventIndex === 0) throw new Error('ผู้ใช้:เหตุการณ์วิกฤตไม่ได้เปิดอยู่')
        if (room.gameCycle !== initialRoom.gameCycle || room.currentCrisisEventId !== event.id) throw new Error('ผู้ใช้:เหตุการณ์วิกฤตเปลี่ยนแล้ว')
        transaction.set(resultRef, { ...result, finalizedAt: serverTimestamp() })
        transaction.update(roomRef, {
          status: 'crisis-result', cityScore: result.newCityScore, cityLevel: result.cityLevel,
          buildingScores: crisisBuildingScores,
          buildingLevels: deriveBuildingLevels(crisisBuildingScores),
          integrityTotal: room.integrityTotal + result.integrityCount,
          corruptionTotal: room.corruptionTotal + result.corruptionCount,
          timeoutTotal: room.timeoutTotal + result.timeoutCount,
          updatedAt: serverTimestamp(),
        })
        return result
      })
      if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE runTransaction ok', { roomId, details: { elapsedMs: Date.now() - transactionStart } })
      if (stageEnabled) record('service', 'CRISIS_CLOSE_STAGE total', { roomId, details: { elapsedMs: Date.now() - totalStart } })
      return transactionResult
    } catch (error) {
      if (stageEnabled) {
        record('service', 'CRISIS_CLOSE_STAGE runTransaction error', {
          roomId, details: { elapsedMs: Date.now() - transactionStart, message: error instanceof Error ? error.message : String(error) },
        })
        record('service', 'CRISIS_CLOSE_STAGE total', { roomId, details: { elapsedMs: Date.now() - totalStart } })
      }
      throw error
    }
  }

  async finishGame(roomId: string, teacherSessionId: string): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.currentQuestionNumber !== 10 || room.status !== 'round-result') throw new Error('ผู้ใช้:เกมยังไม่จบครบ 10 ข้อ')
    const crisisSnapshot = await getDocs(collection(db, `${classroomPaths.room(roomId)}/crisisResults`))
    const completed = new Set(crisisSnapshot.docs.map((item) => mapCrisisResult(item.data())).filter((result) => result.gameCycle === room.gameCycle).map((result) => result.eventIndex))
    if (!completed.has(1) || !completed.has(2)) throw new Error('ผู้ใช้:เหตุการณ์วิกฤตยังไม่ครบ')
    await updateDoc(doc(db, classroomPaths.room(roomId)), { status: 'game-result', completedGameCount: room.gameCycle + 1, updatedAt: serverTimestamp() })
  }

  async continueCityProgress(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'game-result') throw new Error('ผู้ใช้:เกมชุดปัจจุบันยังไม่จบ')
    if (room.gameCycle >= MAX_GAME_CYCLES - 1) throw new Error('ผู้ใช้:นักเรียนทดลองครบทั้ง 8 อาชีพแล้ว')
    const playerSnapshot = await getDocs(collection(db, `${classroomPaths.room(roomId)}/players`))
    const players = playerSnapshot.docs.map(mapPlayer)
    const nextCycle = room.gameCycle + 1
    const assigned = assignRolesForCycle(players, room.roleRotation, nextCycle)
    const batch = writeBatch(db)
    for (const player of assigned) batch.update(doc(db, classroomPaths.player(roomId, player.playerId)), { roleId: player.roleId, roleHistory: player.roleHistory })
    batch.update(doc(db, classroomPaths.room(roomId)), {
      gameCycle: nextCycle, status: 'role-draw', currentQuestionNumber: 0, currentCrisisEventIndex: 0, currentCrisisEventId: null,
      questionStartedAt: null, questionDeadlineAt: null, updatedAt: serverTimestamp(),
    })
    await batch.commit()
    return { ...room, gameCycle: nextCycle, status: 'role-draw', currentQuestionNumber: 0, currentCrisisEventIndex: 0, currentCrisisEventId: null, questionStartedAt: null, questionDeadlineAt: null, updatedAt: Date.now() }
  }

  async endActivity(roomId: string, teacherSessionId: string): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status === 'finished') throw new Error('ผู้ใช้:ห้องนี้ถูกยุติแล้ว')
    await updateDoc(doc(db, classroomPaths.room(roomId)), {
      status: 'finished', questionStartedAt: null, questionDeadlineAt: null, updatedAt: serverTimestamp(),
    })
  }
}
