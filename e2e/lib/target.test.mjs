import { describe, expect, it } from 'vitest'
import {
  assertProductionNeverAllowed,
  assertProductionUsageAllowed,
  isProductionUrl,
  MAX_PRODUCTION_SMOKE_STUDENTS,
  resolveBaseUrl,
} from './target.mjs'

const PRODUCTION_URL = 'https://our-city-our-choice.web.app'
const STAGING_URL = 'https://our-city-our-choice-staging.web.app'
const LOCAL_URL = 'http://localhost:5173'

describe('E2E target resolution (no silent default to production)', () => {
  it('refuses to run with no target or base-url specified at all', () => {
    expect(() => resolveBaseUrl(['node', 'run-flow.mjs', '--students', '6'])).toThrow(/explicitly/)
  })

  it('resolves --target production to the known production URL only when asked explicitly', () => {
    expect(resolveBaseUrl(['node', 'run-flow.mjs', '--target', 'production'])).toBe('https://our-city-our-choice.web.app')
  })

  it('refuses --target staging until a staging URL is known', () => {
    expect(() => resolveBaseUrl(['node', 'run-flow.mjs', '--target', 'staging'])).toThrow(/staging/)
  })

  it('rejects an unrecognized --target', () => {
    expect(() => resolveBaseUrl(['node', 'run-flow.mjs', '--target', 'nonsense'])).toThrow(/Unknown --target/)
  })

  it('accepts any explicit --base-url regardless of --target (local, staging once deployed, etc.)', () => {
    expect(resolveBaseUrl(['node', 'run-flow.mjs', '--base-url', 'http://localhost:5173'])).toBe('http://localhost:5173')
    expect(resolveBaseUrl(['node', 'run-flow.mjs', '--base-url', 'https://our-city-our-choice-staging.web.app'])).toBe(
      'https://our-city-our-choice-staging.web.app',
    )
  })

  it('prefers an explicit --base-url over --target if both are somehow given', () => {
    expect(
      resolveBaseUrl(['node', 'run-flow.mjs', '--target', 'production', '--base-url', 'http://localhost:5173']),
    ).toBe('http://localhost:5173')
  })
})

describe('isProductionUrl', () => {
  it('recognizes the production hosting URL, including with a path', () => {
    expect(isProductionUrl(PRODUCTION_URL)).toBe(true)
    expect(isProductionUrl(`${PRODUCTION_URL}/join?room=ABCD`)).toBe(true)
  })

  it('does not flag staging or local URLs', () => {
    expect(isProductionUrl(STAGING_URL)).toBe(false)
    expect(isProductionUrl(LOCAL_URL)).toBe(false)
  })

  it('is not fooled by a malformed URL', () => {
    expect(isProductionUrl('not-a-url')).toBe(false)
  })
})

describe('assertProductionUsageAllowed (run-flow.mjs smoke gate)', () => {
  it('refuses production without --smoke', () => {
    expect(() =>
      assertProductionUsageAllowed({ baseUrl: PRODUCTION_URL, smoke: false, studentCount: 1, context: 'test' }),
    ).toThrow(/smoke/)
  })

  it('allows production with --smoke at or under the student cap', () => {
    expect(() =>
      assertProductionUsageAllowed({ baseUrl: PRODUCTION_URL, smoke: true, studentCount: MAX_PRODUCTION_SMOKE_STUDENTS, context: 'test' }),
    ).not.toThrow()
    expect(() =>
      assertProductionUsageAllowed({ baseUrl: PRODUCTION_URL, smoke: true, studentCount: 1, context: 'test' }),
    ).not.toThrow()
  })

  it('refuses production with --smoke over the student cap — no bypass by cranking up headcount', () => {
    expect(() =>
      assertProductionUsageAllowed({
        baseUrl: PRODUCTION_URL,
        smoke: true,
        studentCount: MAX_PRODUCTION_SMOKE_STUDENTS + 1,
        context: 'test',
      }),
    ).toThrow()
  })

  it('never restricts staging or local targets, smoke or not, at any headcount', () => {
    expect(() =>
      assertProductionUsageAllowed({ baseUrl: STAGING_URL, smoke: false, studentCount: 40, context: 'test' }),
    ).not.toThrow()
    expect(() =>
      assertProductionUsageAllowed({ baseUrl: LOCAL_URL, smoke: false, studentCount: 40, context: 'test' }),
    ).not.toThrow()
  })
})

describe('assertProductionNeverAllowed (two-rooms-flow.mjs / continue-city-flow.mjs)', () => {
  it('refuses production unconditionally', () => {
    expect(() => assertProductionNeverAllowed({ baseUrl: PRODUCTION_URL, context: 'test' })).toThrow()
  })

  it('never restricts staging or local targets', () => {
    expect(() => assertProductionNeverAllowed({ baseUrl: STAGING_URL, context: 'test' })).not.toThrow()
    expect(() => assertProductionNeverAllowed({ baseUrl: LOCAL_URL, context: 'test' })).not.toThrow()
  })
})
