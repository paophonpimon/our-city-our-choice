import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildStagingFirestoreRules } from './stagingFirestoreRules.mjs'

const production = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
const generated = readFileSync(new URL('../../firestore.staging.rules', import.meta.url), 'utf8')

describe('staging Firestore rules derivation', () => {
  it('keeps the generated file deterministic and synchronized', () => {
    expect(generated).toBe(buildStagingFirestoreRules(production))
  })

  it('changes only the marked layout block and leaves classroom rules identical', () => {
    const productionRooms = production.slice(production.indexOf('    match /rooms/{roomId}'))
    const stagingRooms = generated.slice(generated.indexOf('    match /rooms/{roomId}'))
    expect(stagingRooms).toBe(productionRooms)
    expect(generated).toContain('STAGING ONLY')
    expect(production).toContain('Production is deliberately frozen-source only')
  })
})
