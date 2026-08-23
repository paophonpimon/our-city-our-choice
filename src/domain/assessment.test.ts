import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_SCALE,
  isValidAssessmentResponses,
  meanAssessmentResponses,
  PRE_ASSESSMENT_ITEM_COUNT,
  PRE_ASSESSMENT_ITEMS,
  sumAssessmentResponses,
} from './assessment'

describe('PRE assessment content', () => {
  it('has exactly 10 items, matching PRE_ASSESSMENT_ITEM_COUNT', () => {
    expect(PRE_ASSESSMENT_ITEMS).toHaveLength(10)
    expect(PRE_ASSESSMENT_ITEM_COUNT).toBe(10)
  })

  it('has a 5-point scale from 1 to 5 with no gaps or duplicates', () => {
    expect(ASSESSMENT_SCALE.map((option) => option.value)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('isValidAssessmentResponses', () => {
  it('accepts exactly 10 integers each within 1-5', () => {
    expect(isValidAssessmentResponses([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])).toBe(true)
    expect(isValidAssessmentResponses(Array(10).fill(3))).toBe(true)
  })

  it('rejects anything other than exactly 10 entries', () => {
    expect(isValidAssessmentResponses(Array(9).fill(3))).toBe(false)
    expect(isValidAssessmentResponses(Array(11).fill(3))).toBe(false)
    expect(isValidAssessmentResponses([])).toBe(false)
  })

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidAssessmentResponses([0, 2, 3, 4, 5, 1, 2, 3, 4, 5])).toBe(false)
    expect(isValidAssessmentResponses([6, 2, 3, 4, 5, 1, 2, 3, 4, 5])).toBe(false)
    expect(isValidAssessmentResponses([1.5, 2, 3, 4, 5, 1, 2, 3, 4, 5])).toBe(false)
  })

  it('rejects non-array input', () => {
    expect(isValidAssessmentResponses(null)).toBe(false)
    expect(isValidAssessmentResponses(undefined)).toBe(false)
    expect(isValidAssessmentResponses('1,2,3,4,5,1,2,3,4,5')).toBe(false)
    expect(isValidAssessmentResponses({ 0: 1 })).toBe(false)
  })
})

describe('pure scoring helpers (no aggregate persisted - for future use only)', () => {
  it('sums and averages a full response set', () => {
    const responses = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
    expect(sumAssessmentResponses(responses)).toBe(30)
    expect(meanAssessmentResponses(responses)).toBe(3)
  })

  it('handles an empty array without dividing by zero', () => {
    expect(sumAssessmentResponses([])).toBe(0)
    expect(meanAssessmentResponses([])).toBe(0)
  })
})
