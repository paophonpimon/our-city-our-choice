import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_ITEM_COUNT,
  ASSESSMENT_ITEMS,
  ASSESSMENT_SCALE,
  calculateMatchedAssessmentEvidence,
  isValidAssessmentResponses,
  isValidObservationInput,
  isValidObservationScaleValue,
  isValidReflection,
  meanAssessmentResponses,
  OBSERVATION_DIMENSIONS,
  OBSERVATION_NOTES_MAX_LENGTH,
  OBSERVATION_SCALE,
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

  it('keeps the exact 10 civic self-assessment statements', () => {
    expect(ASSESSMENT_ITEMS).toEqual([
      'ฉันสามารถแยกได้ว่าอะไรเป็นประโยชน์ส่วนตนและอะไรเป็นประโยชน์ส่วนรวม',
      'เมื่อมีผลประโยชน์ส่วนตัวมาแลกกับการทำผิดกติกา ฉันคิดว่าควรปฏิเสธ',
      'ฉันเห็นความสำคัญของการทำตามขั้นตอนและมาตรฐาน แม้จะทำให้ช้าลง',
      'ฉันคิดว่าการใช้ทรัพยากรส่วนรวมควรคำนึงถึงคนอื่น ไม่ใช่ความสะดวกของตนเอง',
      'ก่อนส่งต่อข้อมูลที่อาจทำให้คนอื่นเดือดร้อน ฉันควรตรวจสอบแหล่งที่มา',
      'หากพบความไม่ถูกต้อง ฉันคิดว่าควรหาวิธีแจ้งหรือขอให้ตรวจสอบอย่างปลอดภัย',
      'ฉันคิดว่าคนทุกกลุ่มควรได้รับบริการและกติกาอย่างเท่าเทียม',
      'ฉันคิดถึงผลกระทบต่อชุมชน/ส่วนรวมก่อนเลือกสิ่งที่ให้ประโยชน์กับตนเอง',
      'ฉันสามารถอธิบายเหตุผลของการตัดสินใจเรื่องความซื่อสัตย์ได้ ไม่ใช่แค่ตอบว่าถูกหรือผิด',
      'ฉันเชื่อว่าการตัดสินใจเล็ก ๆ ของแต่ละคนสามารถสะสมจนส่งผลต่อสังคมส่วนรวมได้',
    ])
  })

  it('has a 5-point scale from 1 to 5 with no gaps or duplicates', () => {
    expect(ASSESSMENT_SCALE.map((option) => option.value)).toEqual([1, 2, 3, 4, 5])
    expect(ASSESSMENT_SCALE.map((option) => option.label)).toEqual([
      'ไม่เห็นด้วยเลย',
      'ไม่ค่อยเห็นด้วย',
      'ไม่แน่ใจ / เห็นด้วยปานกลาง',
      'เห็นด้วย',
      'เห็นด้วยมากที่สุด',
    ])
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

describe('pure matched PRE/POST evidence calculations (Phase B2b)', () => {
  const record = (playerId: string, responses: unknown) => ({ playerId, responses })

  it('calculates a normal matched cohort with improved, unchanged, and decreased students', () => {
    const result = calculateMatchedAssessmentEvidence(
      [
        record('improved', Array(10).fill(2)),
        record('unchanged', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]),
        record('decreased', Array(10).fill(5)),
      ],
      [
        record('decreased', Array(10).fill(4)),
        record('improved', Array(10).fill(3)),
        record('unchanged', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]),
      ],
    )

    expect(result.students).toEqual([
      {
        playerId: 'decreased',
        preTotal: 50,
        postTotal: 40,
        preMean: 5,
        postMean: 4,
        gain: -10,
        change: 'decreased',
      },
      {
        playerId: 'improved',
        preTotal: 20,
        postTotal: 30,
        preMean: 2,
        postMean: 3,
        gain: 10,
        change: 'improved',
      },
      {
        playerId: 'unchanged',
        preTotal: 30,
        postTotal: 30,
        preMean: 3,
        postMean: 3,
        gain: 0,
        change: 'unchanged',
      },
    ])
    expect(result.group).toEqual({
      matchedCount: 3,
      preMean: 10 / 3,
      postMean: 10 / 3,
      meanGain: 0,
      improvedCount: 1,
      unchangedCount: 1,
      decreasedCount: 1,
      improvedPercent: 1 / 3 * 100,
    })
  })

  it('ignores unmatched PRE and unmatched POST records', () => {
    const result = calculateMatchedAssessmentEvidence(
      [record('matched', Array(10).fill(2)), record('pre-only', Array(10).fill(5))],
      [record('matched', Array(10).fill(3)), record('post-only', Array(10).fill(1))],
    )

    expect(result.students.map((student) => student.playerId)).toEqual(['matched'])
    expect(result.group.matchedCount).toBe(1)
  })

  it('ignores a player when either PRE or POST responses are invalid', () => {
    const result = calculateMatchedAssessmentEvidence(
      [
        record('invalid-pre-length', Array(9).fill(3)),
        record('invalid-pre-value', [1, 2, 3, 4, 5, 1, 2, 3, 4, 6]),
        record('valid', Array(10).fill(1)),
      ],
      [
        record('invalid-pre-length', Array(10).fill(3)),
        record('invalid-pre-value', Array(10).fill(3)),
        record('valid', [1, 2, 3, 4, 5, 1, 2, 3, 4, 1.5]),
      ],
    )

    expect(result.students).toEqual([])
    expect(result.group.matchedCount).toBe(0)
  })

  it('calculates exact totals, response means, group means, gain, and improved percent', () => {
    const result = calculateMatchedAssessmentEvidence(
      [
        record('a', [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]),
        record('b', [2, 2, 2, 2, 2, 3, 3, 3, 3, 3]),
      ],
      [
        record('a', [2, 2, 2, 2, 2, 3, 3, 3, 3, 3]),
        record('b', [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]),
      ],
    )

    expect(result.students[0]).toMatchObject({ preTotal: 15, postTotal: 25, preMean: 1.5, postMean: 2.5, gain: 10 })
    expect(result.students[1]).toMatchObject({ preTotal: 25, postTotal: 15, preMean: 2.5, postMean: 1.5, gain: -10 })
    expect(result.group).toEqual({
      matchedCount: 2,
      preMean: 2,
      postMean: 2,
      meanGain: 0,
      improvedCount: 1,
      unchangedCount: 0,
      decreasedCount: 1,
      improvedPercent: 50,
    })
  })

  it('returns safe zero group values when there are no matched players', () => {
    expect(calculateMatchedAssessmentEvidence([], [])).toEqual({
      students: [],
      group: {
        matchedCount: 0,
        preMean: 0,
        postMean: 0,
        meanGain: 0,
        improvedCount: 0,
        unchangedCount: 0,
        decreasedCount: 0,
        improvedPercent: 0,
      },
    })
  })

  it('uses only the first valid record per player and phase when duplicates are present', () => {
    const result = calculateMatchedAssessmentEvidence(
      [
        record('duplicate', Array(9).fill(1)),
        record('duplicate', Array(10).fill(2)),
        record('duplicate', Array(10).fill(5)),
      ],
      [record('duplicate', Array(10).fill(3)), record('duplicate', Array(10).fill(1))],
    )

    expect(result.students).toEqual([
      {
        playerId: 'duplicate',
        preTotal: 20,
        postTotal: 30,
        preMean: 2,
        postMean: 3,
        gain: 10,
        change: 'improved',
      },
    ])
    expect(result.group.matchedCount).toBe(1)
  })
})

