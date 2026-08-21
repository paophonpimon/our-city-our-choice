import { readFile } from 'node:fs/promises'
import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const EXPECTED_PROJECT_ID = 'our-city-our-choice'
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
if ([earlyCorruptThrough > 0, lateCorruptFrom > 0, cycleFlip].filter(Boolean).length > 1) {
  throw new Error('เลือกใช้โปรไฟล์คำตอบได้ครั้งละหนึ่งแบบเท่านั้น')
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

const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
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
if (firebaseConfig.projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(`Refusing to use Firebase project ${firebaseConfig.projectId}; expected ${EXPECTED_PROJECT_ID}`)
}

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
let stopRoomSubscription = () => undefined
let shuttingDown = false
let keepAliveTimer = null

const createClient = async (index) => {
  const app = initializeApp(firebaseConfig, `classroom-bot-${roomId}-${runId}-${index}`)
  const auth = getAuth(app)
  const credential = await signInAnonymously(auth)
  const db = getFirestore(app)
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
  if (roomSnapshot.data().status !== 'lobby') throw new Error(`ห้อง ${roomId} เริ่มเกมแล้ว จึงเพิ่มบอตไม่ได้`)

  const playerReference = doc(client.db, 'rooms', roomId, 'players', client.playerId)
  const existing = await getDoc(playerReference)
  if (existing.exists()) throw new Error(`ชื่อ ${client.nickname} ถูกใช้แล้วในห้อง`)

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
        const targetChoiceId = client.index < integrityBotCount
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
        const stance = client.index < integrityBotCount ? 'integrity' : 'corruption'
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

console.log(`[bots] กำลังสร้าง ${botCount} เซสชันสำหรับห้อง ${roomId} บน ${EXPECTED_PROJECT_ID}; ${cycleFlip ? 'ชุดแรกสุจริตทั้งหมด ชุดถัดไปทุจริตทั้งหมด' : earlyCorruptThrough > 0 ? `ทุจริตทั้งหมดถึงข้อ ${earlyCorruptThrough} แล้วสุจริตทั้งหมด` : lateCorruptFrom > 0 ? `สุจริตทั้งหมดถึงข้อ ${lateCorruptFrom - 1} แล้วทุจริตทั้งหมด` : `สุจริต ${Math.round(integrityRate * 100)}%`}; เว้นคำตอบ ${staggerMs}ms; ถึงข้อ ${maxQuestion}`)
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
console.log('[bots] พร้อมตอบอัตโนมัติเมื่อครูเริ่มคำถาม กด Ctrl+C เพื่อหยุดบอต')

stopRoomSubscription = onSnapshot(doc(monitorDb, 'rooms', roomId), (snapshot) => {
  if (!snapshot.exists()) return
  const room = snapshot.data()
  if (room.status === 'playing' && Number.isInteger(room.currentQuestionNumber) && room.currentQuestionNumber > 0) {
    void answerCurrentQuestion(room).catch((error) => {
      console.error(`[bots] ตอบคำถามไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (room.status === 'crisis-playing') {
    void answerCurrentCrisis(room).catch((error) => {
      console.error(`[bots] ตอบเหตุการณ์วิกฤตไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (room.status === 'finished' || room.status === 'closed') void shutdown(`room ${room.status}`)
}, (error) => {
  console.error(`[bots] realtime error: ${error.message}`)
})

keepAliveTimer = setInterval(() => undefined, 60_000)
