import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { scoreClassroomRound } from '../domain/cityScoring'
import type { RoomQuestionSnapshot } from '../domain/classroomQuestions'
import { assignBalancedRoles, isRoleId, type QuestionNumber } from '../domain/ourCity'
import type {
  ClassroomAnswerRecord,
  ClassroomJoinInput,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import { createClassroomAnswerId, classroomPaths, toPublicQuestionDocument } from './classroomFirestore'
import { classroomFriendlyError, type ClassroomGameService } from './classroomGameService'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Timestamp) return value.toMillis()
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis()
  }
  return null
}

const mapRoom = (data: DocumentData): ClassroomRoom => ({
  roomId: String(data.roomId ?? ''),
  teacherSessionId: String(data.teacherSessionId ?? ''),
  status: data.status as ClassroomRoom['status'],
  currentQuestionNumber: Number(data.currentQuestionNumber ?? 1) as QuestionNumber,
  questionDurationSec: Number(data.questionDurationSec ?? 30),
  questionStartedAt: toMillis(data.questionStartedAt),
  questionDeadlineAt: toMillis(data.questionDeadlineAt),
  lockedPlayerCount: Number(data.lockedPlayerCount ?? 0),
  cityScore: Number(data.cityScore ?? 500),
  cityLevel: data.cityLevel as ClassroomRoom['cityLevel'],
  createdAt: toMillis(data.createdAt) ?? Date.now(),
  updatedAt: toMillis(data.updatedAt) ?? Date.now(),
})

const mapPlayer = (snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data(): DocumentData }): ClassroomPlayer => {
  const data = snapshot.data()
  return {
    playerId: snapshot.id,
    nickname: String(data.nickname ?? ''),
    nicknameKey: String(data.nicknameKey ?? ''),
    ownerUid: String(data.ownerUid ?? ''),
    roleId: isRoleId(data.roleId) ? data.roleId : null,
    joinedAt: toMillis(data.joinedAt) ?? Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) ?? Date.now(),
  }
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
  imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null,
})

const mapAnswer = (snapshot: QueryDocumentSnapshot<DocumentData>): ClassroomAnswerRecord => {
  const data = snapshot.data()
  return {
    answerId: snapshot.id,
    roomId: String(data.roomId),
    playerId: String(data.playerId),
    ownerUid: String(data.ownerUid),
    questionNumber: Number(data.questionNumber) as QuestionNumber,
    questionId: String(data.questionId),
    choiceId: String(data.choiceId),
    submittedAt: toMillis(data.submittedAt) ?? Date.now(),
  }
}