describe('Teacher Observation (Phase B2a, 4 dimensions, 1-4 scale)', () => {
  it('has exactly 4 observation dimensions with expected codes and titles', () => {
    expect(OBSERVATION_DIMENSIONS).toHaveLength(4)
    expect(OBSERVATION_DIMENSIONS.map((dim) => ({ id: dim.id, code: dim.code, title: dim.title }))).toEqual([
      { id: 'o1', code: 'O1', title: 'การใช้เหตุผล' },
      { id: 'o2', code: 'O2', title: 'การคำนึงถึงประโยชน์ส่วนรวม' },
      { id: 'o3', code: 'O3', title: 'การเคารพกติกาและขั้นตอน' },
      { id: 'o4', code: 'O4', title: 'การรับฟังและทำงานร่วมกับผู้อื่น' },
    ])
  })

  it('has a 4-point scale from 1 to 4 with expected Thai labels', () => {
    expect(OBSERVATION_SCALE).toEqual([
      { value: 1, label: 'ควรส่งเสริมเพิ่มเติม' },
      { value: 2, label: 'เริ่มแสดงพฤติกรรม' },
      { value: 3, label: 'แสดงพฤติกรรมได้ดี' },
      { value: 4, label: 'แสดงพฤติกรรมได้ชัดเจนและสม่ำเสมอ' },
    ])
  })

  it('validates observation scale values strictly between 1 and 4', () => {
    expect(isValidObservationScaleValue(1)).toBe(true)
    expect(isValidObservationScaleValue(2)).toBe(true)
    expect(isValidObservationScaleValue(3)).toBe(true)
    expect(isValidObservationScaleValue(4)).toBe(true)
    expect(isValidObservationScaleValue(0)).toBe(false)
    expect(isValidObservationScaleValue(5)).toBe(false)
    expect(isValidObservationScaleValue(2.5)).toBe(false)
    expect(isValidObservationScaleValue('3')).toBe(false)
    expect(isValidObservationScaleValue(null)).toBe(false)
    expect(isValidObservationScaleValue(undefined)).toBe(false)
  })

  it('accepts valid observation input with or without notes', () => {
    expect(isValidObservationInput({ o1: 1, o2: 2, o3: 3, o4: 4 })).toBe(true)
    expect(isValidObservationInput({ o1: 4, o2: 4, o3: 4, o4: 4, notes: 'นักเรียนให้ความร่วมมือดีมาก' })).toBe(true)
    expect(isValidObservationInput({ o1: 2, o2: 3, o3: 3, o4: 2, notes: '' })).toBe(true)
  })

  it('rejects observation input with missing or invalid scores', () => {
    expect(isValidObservationInput({ o1: 1, o2: 2, o3: 3 })).toBe(false)
    expect(isValidObservationInput({ o1: 1, o2: 2, o3: 3, o4: 5 })).toBe(false)
    expect(isValidObservationInput({ o1: 0, o2: 2, o3: 3, o4: 4 })).toBe(false)
    expect(isValidObservationInput(null)).toBe(false)
    expect(isValidObservationInput('invalid')).toBe(false)
  })

  it('enforces max length on observation notes', () => {
    const atMax = 'ก'.repeat(OBSERVATION_NOTES_MAX_LENGTH)
    const overMax = 'ก'.repeat(OBSERVATION_NOTES_MAX_LENGTH + 1)
    expect(isValidObservationInput({ o1: 1, o2: 2, o3: 3, o4: 4, notes: atMax })).toBe(true)
    expect(isValidObservationInput({ o1: 1, o2: 2, o3: 3, o4: 4, notes: overMax })).toBe(false)
  })
})
