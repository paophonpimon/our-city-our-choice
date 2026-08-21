#!/usr/bin/env node
// Runs before `vite build --mode staging` (see package.json's build:staging
// script). Reads .env.staging.local IN ISOLATION — never .env.local — and
// fails the whole build before Vite even starts if it's missing, incomplete,
// or points at the production project. See scripts/lib/stagingEnvValidator.mjs
// for why this can't just be left to Vite's own env loading.
import { readFile } from 'node:fs/promises'
import {
  parseEnvFileContent,
  StagingEnvValidationError,
  validateStagingFirebaseEnv,
} from './lib/stagingEnvValidator.mjs'

const ENV_PATH = new URL('../.env.staging.local', import.meta.url)

let text
try {
  text = await readFile(ENV_PATH, 'utf8')
} catch {
  console.error(
    '[build:staging] .env.staging.local not found. Create it with the staging project\'s VITE_FIREBASE_* values ' +
      '(see .env.example) before building — it is never allowed to fall back to .env.local.',
  )
  process.exit(1)
}

try {
  validateStagingFirebaseEnv(parseEnvFileContent(text))
} catch (error) {
  if (error instanceof StagingEnvValidationError) {
    console.error(`[build:staging] ${error.message}`)
    process.exit(1)
  }
  throw error
}

console.log('[build:staging] .env.staging.local is complete and valid — proceeding with the staging build.')
