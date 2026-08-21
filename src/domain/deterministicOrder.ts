// Small seeded-randomness helpers shared by question and crisis choice
// ordering. Everything here is a pure function of its seed string so the
// same (roomId, playerId, ...) always reproduces the same order across
// refresh/reconnect, with no stored mutable state.

export const stableHash = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export const stableCoinFlip = (seed: string): boolean => stableHash(seed) % 2 === 0

/**
 * Deterministically shuffles a fixed multiset of `trueCount` true values and
 * `totalCount - trueCount` false values, seeded by `seed`. Used to balance a
 * binary property (e.g. "integrity choice shown first") exactly across a
 * fixed-size sequence (e.g. the 10 questions in a cycle) while still varying
 * per seed.
 */
export const stableBalancedPattern = (seed: string, trueCount: number, totalCount: number): readonly boolean[] => {
  if (!Number.isInteger(trueCount) || !Number.isInteger(totalCount) || trueCount < 0 || trueCount > totalCount) {
    throw new Error('trueCount must be an integer between 0 and totalCount')
  }
  const pattern = Array.from({ length: totalCount }, (_, index) => index < trueCount)

  // xorshift32, seeded from stableHash — deterministic and seed-sensitive.
  let state = stableHash(seed) || 0x9e3779b9
  const nextUint32 = (): number => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }

  for (let i = pattern.length - 1; i > 0; i -= 1) {
    const j = nextUint32() % (i + 1)
    const temp = pattern[i]
    pattern[i] = pattern[j]
    pattern[j] = temp
  }
  return pattern
}
