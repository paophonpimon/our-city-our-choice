import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore'
import { assertNotProductionProject } from './lib/productionSafetyGuard.mjs'

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const roomId = String(argumentValue('--room', '')).trim().toUpperCase()
const envFile = String(argumentValue('--env-file', '.env.local')).trim()
if (!/^[A-HJ-NP-Z2-9]{4}$/.test(roomId)) throw new Error('ใช้ --room ตามด้วยรหัสห้อง 4 ตัว')

const envText = await readFile(resolve(process.cwd(), envFile), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      const value = line.slice(separator + 1).replace(/^(['"])(.*)\1$/, '$2')
      return [line.slice(0, separator), value]
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
assertNotProductionProject(firebaseConfig.projectId)

const app = initializeApp(firebaseConfig, `room-inspector-${Date.now()}`)
try {
  await signInAnonymously(getAuth(app))
  const db = getFirestore(app)
  const [roomSnapshot, playersSnapshot] = await Promise.all([
    getDoc(doc(db, 'rooms', roomId)),
    getDocs(collection(db, 'rooms', roomId, 'players')),
  ])
  if (!roomSnapshot.exists()) throw new Error(`ไม่พบห้อง ${roomId}`)
  const room = roomSnapshot.data()
  console.log(JSON.stringify({
    roomId,
    projectId: firebaseConfig.projectId,
    status: room.status,
    gameCycle: room.gameCycle,
    currentQuestionNumber: room.currentQuestionNumber,
    cityScore: room.cityScore,
    cityLevel: room.cityLevel,
    buildingScores: room.buildingScores,
    buildingLevels: room.buildingLevels,
    integrityTotal: room.integrityTotal,
    corruptionTotal: room.corruptionTotal,
    timeoutTotal: room.timeoutTotal,
    playerCount: playersSnapshot.size,
  }, null, 2))
} finally {
  await deleteApp(app)
}
