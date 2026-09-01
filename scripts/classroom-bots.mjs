import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { assertNotProductionProject } from './lib/productionSafetyGuard.mjs'

const DEFAULT_COUNT = 32
const MAX_COUNT = 40
const QUESTION_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1ndzvM2Fd021etUmJX60N_j_YaficwFkZ/gviz/tq?tqx=out:csv&sheet=QUESTIONS'

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const roomId = String(argumentValue('--room', '')).trim().toUpperCase()
const botCount = Number(argumentValue('--count', DEFAULT_COUNT))
const nicknamePrefix = String(argumentValue('--prefix', 'บอตทดลอง')).trim()
const integrityRate = Number(argumentValue('--integrity-rate', 0.75))
const staggerMs = Number(argumentValue('--stagger-ms', 0))
const maxQuestion = Number(argumentValue('--max-question', 10))
const earlyCorruptThrough = Number(argumentValue('--early-corrupt-through', 0))
const lateCorruptFrom = Number(argumentValue('--late-corrupt-from', 0))
const cycleFlip = process.argv.includes('--cycle-flip')
const buildingSpreadWorstCity = process.argv.includes('--building-spread-worst-city')
const buildingSpreadBestCity = process.argv.includes('--building-spread-best-city') || process.argv.includes('--building-spread-prosperous-city')
const postOnly = process.argv.includes('--post-only')
const envFile = String(argumentValue('--env-file', '.env.local')).trim()
const target = String(argumentValue('--target', 'firebase')).trim().toLowerCase()
const useEmulator = target === 'emulator'

if (!['firebase', 'emulator'].includes(target)) throw new Error(`--target ต้องเป็น firebase หรือ emulator (ได้ "${target}")`)

if (!/^[A-HJ-NP-Z2-9]{4}$/.test(roomId)) throw new Error('ใช้ --room ตามด้วยรหัสห้อง 4 ตัว เช่น --room Y2XK')
if (!Number.isInteger(botCount) || botCount < 1 || botCount > MAX_COUNT) {
  throw new Error(`--count ต้องเป็นจำนวนเต็มระหว่าง 1-${MAX_COUNT}`)
}
if (!nicknamePrefix) throw new Error('--prefix ต้องไม่เป็นค่าว่าง')
if (!Number.isFinite(integrityRate) || integrityRate < 0 || integrityRate > 1) {
  throw new Error('--integrity-rate ต้องอยู่ระหว่าง 0-1')
}
if (!Number.isInteger(staggerMs) || staggerMs < 0 || staggerMs > 10_000) {
  throw new Error('--stagger-ms ต้องเป็นจำนวนเต็มระหว่าง 0-10000')
}
if (!Number.isInteger(maxQuestion) || maxQuestion < 1 || maxQuestion > 10) {
  throw new Error('--max-question ต้องเป็นจำนวนเต็มระหว่าง 1-10')
}
if (!Number.isInteger(earlyCorruptThrough) || earlyCorruptThrough < 0 || earlyCorruptThrough > 9) {
  throw new Error('--early-corrupt-through ต้องเป็นจำนวนเต็มระหว่าง 0-9')
}
if (!Number.isInteger(lateCorruptFrom) || lateCorruptFrom < 0 || lateCorruptFrom > 10) {
  throw new Error('--late-corrupt-from ต้องเป็นจำนวนเต็มระหว่าง 0-10')
}
if ([earlyCorruptThrough > 0, lateCorruptFrom > 0, cycleFlip, buildingSpreadWorstCity, buildingSpreadBestCity].filter(Boolean).length > 1) {
  throw new Error('เลือกใช้โปรไฟล์คำตอบได้ครั้งละหนึ่งแบบเท่านั้น')
}
if (!envFile) throw new Error('--env-file ต้องไม่เป็นค่าว่าง')

const BUILDING_LEVEL_BY_ROLE_WORST = Object.freeze({
  doctor: -2,
  municipal: -2,
  police: -1,
  teacher: -2,
  merchant: 1,
  contractor: 0,
  student: -2,
  journalist: 2,
})

