import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_ITEM_COUNT,
  ASSESSMENT_ITEMS,
  ASSESSMENT_SCALE,
  isValidAssessmentResponses,
  isValidReflection,
  meanAssessmentResponses,
  PRE_ASSESSMENT_ITEM_COUNT,
  PRE_ASSESSMENT_ITEMS,
  REFLECTION_ANSWER_MAX_LENGTH,
  REFLECTION_PROMPTS,
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

describe('POST reuses the exact same items/scale as PRE (Assessment SPEC requirement)', () => {
  it('PRE_ASSESSMENT_ITEMS and PRE_ASSESSMENT_ITEM_COUNT are aliases of the canonical ASSESSMENT_ITEMS/ASSESSMENT_ITEM_COUNT, not a second independent array', () => {
    expect(PRE_ASSESSMENT_ITEMS).toBe(ASSESSMENT_ITEMS)
    expect(PRE_ASSESSMENT_ITEM_COUNT).toBe(ASSESSMENT_ITEM_COUNT)
  })

  it('has exactly 10 canonical items', () => {
    expect(ASSESSMENT_ITEMS).toHaveLength(10)
    expect(ASSESSMENT_ITEM_COUNT).toBe(10)
  })
})

describe('reflection prompts (R1-R3, exact required wording)', () => {
  it('has exactly 3 prompts in order with the exact required Thai wording', () => {
    expect(REFLECTION_PROMPTS).toEqual([
      'มีสถานการณ์ใดที่ตัดสินใจยากที่สุด เพราะอะไร?',
      'เมื่อเห็นเมืองหรืออาคารเปลี่ยน คุณเข้าใจคำว่า "ผลประโยชน์ส่วนรวม" ต่างจากก่อนเล่นอย่างไร?',
      'มีเหตุการณ์จริงในโรงเรียน/ชุมชนใดที่ทำให้คุณนึกถึงหลักความโปร่งใสหรือความซื่อสัตย์?',
    ])
  })
})

describe('isValidReflection', () => {
  it('accepts three non-empty strings', () => {
    expect(isValidReflection({ r1: 'ตอบ 1', r2: 'ตอบ 2', r3: 'ตอบ 3' })).toBe(true)
  })

  it('rejects empty or whitespace-only answers', () => {
    expect(isValidReflection({ r1: '', r2: 'ตอบ', r3: 'ตอบ' })).toBe(false)
    expect(isValidReflection({ r1: '   ', r2: 'ตอบ', r3: 'ตอบ' })).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isValidReflection({ r1: 1, r2: 'ตอบ', r3: 'ตอบ' })).toBe(false)
    expect(isValidReflection({ r1: null, r2: 'ตอบ', r3: 'ตอบ' })).toBe(false)
  })

  it('rejects missing fields or non-objects', () => {
    expect(isValidReflection({ r1: 'ตอบ', r2: 'ตอบ' })).toBe(false)
    expect(isValidReflection(null)).toBe(false)
    expect(isValidReflection(undefined)).toBe(false)
    expect(isValidReflection('ตอบ')).toBe(false)
  })

  it('accepts an answer right at the max length and rejects one over it', () => {
    const atMax = 'ก'.repeat(REFLECTION_ANSWER_MAX_LENGTH)
    const overMax = 'ก'.repeat(REFLECTION_ANSWER_MAX_LENGTH + 1)
    expect(isValidReflection({ r1: atMax, r2: 'ตอบ', r3: 'ตอบ' })).toBe(true)
    expect(isValidReflection({ r1: overMax, r2: 'ตอบ', r3: 'ตอบ' })).toBe(false)
  })

  it('does not rewrite the caller-provided values - validation is a pure predicate with no side effects', () => {
    const input = { r1: '  มีช่องว่างรอบข้อความ  ', r2: 'ตอบ', r3: 'ตอบ' }
    const before = { ...input }
    isValidReflection(input)
    expect(input).toEqual(before)
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
