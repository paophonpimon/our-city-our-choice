import { describe, expect, it } from 'vitest'
import { assertStagingBuildNotUsingProduction, FIREBASE_PROJECT_IDS, resolveFirebaseEnvironmentName } from './firebaseEnvironment'

describe('resolveFirebaseEnvironmentName', () => {
  it('recognizes the production project id (unchanged production behavior)', () => {
    expect(resolveFirebaseEnvironmentName('our-city-our-choice')).toBe('production')
    expect(resolveFirebaseEnvironmentName(FIREBASE_PROJECT_IDS.production)).toBe('production')
  })

  it('recognizes the reserved staging project id', () => {
    expect(resolveFirebaseEnvironmentName('our-city-our-choice-staging')).toBe('staging')
    expect(resolveFirebaseEnvironmentName(FIREBASE_PROJECT_IDS.staging)).toBe('staging')
  })

  it('rejects any other project id', () => {
    expect(resolveFirebaseEnvironmentName('some-other-project')).toBeNull()
    expect(resolveFirebaseEnvironmentName('')).toBeNull()
    expect(resolveFirebaseEnvironmentName('our-city-our-choice-dev')).toBeNull()
  })
})

describe('assertStagingBuildNotUsingProduction', () => {
  it('throws when a staging-mode build resolved the production project (missing/incomplete .env.staging.local)', () => {
    expect(() => assertStagingBuildNotUsingProduction('staging', 'production')).toThrow()
  })

  it('does not throw for a correctly configured staging build', () => {
    expect(() => assertStagingBuildNotUsingProduction('staging', 'staging')).not.toThrow()
  })

  it('does not throw for a normal production build (mode=production, unchanged behavior)', () => {
    expect(() => assertStagingBuildNotUsingProduction('production', 'production')).not.toThrow()
  })

  it('does not throw outside staging mode even if somehow resolved to production (dev, test, etc.)', () => {
    expect(() => assertStagingBuildNotUsingProduction('development', 'production')).not.toThrow()
    expect(() => assertStagingBuildNotUsingProduction(undefined, 'production')).not.toThrow()
  })
})