const BUILDING_LEVEL_BY_ROLE_BEST = Object.freeze({
  doctor: -2,
  police: -1,
  contractor: 0,
  merchant: 1,
  journalist: 2,
  municipal: 2,
  teacher: 2,
  student: 2,
})

const getBuildingLevelByRole = (roleId) => {
  if (buildingSpreadBestCity) return BUILDING_LEVEL_BY_ROLE_BEST[roleId]
  return BUILDING_LEVEL_BY_ROLE_WORST[roleId]
}

const NORMAL_INTEGRITY_COUNT_BY_LEVEL = Object.freeze({
  '-2': 0,
  '-1': 8,
  0: 7,
  1: 9,
  2: 10,
})

const shouldChooseIntegrityForSpreadQuestion = (roleId, questionNumber, clientIndex, gameCycle) => {
  if (gameCycle !== 0) return clientIndex < Math.round(botCount * integrityRate)
  const level = getBuildingLevelByRole(roleId)
  const integrityCount = NORMAL_INTEGRITY_COUNT_BY_LEVEL[String(level)]
  if (!Number.isInteger(integrityCount)) throw new Error(`ไม่มีเป้าหมายระดับอาคารสำหรับอาชีพ ${roleId}`)
  // Each player gets the exact cumulative outcome count needed by the target
  // building level, but the corrupt questions rotate by player so a live
  // classroom sees mixed choices instead of one robotic block.
  return ((questionNumber - 1 + clientIndex) % 10) < integrityCount
}

const shouldChooseIntegrityForSpreadCrisis = (roleId, eventIndex, clientIndex, gameCycle) => {
  if (gameCycle !== 0) return clientIndex < Math.round(botCount * integrityRate)
  const level = getBuildingLevelByRole(roleId)
  if (level === -2 || level === -1) return false
  if (level === 2 && buildingSpreadBestCity) return true
  // Lv.0/+1/+2 each need one integrity and one corruption crisis. Alternate
  // which crisis is positive per player to keep both events visibly mixed.
  return eventIndex === (clientIndex % 2) + 1
}

const POST_IMPROVED_RESPONSES = Object.freeze([3, 4, 4, 5, 4, 3, 4, 5, 4, 4])
const POST_DECREASED_RESPONSES = Object.freeze([1, 2, 2, 3, 2, 1, 2, 3, 2, 2])
const REFLECTION_VARIANTS = Object.freeze([
  {
    r1: 'ตอนต้องเลือกระหว่างประโยชน์ของตัวเองกับประโยชน์ของเมือง เพราะทั้งสองทางเลือกมีผลต่างกัน',
    r2: 'เห็นว่าเรื่องเล็ก ๆ จากทุกคนรวมกันแล้วทำให้อาคารและเมืองเปลี่ยนได้จริง',
    r3: 'นึกถึงการใช้ของส่วนรวมในโรงเรียนที่ทุกคนควรช่วยกันดูแลอย่างซื่อสัตย์',
  },
  {
    r1: 'สถานการณ์วิกฤตตัดสินใจยากที่สุด เพราะต้องคิดถึงคนหลายกลุ่มในเวลาเดียวกัน',
    r2: 'เข้าใจว่าผลประโยชน์ส่วนรวมคือสิ่งที่ช่วยคนส่วนมาก ไม่ใช่แค่คนใดคนหนึ่ง',
    r3: 'นึกถึงการเลือกหัวหน้าห้องและการบอกข้อมูลตามจริงโดยไม่ช่วยเฉพาะเพื่อนตัวเอง',
  },
  {
    r1: 'ตอนที่ทางเลือกดูเหมือนช่วยได้เร็วแต่ไม่โปร่งใส เพราะต้องคิดถึงผลระยะยาวของเมือง',
    r2: 'พอเห็นตึกทรุดลงจึงเข้าใจว่าการตัดสินใจของแต่ละคนส่งผลต่อส่วนรวม',
    r3: 'นึกถึงการคืนของที่เก็บได้และการไม่เอาของโรงเรียนไปใช้เป็นของส่วนตัว',
  },
  {
    r1: 'การเลือกเมื่ออาชีพของตัวเองได้ประโยชน์แต่เมืองเสียประโยชน์เป็นข้อที่ยากที่สุด',
    r2: 'ผลประโยชน์ส่วนรวมต้องคิดถึงความเป็นธรรมและผลที่เกิดกับทุกคนในเมือง',
    r3: 'นึกถึงการแบ่งหน้าที่ทำความสะอาดและการรับผิดชอบงานของตัวเองตามจริง',
  },
  {
    r1: 'ข้อที่มีเวลาจำกัดตัดสินใจยาก เพราะต้องอ่านเหตุผลและคิดถึงผลกระทบให้รอบด้าน',
    r2: 'ภาพเมืองทำให้เห็นชัดว่าความซื่อสัตย์ช่วยรักษาสิ่งที่ทุกคนใช้ร่วมกัน',
    r3: 'นึกถึงการใช้เงินห้องอย่างเปิดเผยและให้ทุกคนตรวจสอบรายการได้',
  },
])

