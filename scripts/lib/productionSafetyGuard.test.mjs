import { describe, expect, it } from 'vitest'
import {
  assertNotProductionProject,
  assertNotProductionUrl,
  ProductionSafetyError,
} from './productionSafetyGuard.mjs'

describe('production-target refusal', () => {
  it('refuses the production Firebase project id', () => {
    expect(() => assertNotProductionProject('our-city-our-choice', 'test')).toThrow(ProductionSafetyError)
  })

  it('allows a non-production project id (e.g. staging, once configured)', () => {
    expect(() => assertNotProductionProject('our-city-our-choice-staging', 'test')).not.toThrow()
    expect(() => assertNotProductionProject('demo-our-city-rules-test', 'test')).not.toThrow()
  })

  it('refuses both production hosting hostnames', () => {
    expect(() => assertNotProductionUrl('https://our-city-our-choice.web.app', 'test')).toThrow(ProductionSafetyError)
    expect(() => assertNotProductionUrl('https://our-city-our-choice.web.app/join?room=ABCD', 'test')).toThrow(ProductionSafetyError)
    expect(() => assertNotProductionUrl('https://our-city-our-choice.firebaseapp.com', 'test')).toThrow(ProductionSafetyError)
  })

  it('allows a non-production hosting url (staging, local, emulator UI, etc.)', () => {
    expect(() => assertNotProductionUrl('https://our-city-our-choice-staging.web.app', 'test')).not.toThrow()
    expect(() => assertNotProductionUrl('http://127.0.0.1:5173', 'test')).not.toThrow()
    expect(() => assertNotProductionUrl('http://localhost:4173', 'test')).not.toThrow()
  })

  it('error message names the offending context so a blocked run is easy to diagnose', () => {
    try {
      assertNotProductionProject('our-city-our-choice', 'classroom-bots load test')
      throw new Error('expected assertNotProductionProject to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionSafetyError)
      expect(error.message).toContain('classroom-bots load test')
      expect(error.message).toContain('our-city-our-choice')
    }
  })
})
