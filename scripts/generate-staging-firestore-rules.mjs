#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { buildStagingFirestoreRules } from './lib/stagingFirestoreRules.mjs'

const productionPath = new URL('../firestore.rules', import.meta.url)
const stagingPath = new URL('../firestore.staging.rules', import.meta.url)
const productionRules = await readFile(productionPath, 'utf8')
const stagingRules = buildStagingFirestoreRules(productionRules)
await writeFile(stagingPath, stagingRules, 'utf8')
console.log('[rules:staging] generated firestore.staging.rules from production rules; only the marked layout block differs.')