const rotateResponses = (responses, offset) => responses.map((_, index) => responses[(index + offset) % responses.length])

const postResponsesFor = (clientIndex) => {
  const improvedEnd = Math.round(botCount * 2 / 3)
  const unchangedEnd = improvedEnd + Math.round(botCount / 6)
  if (clientIndex < improvedEnd) return rotateResponses(POST_IMPROVED_RESPONSES, clientIndex)
  if (clientIndex < unchangedEnd) {
    return Array.from({ length: 10 }, (_, questionIndex) => 1 + ((clientIndex + questionIndex * 2) % 5))
  }
  return rotateResponses(POST_DECREASED_RESPONSES, clientIndex)
}

const integrityRateForQuestion = (questionNumber, gameCycle) =>
  cycleFlip
    ? (gameCycle === 0 ? 1 : 0)
    : earlyCorruptThrough > 0
    ? (questionNumber <= earlyCorruptThrough ? 0 : 1)
    : lateCorruptFrom > 0
      ? (questionNumber < lateCorruptFrom ? 1 : 0)
      : integrityRate

const integrityRateForCrisis = (eventIndex, gameCycle) =>
  cycleFlip
    ? (gameCycle === 0 ? 1 : 0)
    : earlyCorruptThrough > 0
    ? (eventIndex === 1 ? 0 : 1)
    : lateCorruptFrom > 0
      ? (eventIndex === 1 && lateCorruptFrom > 4 ? 1 : 0)
      : integrityRate

const parseCsv = (csv) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') field += character
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const loadIntegrityChoiceIds = async () => {
  const response = await fetch(QUESTION_CSV_URL)
  if (!response.ok) throw new Error(`โหลดเฉลยคำถามไม่สำเร็จ: HTTP ${response.status}`)
  const rows = parseCsv(await response.text())
  const headers = rows[0] ?? []
  const questionIdIndex = headers.indexOf('question_id')
  const integrityChoiceIndex = headers.indexOf('integrity_choice')
  const activeIndex = headers.indexOf('active')
  if (questionIdIndex < 0 || integrityChoiceIndex < 0 || activeIndex < 0) {
    throw new Error('Google Sheets ไม่มีคอลัมน์สำหรับเฉลยที่จำเป็น')
  }
  return new Map(rows.slice(1).filter((rowItem) => rowItem[activeIndex]?.toUpperCase() === 'TRUE').map((rowItem) => {
    const questionId = rowItem[questionIdIndex]
    return [questionId, `${questionId}-c${rowItem[integrityChoiceIndex]}`]
  }))
}

