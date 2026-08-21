import { describe, expect, it } from 'vitest'
import { stableBalancedPattern, stableCoinFlip, stableHash } from './deterministicOrder'

describe('stableHash / stableCoinFlip', () => {
  it('is deterministic for the same seed', () => {
    expect(stableHash('a-b-c')).toBe(stableHash('a-b-c'))
    expect(stableCoinFlip('room:player:event')).toBe(stableCoinFlip('room:player:event'))
  })

  it('produces both outcomes across different seeds', () => {
    const outcomes = new Set(Array.from({ length: 20 }, (_, index) => stableCoinFlip(`seed-${index}`)))
    expect(outcomes.size).toBe(2)
  })
})

describe('stableBalancedPattern', () => {
  it('produces exactly trueCount true values out of totalCount', () => {
    const pattern = stableBalancedPattern('seed-a', 5, 10)
    expect(pattern).toHaveLength(10)
    expect(pattern.filter(Boolean)).toHaveLength(5)
  })

  it('is deterministic for the same seed', () => {
    expect(stableBalancedPattern('seed-b', 5, 10)).toEqual(stableBalancedPattern('seed-b', 5, 10))
  })

  it('varies the arrangement across different seeds', () => {
    const arrangements = new Set(
      Array.from({ length: 15 }, (_, index) => stableBalancedPattern(`seed-${index}`, 5, 10).join('')),
    )
    expect(arrangements.size).toBeGreaterThan(1)
  })

  it('handles edge cases (0 and totalCount)', () => {
    expect(stableBalancedPattern('seed-c', 0, 10).filter(Boolean)).toHaveLength(0)
    expect(stableBalancedPattern('seed-c', 10, 10).filter(Boolean)).toHaveLength(10)
  })

  it('rejects an out-of-range trueCount', () => {
    expect(() => stableBalancedPattern('seed-d', -1, 10)).toThrow()
    expect(() => stableBalancedPattern('seed-d', 11, 10)).toThrow()
  })
})
