#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { doc, getDoc, getFirestore, terminate } from 'firebase/firestore'
import { parseEnvFileContent, validateStagingFirebaseEnv } from './lib/stagingEnvValidator.mjs'
import { freezeCityBuildingsSource, validateStagingPublishedLayout } from './lib/layoutFreeze.mjs'

const envPath = new URL('../.env.staging.local', import.meta.url)
const sourcePath = new URL('../src/domain/cityBuildings.ts', import.meta.url)
const env = parseEnvFileContent(await readFile(envPath, 'utf8'))
validateStagingFirebaseEnv(env)

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}, `layout-freeze-${Date.now()}`)
const auth = getAuth(app)
const firestore = getFirestore(app)

try {
  await signInAnonymously(auth)
  const publishedDocument = await getDoc(doc(firestore, 'cityLayoutPublished/current'))
  if (!publishedDocument.exists()) throw new Error('Staging has no cityLayoutPublished/current document; publish a complete layout first')
  const validated = validateStagingPublishedLayout(publishedDocument.data())
  const before = await readFile(sourcePath, 'utf8')
  const after = freezeCityBuildingsSource(before, validated)
  await writeFile(sourcePath, after, 'utf8')

  console.log(`[layout:freeze-staging] version: ${validated.versionId}`)
  console.log(`[layout:freeze-staging] validated: ${validated.count}/105 placements`)
  console.log(`[layout:freeze-staging] source: src/domain/cityBuildings.ts`)
  console.log(`[layout:freeze-staging] changed: ${before === after ? 'NO (already frozen)' : 'YES — review git diff before committing'}`)
  console.log('[layout:freeze-staging] no deploy, commit, or push was performed')
} finally {
  await terminate(firestore).catch(() => undefined)
  await deleteApp(app).catch(() => undefined)
}