const envText = await readFile(resolve(process.cwd(), envFile), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      const key = line.slice(0, separator)
      const value = line.slice(separator + 1).replace(/^(['"])(.*)\1$/, '$2')
      return [key, value]
    }),
)

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

if (Object.values(firebaseConfig).some((value) => !value)) throw new Error('Firebase configuration is incomplete')
// This script floods Firestore with bulk simulated writes, bypassing the
// UI — always refuse the production project, even when --target firebase
// is pointed at a real project (e.g. staging) rather than the emulator.
assertNotProductionProject(firebaseConfig.projectId, 'classroom-bots load test')

const fnvHash = (value) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const runId = Date.now().toString(36).slice(-4)
const clients = []
const submittedRounds = new Set()
const submittedCrisisEvents = new Set()
const integrityChoiceIds = await loadIntegrityChoiceIds()
let answerInProgress = null
let preAssessmentInProgress = false
let preAssessmentSubmitted = false
let postActivityAssessmentPromise = null
let postActivityAssessmentSubmitted = false
let stopRoomSubscription = () => undefined
let shuttingDown = false
let keepAliveTimer = null

const createClient = async (index) => {
  const app = initializeApp(firebaseConfig, `classroom-bot-${roomId}-${runId}-${index}`)
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  const credential = await signInAnonymously(auth)
  const nickname = `${nicknamePrefix} ${String(index + 1).padStart(2, '0')}`
  const nicknameKey = nickname.toLocaleLowerCase('th')
  const playerId = `player-${fnvHash(nicknameKey)}`
  const classSection = ['1/1', '1/2', '1/3'][index % 3]
  const studentNumber = Math.floor(index / 3) + 1
  return { app, auth, db, uid: credential.user.uid, nickname, nicknameKey, playerId, classSection, studentNumber, index }
}

const joinClient = async (client) => {
  const roomReference = doc(client.db, 'rooms', roomId)
  const roomSnapshot = await getDoc(roomReference)
  if (!roomSnapshot.exists()) throw new Error(`ไม่พบห้อง ${roomId}`)

  const playerReference = doc(client.db, 'rooms', roomId, 'players', client.playerId)
  const existing = await getDoc(playerReference)
  if (existing.exists()) {
    if (existing.data().nicknameKey !== client.nicknameKey) throw new Error(`ชื่อ ${client.nickname} ถูกใช้แล้วในห้อง`)
    // Anonymous sessions are intentionally recoverable. Reclaim only this
    // deterministic bot player so a restarted runner can continue PRE and
    // gameplay without adding duplicate roster entries.
    await setDoc(playerReference, {
      ownerUid: client.uid,
      lastSeenAt: serverTimestamp(),
    }, { merge: true })
    return
  }

  if (postOnly) throw new Error(`ไม่พบบอตเดิม ${client.nickname} สำหรับส่งแบบประเมินหลังจบ`)
  if (roomSnapshot.data().status !== 'lobby') throw new Error(`ห้อง ${roomId} เริ่มเกมแล้ว จึงเพิ่มบอตไม่ได้`)

  await setDoc(playerReference, {
    playerId: client.playerId,
    nickname: client.nickname,
    nicknameKey: client.nicknameKey,
    classSection: client.classSection,
    studentNumber: client.studentNumber,
    ownerUid: client.uid,
    roleId: null,
    roleHistory: [],
    roleOffset: null,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  })
}

const createAssessmentOnce = async (client, assessmentId, payload) => {
  const assessmentReference = doc(client.db, 'rooms', roomId, 'assessments', assessmentId)
  try {
    await setDoc(assessmentReference, payload)
  } catch (error) {
    const existing = await getDoc(assessmentReference).catch(() => null)
    if (existing?.exists() && existing.data().ownerUid === client.uid) return
    throw error
  }
}

const submitPreAssessments = async () => {
  if (preAssessmentSubmitted || preAssessmentInProgress) return
  preAssessmentInProgress = true
  try {
    const results = await Promise.all(clients.map((client) => {
      const responses = Array.from({ length: 10 }, (_, questionIndex) =>
        1 + ((client.index + questionIndex * 2) % 5))
      return setDoc(doc(client.db, 'rooms', roomId, 'assessments', `pre::${client.playerId}`), {
        schemaVersion: 1,
        recordType: 'pre',
        roomId,
        playerId: client.playerId,
        ownerUid: client.uid,
        responses,
        submittedAt: serverTimestamp(),
      }).then(
        () => ({ status: 'fulfilled' }),
        (reason) => ({ status: 'rejected', reason }),
      )
    }))
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      const firstError = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
      console.error(`[bots] แบบประเมินก่อนกิจกรรม: สำเร็จ ${botCount - failures.length}/${botCount}; ล้มเหลว ${failures.length}: ${firstError}`)
      return
    }
    preAssessmentSubmitted = true
    console.log(`[bots] แบบประเมินก่อนกิจกรรม: ส่งครบ ${botCount}/${botCount}`)
  } finally {
    preAssessmentInProgress = false
  }
}

