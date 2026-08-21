import { describe, expect, it } from 'vitest'
import {
  parseEnvFileContent,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
  StagingEnvValidationError,
  validateStagingFirebaseEnv,
} from './stagingEnvValidator.mjs'

// Obviously-fake placeholder values — not real credentials of any kind.
const completeStagingEnv = () => ({
  VITE_FIREBASE_API_KEY: 'fake-staging-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'our-city-our-choice-staging.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: 'our-city-our-choice-staging.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '111111111111',
  VITE_FIREBASE_APP_ID: '1:111111111111:web:fakestagingappid',
})

describe('validateStagingFirebaseEnv', () => {
  it('1. passes a complete, explicit staging config', () => {
    expect(() => validateStagingFirebaseEnv(completeStagingEnv())).not.toThrow()
  })

  it('2. fails when one required staging Firebase value is missing', () => {
    const env = completeStagingEnv()
    delete env.VITE_FIREBASE_API_KEY
    expect(() => validateStagingFirebaseEnv(env)).toThrow(StagingEnvValidationError)
    expect(() => validateStagingFirebaseEnv(env)).toThrow(/VITE_FIREBASE_API_KEY/)
  })

  it('2b. fails the same way when a required value is present but empty', () => {
    const env = completeStagingEnv()
    env.VITE_FIREBASE_APP_ID = ''
    expect(() => validateStagingFirebaseEnv(env)).toThrow(/VITE_FIREBASE_APP_ID/)
  })

  it('3. production values cannot silently fill a missing staging value — the function has no fallback source to reach for', () => {
    // Simulates the exact bug: .env.staging.local sets only the project id
    // and nothing else. validateStagingFirebaseEnv only ever sees what's
    // passed to it — it never reads .env.local — so there is no value it
    // could "borrow" from anywhere to make this look complete.
    const incompleteEnv = { VITE_FIREBASE_PROJECT_ID: STAGING_FIREBASE_PROJECT_ID }
    expect(() => validateStagingFirebaseEnv(incompleteEnv)).toThrow(StagingEnvValidationError)
    try {
      validateStagingFirebaseEnv(incompleteEnv)
    } catch (error) {
      // Every other required key is reported missing — none got filled in.
      for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID']) {
        expect(error.message).toContain(key)
      }
    }
  })

  it('4. staging projectId cannot be production, even with every other value present', () => {
    const env = completeStagingEnv()
    env.VITE_FIREBASE_PROJECT_ID = PRODUCTION_FIREBASE_PROJECT_ID
    expect(() => validateStagingFirebaseEnv(env)).toThrow(StagingEnvValidationError)
    expect(() => validateStagingFirebaseEnv(env)).toThrow(/production project/)
  })

  it('rejects a project id that is neither staging nor production', () => {
    const env = completeStagingEnv()
    env.VITE_FIREBASE_PROJECT_ID = 'some-other-project'
    expect(() => validateStagingFirebaseEnv(env)).toThrow(StagingEnvValidationError)
  })
})

describe('parseEnvFileContent', () => {
  it('parses KEY=VALUE lines and ignores blank lines / comments', () => {
    const parsed = parseEnvFileContent(
      ['# a comment', '', 'VITE_FIREBASE_PROJECT_ID=our-city-our-choice-staging', '  VITE_FIREBASE_API_KEY = fake  '].join('\n'),
    )
    expect(parsed.VITE_FIREBASE_PROJECT_ID).toBe('our-city-our-choice-staging')
    expect(parsed.VITE_FIREBASE_API_KEY).toBe('fake')
  })

  it('only ever reflects the content it was given — proves there is no second file involved', () => {
    const parsed = parseEnvFileContent('VITE_FIREBASE_PROJECT_ID=our-city-our-choice-staging')
    expect(Object.keys(parsed)).toEqual(['VITE_FIREBASE_PROJECT_ID'])
  })
})