const mapRound = (data: DocumentData): ClassroomRoundResult => ({
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

const fnvHash = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const randomRoomId = (): string => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X')

const requireRoom = async (roomId: string): Promise<ClassroomRoom> => {
  const snapshot = await getDoc(doc(db, classroomPaths.room(roomId)))
  if (!snapshot.exists()) throw new Error('ผู้ใช้:ไม่พบห้องนี้')
  return mapRoom(snapshot.data())
}

const assertTeacher = (room: ClassroomRoom, teacherSessionId: string): void => {
  if (room.teacherSessionId !== teacherSessionId) throw new Error('ผู้ใช้:ไม่มีสิทธิ์ควบคุมห้องนี้')
}

const onErrorMessage = (listener: (message: string) => void) => (error: Error): void => listener(classroomFriendlyError(error))

export class FirebaseClassroomGameService implements ClassroomGameService {
  readonly isDemo = false

  async ensureSession(): Promise<string> {
    if (auth.currentUser) return auth.currentUser.uid
    return new Promise((resolve, reject) => {
      let signingIn = false
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe()
            resolve(user.uid)
          } else if (!signingIn) {
            signingIn = true
            signInAnonymously(auth).catch((error: unknown) => {
              unsubscribe()
              reject(error)
            })
          }
        },
        reject,
      )
    })
  }

  async createRoom(teacherSessionId: string, questionDurationSec: number): Promise<ClassroomRoom> {
    if (!Number.isInteger(questionDurationSec) || questionDurationSec <= 0) {
      throw new Error('ผู้ใช้:เวลาต่อคำถามต้องเป็นจำนวนเต็มบวก')
    }
    let roomId = ''
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = randomRoomId()
      if (!(await getDoc(doc(db, classroomPaths.room(candidate)))).exists()) {
        roomId = candidate
        break
      }
    }
    if (!roomId) throw new Error('ผู้ใช้:สร้างรหัสห้องไม่ได้ กรุณาลองใหม่')
    const now = Date.now()
    await setDoc(doc(db, classroomPaths.room(roomId)), {
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return {
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
  }

  async joinRoom(input: ClassroomJoinInput, ownerUid: string): Promise<ClassroomPlayer> {
    const roomId = input.roomId.trim().toUpperCase()
    const room = await requireRoom(roomId)
    if (room.status !== 'waiting') throw new Error('ผู้ใช้:เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้')
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('ผู้ใช้:กรุณากรอกชื่อ')
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
    await setDoc(playerRef, {
      playerId,
      nickname,
      nicknameKey,
      ownerUid,
      roleId: null,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    })
    return { playerId, nickname, nicknameKey, ownerUid, roleId: null, joinedAt: now, lastSeenAt: now }
  }

  subscribeRoom(roomId: string, listener: (room: ClassroomRoom | null) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      doc(db, classroomPaths.room(roomId)),
      (snapshot) => listener(snapshot.exists() ? mapRoom(snapshot.data()) : null),
      onErrorMessage(onError),
    )
  }

  subscribePlayers(
    roomId: string,
    listener: (players: ClassroomPlayer[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      collection(db, `${classroomPaths.room(roomId)}/players`),
      (snapshot) => listener(snapshot.docs.map(mapPlayer).sort((left, right) => left.joinedAt - right.joinedAt)),
      onErrorMessage(onError),
    )
  }

  subscribePlayer(
    roomId: string,
    playerId: string,
    listener: (player: ClassroomPlayer | null) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      doc(db, classroomPaths.player(roomId, playerId)),
      (snapshot) => listener(snapshot.exists() ? mapPlayer({ id: snapshot.id, data: () => snapshot.data() }) : null),
      onErrorMessage(onError),
    )
  }

  subscribeQuestions(
    roomId: string,
    listener: (questions: PublicRoomQuestion[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      collection(db, `${classroomPaths.room(roomId)}/questions`),
      (snapshot) =>
        listener(
          snapshot.docs
            .map((document) => mapQuestion(document.data()))
            .sort((left, right) => left.questionNumber - right.questionNumber || left.roleId.localeCompare(right.roleId)),
        ),
      onErrorMessage(onError),
    )
  }

  subscribeAnswers(
    roomId: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      collection(db, `${classroomPaths.room(roomId)}/answers`),
      (snapshot) => listener(snapshot.docs.map(mapAnswer)),
      onErrorMessage(onError),
    )
  }

  subscribePlayerAnswers(
    roomId: string,
    _playerId: string,
    ownerUid: string,
    listener: (answers: ClassroomAnswerRecord[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      query(collection(db, `${classroomPaths.room(roomId)}/answers`), where('ownerUid', '==', ownerUid)),
      (snapshot) => listener(snapshot.docs.map(mapAnswer)),
      onErrorMessage(onError),
    )
  }

  subscribeRounds(
    roomId: string,
    listener: (rounds: ClassroomRoundResult[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      collection(db, `${classroomPaths.room(roomId)}/rounds`),
      (snapshot) =>
        listener(
          snapshot.docs.map((document) => mapRound(document.data())).sort((left, right) => left.questionNumber - right.questionNumber),
        ),
      onErrorMessage(onError),
    )
  }

  async startGame(roomId: string, teacherSessionId: string, snapshot: RoomQuestionSnapshot): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'waiting') throw new Error('ผู้ใช้:เกมเริ่มแล้ว')
    if (snapshot.roomId !== roomId) throw new Error('ผู้ใช้:snapshot ไม่ตรงกับห้อง')
    const playersSnapshot = await getDocs(collection(db, `${classroomPaths.room(roomId)}/players`))
    const players = playersSnapshot.docs.map(mapPlayer)
    if (players.length === 0) throw new Error('ผู้ใช้:ยังไม่มีนักเรียนในห้อง')
    const assigned = assignBalancedRoles(players)
    const now = Date.now()
    const batch = writeBatch(db)
    for (const player of assigned) batch.update(doc(db, classroomPaths.player(roomId, player.playerId)), { roleId: player.roleId })
    for (const question of snapshot.publicQuestions) {
      batch.set(doc(db, classroomPaths.question(roomId, question.questionId)), toPublicQuestionDocument(question))
    }
    batch.update(doc(db, classroomPaths.room(roomId)), {
      status: 'question',
      currentQuestionNumber: 1,
      questionStartedAt: Timestamp.fromMillis(now),
      questionDeadlineAt: Timestamp.fromMillis(now + room.questionDurationSec * 1_000),
      lockedPlayerCount: players.length,
      cityScore: 500,
      cityLevel: 'neutral',
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
  }

  async submitAnswer(
    roomId: string,
    playerId: string,
    ownerUid: string,
    questionNumber: number,
    questionId: string,
    choiceId: string,
  ): Promise<void> {
    const answerId = createClassroomAnswerId(playerId, questionId)
    const answerRef = doc(db, classroomPaths.answer(roomId, answerId))
    if ((await getDoc(answerRef)).exists()) return
    await setDoc(answerRef, {
      answerId,
      roomId,
      playerId,
      ownerUid,
      questionNumber,
      questionId,
      choiceId,
      submittedAt: serverTimestamp(),
    })
  }

  async closeQuestion(
    roomId: string,
    teacherSessionId: string,
    snapshot: RoomQuestionSnapshot,
  ): Promise<ClassroomRoundResult> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    const roundRef = doc(db, classroomPaths.round(roomId, room.currentQuestionNumber))
    const existing = await getDoc(roundRef)
    if (existing.exists()) return mapRound(existing.data())
    if (room.status !== 'question') throw new Error('ผู้ใช้:คำถามไม่ได้เปิดอยู่')
    if (snapshot.roomId !== roomId) throw new Error('ผู้ใช้:trusted snapshot ไม่ตรงกับห้อง')
    const [playersSnapshot, answersSnapshot] = await Promise.all([
      getDocs(collection(db, `${classroomPaths.room(roomId)}/players`)),
      getDocs(collection(db, `${classroomPaths.room(roomId)}/answers`)),
    ])
    const lockedPlayers = playersSnapshot.docs.map(mapPlayer).map((player) => {
      if (!player.roleId) throw new Error('ผู้ใช้:มีผู้เล่นที่ยังไม่ได้รับอาชีพ')
      return { playerId: player.playerId, roleId: player.roleId }
    })
    const result = scoreClassroomRound(
      room.cityScore,
      room.currentQuestionNumber,
      lockedPlayers,
      snapshot.trustedQuestions,
      answersSnapshot.docs.map(mapAnswer),
    )
    const finalizedAt = Date.now()
    const batch = writeBatch(db)
    batch.set(roundRef, { ...result, finalizedAt: serverTimestamp() })
    batch.update(doc(db, classroomPaths.room(roomId)), {
      status: 'question-closed',
      cityScore: result.newCityScore,
      cityLevel: result.cityLevel,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
    return { ...result, finalizedAt }
  }

  async openNextQuestion(roomId: string, teacherSessionId: string): Promise<ClassroomRoom> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.status !== 'question-closed') throw new Error('ผู้ใช้:กรุณาปิดคำถามปัจจุบันก่อน')
    if (room.currentQuestionNumber >= 10) throw new Error('ผู้ใช้:ครบ 10 ข้อแล้ว กรุณาดูผลเมือง')
    const now = Date.now()
    const nextQuestionNumber = (room.currentQuestionNumber + 1) as QuestionNumber
    await updateDoc(doc(db, classroomPaths.room(roomId)), {
      status: 'question',
      currentQuestionNumber: nextQuestionNumber,
      questionStartedAt: Timestamp.fromMillis(now),
      questionDeadlineAt: Timestamp.fromMillis(now + room.questionDurationSec * 1_000),
      updatedAt: serverTimestamp(),
    })
    return {
      ...room,
      status: 'question',
      currentQuestionNumber: nextQuestionNumber,
      questionStartedAt: now,
      questionDeadlineAt: now + room.questionDurationSec * 1_000,
      updatedAt: now,
    }
  }

  async finishGame(roomId: string, teacherSessionId: string): Promise<void> {
    const room = await requireRoom(roomId)
    assertTeacher(room, teacherSessionId)
    if (room.currentQuestionNumber !== 10 || room.status !== 'question-closed') {
      throw new Error('ผู้ใช้:เกมยังไม่จบครบ 10 ข้อ')
    }
    await updateDoc(doc(db, classroomPaths.room(roomId)), { status: 'finished', updatedAt: serverTimestamp() })
  }
}