const submitPostActivityAssessments = () => {
  if (postActivityAssessmentSubmitted) return Promise.resolve()
  if (postActivityAssessmentPromise) return postActivityAssessmentPromise
  postActivityAssessmentPromise = (async () => {
    const results = await Promise.all(clients.map(async (client) => {
      const reflection = REFLECTION_VARIANTS[client.index % REFLECTION_VARIANTS.length]
      try {
        await createAssessmentOnce(client, `post::${client.playerId}`, {
          schemaVersion: 1,
          recordType: 'post',
          roomId,
          playerId: client.playerId,
          ownerUid: client.uid,
          responses: postResponsesFor(client.index),
          submittedAt: serverTimestamp(),
        })
        await createAssessmentOnce(client, `reflection::${client.playerId}`, {
          schemaVersion: 1,
          recordType: 'reflection',
          roomId,
          playerId: client.playerId,
          ownerUid: client.uid,
          ...reflection,
          submittedAt: serverTimestamp(),
        })
        return { status: 'fulfilled' }
      } catch (reason) {
        return { status: 'rejected', reason }
      }
    }))
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      const firstError = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
      throw new Error(`POST/Reflection สำเร็จ ${botCount - failures.length}/${botCount}; ล้มเหลว ${failures.length}: ${firstError}`)
    }
    postActivityAssessmentSubmitted = true
    console.log(`[bots] แบบประเมินหลังจบ: POST ${botCount}/${botCount}; Reflection ${botCount}/${botCount}`)
  })().finally(() => { postActivityAssessmentPromise = null })
  return postActivityAssessmentPromise
}

const answerCurrentQuestion = async (room) => {
  if (room.currentQuestionNumber > maxQuestion) return
  const roundKey = `${room.gameCycle}::${room.currentQuestionNumber}`
  if (submittedRounds.has(roundKey) || answerInProgress === roundKey) return
  answerInProgress = roundKey

  try {
    const monitorDb = clients[0].db
    const [playersSnapshot, questionsSnapshot] = await Promise.all([
      getDocs(collection(monitorDb, 'rooms', roomId, 'players')),
      getDocs(collection(monitorDb, 'rooms', roomId, 'questions')),
    ])
    const players = new Map(playersSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]))
    const questions = questionsSnapshot.docs.map((snapshot) => snapshot.data())

    const results = []
    for (const [clientIndex, client] of clients.entries()) {
      const result = await Promise.resolve().then(async () => {
        const player = players.get(client.playerId)
        if (!player?.roleId) throw new Error(`${client.nickname} ยังไม่มีอาชีพ`)
        const question = questions.find(
          (item) => item.roleId === player.roleId && item.questionNumber === room.currentQuestionNumber,
        )
        if (!question) throw new Error(`ไม่พบคำถามของ ${client.nickname}`)
        const integrityChoiceId = integrityChoiceIds.get(question.questionId)
        if (!integrityChoiceId) throw new Error(`ไม่มีเฉลยสำหรับ ${question.questionId}`)
        const integrityBotCount = Math.round(botCount * integrityRateForQuestion(room.currentQuestionNumber, room.gameCycle))
        const choosesIntegrity = (buildingSpreadWorstCity || buildingSpreadBestCity)
          ? shouldChooseIntegrityForSpreadQuestion(player.roleId, room.currentQuestionNumber, client.index, room.gameCycle)
          : client.index < integrityBotCount
        const targetChoiceId = choosesIntegrity
          ? integrityChoiceId
          : question.choices.find((choiceItem) => choiceItem.id !== integrityChoiceId)?.id
        const choice = question.choices.find((choiceItem) => choiceItem.id === targetChoiceId)
        if (!choice) throw new Error(`ตัวเลือกของ ${question.questionId} ไม่ตรงกับ Google Sheets`)
        const answerId = `${room.gameCycle}::${client.playerId}::${question.questionId}`
        await setDoc(doc(client.db, 'rooms', roomId, 'answers', answerId), {
          recordType: 'question',
          answerId,
          roomId,
          playerId: client.playerId,
          ownerUid: client.uid,
          gameCycle: room.gameCycle,
          questionNumber: room.currentQuestionNumber,
          questionId: question.questionId,
          choiceId: choice.id,
          submittedAt: serverTimestamp(),
        })
      }).then(
        () => ({ status: 'fulfilled' }),
        (reason) => ({ status: 'rejected', reason }),
      )
      results.push(result)
      if (staggerMs > 0 && clientIndex < clients.length - 1) await pause(staggerMs)
    }

    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      const firstError = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
      console.error(`[bots] ชุด ${room.gameCycle + 1} ข้อ ${room.currentQuestionNumber}: สำเร็จ ${botCount - failures.length}/${botCount}; ล้มเหลว ${failures.length}: ${firstError}`)
      return
    }

    submittedRounds.add(roundKey)
    console.log(`[bots] ชุด ${room.gameCycle + 1} ข้อ ${room.currentQuestionNumber}: ตอบครบ ${botCount}/${botCount}`)
  } finally {
    answerInProgress = null
  }
}

const answerCurrentCrisis = async (room) => {
  if (!room.currentCrisisEventId || !Number.isInteger(room.currentCrisisEventIndex) || room.currentCrisisEventIndex < 1) return
  const eventKey = `${room.gameCycle}::crisis::${room.currentCrisisEventId}`
  if (submittedCrisisEvents.has(eventKey) || answerInProgress === eventKey) return
  answerInProgress = eventKey

  try {
    const playersSnapshot = await getDocs(collection(clients[0].db, 'rooms', roomId, 'players'))
    const players = new Map(playersSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]))
    const integrityBotCount = Math.round(botCount * integrityRateForCrisis(room.currentCrisisEventIndex, room.gameCycle))
    const results = []

    for (const [clientIndex, client] of clients.entries()) {
      const result = await Promise.resolve().then(async () => {
        const player = players.get(client.playerId)
        if (!player?.roleId) throw new Error(`${client.nickname} ยังไม่มีอาชีพ`)
        const choosesIntegrity = (buildingSpreadWorstCity || buildingSpreadBestCity)
          ? shouldChooseIntegrityForSpreadCrisis(player.roleId, room.currentCrisisEventIndex, client.index, room.gameCycle)
          : client.index < integrityBotCount
        const stance = choosesIntegrity ? 'integrity' : 'corruption'
        const answerId = `${room.gameCycle}::${client.playerId}::crisis::${room.currentCrisisEventId}`
        await setDoc(doc(client.db, 'rooms', roomId, 'answers', answerId), {
          recordType: 'crisis',
          answerId,
          roomId,
          playerId: client.playerId,
          ownerUid: client.uid,
          gameCycle: room.gameCycle,
          eventIndex: room.currentCrisisEventIndex,
          eventId: room.currentCrisisEventId,
          roleId: player.roleId,
          choiceId: `${room.currentCrisisEventId}:${player.roleId}:${stance}`,
          submittedAt: serverTimestamp(),
        })
      }).then(
        () => ({ status: 'fulfilled' }),
        (reason) => ({ status: 'rejected', reason }),
      )
      results.push(result)
      if (staggerMs > 0 && clientIndex < clients.length - 1) await pause(staggerMs)
    }

    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      const firstError = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
      console.error(`[bots] วิกฤต ${room.currentCrisisEventIndex}: สำเร็จ ${botCount - failures.length}/${botCount}; ล้มเหลว ${failures.length}: ${firstError}`)
      return
    }

    submittedCrisisEvents.add(eventKey)
    console.log(`[bots] วิกฤต ${room.currentCrisisEventIndex}: ตอบครบ ${botCount}/${botCount}`)
  } finally {
    answerInProgress = null
  }
}

const shutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[bots] กำลังหยุด (${signal})`)
  stopRoomSubscription()
  if (keepAliveTimer) clearInterval(keepAliveTimer)
  await Promise.all(clients.map(async (client) => {
    try { await deleteApp(client.app) } catch {}
  }))
  process.exit(0)
}

process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })

const profileDescription = buildingSpreadWorstCity
  ? 'ชุดแรกเมือง 0; อาคาร -2,-1,0,+1,+2 แบบกระจาย'
  : buildingSpreadBestCity
    ? 'ชุดแรกเมืองเจริญ; อาคาร -2,-1,0,+1,+2 แบบกระจาย'
    : cycleFlip
    ? 'ชุดแรกสุจริตทั้งหมด ชุดถัดไปทุจริตทั้งหมด'
    : earlyCorruptThrough > 0
      ? `ทุจริตทั้งหมดถึงข้อ ${earlyCorruptThrough} แล้วสุจริตทั้งหมด`
      : lateCorruptFrom > 0
        ? `สุจริตทั้งหมดถึงข้อ ${lateCorruptFrom - 1} แล้วทุจริตทั้งหมด`
        : `สุจริต ${Math.round(integrityRate * 100)}%`
console.log(`[bots] กำลังสร้าง ${botCount} เซสชันสำหรับห้อง ${roomId} บน ${firebaseConfig.projectId}; ${postOnly ? 'ส่ง POST/Reflection ให้บอตเดิมหลังจบเท่านั้น' : profileDescription}; เว้นคำตอบ ${staggerMs}ms; ถึงข้อ ${maxQuestion}`)
for (let start = 0; start < botCount; start += 8) {
  const batch = await Promise.all(
    Array.from({ length: Math.min(8, botCount - start) }, (_, offset) => createClient(start + offset)),
  )
  clients.push(...batch)
  if (clients.length < botCount) await pause(350)
}

for (let start = 0; start < clients.length; start += 8) {
  await Promise.all(clients.slice(start, start + 8).map(joinClient))
}

const monitorDb = clients[0].db
const rosterSnapshot = await getDocs(collection(monitorDb, 'rooms', roomId, 'players'))
console.log(`[bots] เข้าห้องสำเร็จ ${botCount} คน; roster ปัจจุบัน ${rosterSnapshot.size} คน`)
console.log(postOnly ? '[bots] พร้อมส่ง POST/Reflection ให้ผู้เล่นเดิม' : '[bots] พร้อมตอบอัตโนมัติเมื่อครูเริ่มคำถาม กด Ctrl+C เพื่อหยุดบอต')

stopRoomSubscription = onSnapshot(doc(monitorDb, 'rooms', roomId), (snapshot) => {
  if (!snapshot.exists()) return
  const room = snapshot.data()
  if (room.preAssessmentOpened && !postOnly && room.status !== 'finished') {
    void submitPreAssessments().catch((error) => {
      console.error(`[bots] ส่งแบบประเมินก่อนกิจกรรมไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (!postOnly && room.status === 'playing' && Number.isInteger(room.currentQuestionNumber) && room.currentQuestionNumber > 0) {
    void answerCurrentQuestion(room).catch((error) => {
      console.error(`[bots] ตอบคำถามไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (!postOnly && room.status === 'crisis-playing') {
    void answerCurrentCrisis(room).catch((error) => {
      console.error(`[bots] ตอบเหตุการณ์วิกฤตไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (room.status === 'finished') {
    void submitPostActivityAssessments()
      .then(() => shutdown('room finished; POST/Reflection complete'))
      .catch((error) => {
        console.error(`[bots] ส่งแบบประเมินหลังจบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      })
  }
  if (room.status === 'closed') void shutdown('room closed')
}, (error) => {
  console.error(`[bots] realtime error: ${error.message}`)
})

keepAliveTimer = setInterval(() => undefined, 60_000)
