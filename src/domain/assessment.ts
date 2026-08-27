/**
 * Canonical source of truth for the 10-statement, 1-5 scale used by BOTH
 * PRE and POST assessments - POST intentionally reuses the exact same
 * items and scale as PRE (per the Assessment SPEC) rather than duplicating
 * them into a second array. PRE_ASSESSMENT_ITEMS/PRE_ASSESSMENT_ITEM_COUNT
 * below are kept as aliases so existing PRE code and behavior are untouched.
 */
export const ASSESSMENT_ITEM_COUNT = 10

export type AssessmentScaleValue = 1 | 2 | 3 | 4 | 5

/**
 * Source of truth for the assessment's 10 statements, in the exact fixed
 * order responses are stored in. Student-facing M.1 Thai. This is a
 * civic-values self-assessment, not a game score - deliberately never
 * framed in game-score or "morality score" language anywhere in the UI.
 */
export const ASSESSMENT_ITEMS: readonly string[] = [
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
] as const

/** @deprecated Alias of ASSESSMENT_ITEM_COUNT, kept so PRE code/behavior is untouched. */
export const PRE_ASSESSMENT_ITEM_COUNT = ASSESSMENT_ITEM_COUNT
/** @deprecated Alias of ASSESSMENT_ITEMS, kept so PRE code/behavior is untouched. */
export const PRE_ASSESSMENT_ITEMS = ASSESSMENT_ITEMS

export interface AssessmentScaleOption {
  value: AssessmentScaleValue
  label: string
}

export const ASSESSMENT_SCALE: readonly AssessmentScaleOption[] = [
  { value: 1, label: 'ไม่เห็นด้วยเลย' },
  { value: 2, label: 'ไม่ค่อยเห็นด้วย' },
  { value: 3, label: 'ไม่แน่ใจ / เห็นด้วยปานกลาง' },
  { value: 4, label: 'เห็นด้วย' },
  { value: 5, label: 'เห็นด้วยมากที่สุด' },
] as const

/** Exactly 10 integer responses, each 1-5 - the only shape ever accepted for storage. Shared by PRE and POST. */
export const isValidAssessmentResponses = (value: unknown): value is AssessmentScaleValue[] =>
  Array.isArray(value)
  && value.length === ASSESSMENT_ITEM_COUNT
  && value.every((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 5)

/** Pure scoring helpers only. Derived evidence is never persisted. */
export const sumAssessmentResponses = (responses: readonly number[]): number =>
  responses.reduce((total, value) => total + value, 0)

export const meanAssessmentResponses = (responses: readonly number[]): number =>
  responses.length === 0 ? 0 : sumAssessmentResponses(responses) / responses.length

// ── Matched PRE/POST evidence (Phase B2b) ──────────────────────────────────

/**
 * The minimal structural input needed from a PRE or POST record. Unknown
 * fields keep validation at this pure domain boundary and allow malformed
 * records to be ignored safely.
 */
export interface AssessmentEvidenceRecord {
  playerId: unknown
  responses: unknown
}

export type AssessmentChange = 'improved' | 'unchanged' | 'decreased'

export interface MatchedStudentAssessmentEvidence {
  playerId: string
  preTotal: number
  postTotal: number
  preMean: number
  postMean: number
  gain: number
  change: AssessmentChange
}

export interface MatchedGroupAssessmentEvidence {
  matchedCount: number
  preMean: number
  postMean: number
  /** Difference between POST and PRE group means on the 1-5 response scale. */
  meanGainFivePoint: number
  /** Backward-compatible average individual total-score gain on the 10-50 scale. */
  meanGain: number
  improvedCount: number
  unchangedCount: number
  decreasedCount: number
  improvedPercent: number
  unchangedPercent: number
  decreasedPercent: number
}

export interface MatchedAssessmentEvidence {
  students: MatchedStudentAssessmentEvidence[]
  group: MatchedGroupAssessmentEvidence
}

const indexFirstValidAssessmentByPlayer = (
  records: readonly AssessmentEvidenceRecord[],
): Map<string, AssessmentScaleValue[]> => {
  const indexed = new Map<string, AssessmentScaleValue[]>()
  for (const record of records) {
    if (
      typeof record.playerId === 'string'
      && record.playerId.length > 0
      && !indexed.has(record.playerId)
      && isValidAssessmentResponses(record.responses)
    ) {
      indexed.set(record.playerId, record.responses)
    }
  }
  return indexed
}

/**
 * Matches the first valid PRE and POST record for each player. Invalid and
 * unmatched records are ignored, output order is stable by playerId, and no
 * player can contribute more than once.
 */
export const calculateMatchedStudentAssessmentEvidence = (
  preRecords: readonly AssessmentEvidenceRecord[],
  postRecords: readonly AssessmentEvidenceRecord[],
): MatchedStudentAssessmentEvidence[] => {
  const preByPlayer = indexFirstValidAssessmentByPlayer(preRecords)
  const postByPlayer = indexFirstValidAssessmentByPlayer(postRecords)

  return [...preByPlayer.keys()]
    .filter((playerId) => postByPlayer.has(playerId))
    .sort((left, right) => left.localeCompare(right))
    .map((playerId) => {
      const preResponses = preByPlayer.get(playerId)!
      const postResponses = postByPlayer.get(playerId)!
      const preTotal = sumAssessmentResponses(preResponses)
      const postTotal = sumAssessmentResponses(postResponses)
      const gain = postTotal - preTotal
      const change: AssessmentChange = gain > 0 ? 'improved' : gain < 0 ? 'decreased' : 'unchanged'

      return {
        playerId,
        preTotal,
        postTotal,
        preMean: meanAssessmentResponses(preResponses),
        postMean: meanAssessmentResponses(postResponses),
        gain,
        change,
      }
    })
}

/** Group PRE/POST means use the 1-5 student means; meanGain remains on the total-score scale. */
export const calculateMatchedGroupAssessmentEvidence = (
  students: readonly MatchedStudentAssessmentEvidence[],
): MatchedGroupAssessmentEvidence => {
  const matchedCount = students.length
  if (matchedCount === 0) {
    return {
      matchedCount: 0,
      preMean: 0,
      postMean: 0,
      meanGainFivePoint: 0,
      meanGain: 0,
      improvedCount: 0,
      unchangedCount: 0,
      decreasedCount: 0,
      improvedPercent: 0,
      unchangedPercent: 0,
      decreasedPercent: 0,
    }
  }

  const improvedCount = students.filter((student) => student.change === 'improved').length
  const unchangedCount = students.filter((student) => student.change === 'unchanged').length
  const decreasedCount = students.filter((student) => student.change === 'decreased').length

  const preMean = students.reduce((total, student) => total + student.preMean, 0) / matchedCount
  const postMean = students.reduce((total, student) => total + student.postMean, 0) / matchedCount

  return {
    matchedCount,
    preMean,
    postMean,
    meanGainFivePoint: postMean - preMean,
    meanGain: students.reduce((total, student) => total + student.gain, 0) / matchedCount,
    improvedCount,
    unchangedCount,
    decreasedCount,
    improvedPercent: improvedCount / matchedCount * 100,
    unchangedPercent: unchangedCount / matchedCount * 100,
    decreasedPercent: decreasedCount / matchedCount * 100,
  }
}

export const calculateMatchedAssessmentEvidence = (
  preRecords: readonly AssessmentEvidenceRecord[],
  postRecords: readonly AssessmentEvidenceRecord[],
): MatchedAssessmentEvidence => {
  const students = calculateMatchedStudentAssessmentEvidence(preRecords, postRecords)
  return {
    students,
    group: calculateMatchedGroupAssessmentEvidence(students),
  }
}

// ── Reflection (3 open-ended questions, Phase B1) ───────────────────────────

/**
 * Exact required wording, in order. Framed as reflection, never as test
 * correctness - there is no right/wrong answer and nothing here is scored.
 */
export const REFLECTION_PROMPTS: readonly string[] = [
  'มีสถานการณ์ใดที่ตัดสินใจยากที่สุด เพราะอะไร?',
  'เมื่อเห็นเมืองหรืออาคารเปลี่ยน คุณเข้าใจคำว่า "ผลประโยชน์ส่วนรวม" ต่างจากก่อนเล่นอย่างไร?',
  'มีเหตุการณ์จริงในโรงเรียน/ชุมชนใดที่ทำให้คุณนึกถึงหลักความโปร่งใสหรือความซื่อสัตย์?',
] as const

/**
 * Reasonable bounded max length for one open-ended reflection answer (a
 * paragraph or two from a M.1 student) - generous enough not to truncate a
 * genuine answer, bounded enough to keep documents small and reject
 * pasted/garbage input. Enforced identically here and in firestore.rules.
 */
export const REFLECTION_ANSWER_MAX_LENGTH = 1000

export interface ReflectionInput {
  r1: string
  r2: string
  r3: string
}

/**
 * "Meaningful" means non-empty after trimming and within the bounded max
 * length - trimming is for validation only. The caller must store the
 * student's original, untrimmed wording exactly as typed.
 */
const isMeaningfulReflectionAnswer = (value: string): boolean => {
  const trimmed = value.trim()
  return trimmed.length > 0 && value.length <= REFLECTION_ANSWER_MAX_LENGTH
}

export const isValidReflection = (value: unknown): value is ReflectionInput => {
  if (!value || typeof value !== 'object') return false
  const { r1, r2, r3 } = value as Record<string, unknown>
  return typeof r1 === 'string' && typeof r2 === 'string' && typeof r3 === 'string'
    && isMeaningfulReflectionAnswer(r1) && isMeaningfulReflectionAnswer(r2) && isMeaningfulReflectionAnswer(r3)
}

// ── Teacher Observation (4 dimensions, 1-4 scale, Phase B2a) ────────────────

export type ObservationDimensionId = 'o1' | 'o2' | 'o3' | 'o4'

export interface ObservationDimension {
  id: ObservationDimensionId
  code: string
  title: string
}

export const OBSERVATION_DIMENSIONS: readonly ObservationDimension[] = [
  { id: 'o1', code: 'O1', title: 'การใช้เหตุผล' },
  { id: 'o2', code: 'O2', title: 'การคำนึงถึงประโยชน์ส่วนรวม' },
  { id: 'o3', code: 'O3', title: 'การเคารพกติกาและขั้นตอน' },
  { id: 'o4', code: 'O4', title: 'การรับฟังและทำงานร่วมกับผู้อื่น' },
] as const

export type ObservationScaleValue = 1 | 2 | 3 | 4

export interface ObservationScaleOption {
  value: ObservationScaleValue
  label: string
}

export const OBSERVATION_SCALE: readonly ObservationScaleOption[] = [
  { value: 1, label: 'ควรส่งเสริมเพิ่มเติม' },
  { value: 2, label: 'เริ่มแสดงพฤติกรรม' },
  { value: 3, label: 'แสดงพฤติกรรมได้ดี' },
  { value: 4, label: 'แสดงพฤติกรรมได้ชัดเจนและสม่ำเสมอ' },
] as const

export const OBSERVATION_NOTES_MAX_LENGTH = 1000

export interface TeacherObservationInput {
  o1: ObservationScaleValue
  o2: ObservationScaleValue
  o3: ObservationScaleValue
  o4: ObservationScaleValue
  notes?: string
}

export const isValidObservationScaleValue = (value: unknown): value is ObservationScaleValue =>
  Number.isInteger(value) && (value === 1 || value === 2 || value === 3 || value === 4)

export const isValidObservationInput = (value: unknown): value is TeacherObservationInput => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const validScores =
    isValidObservationScaleValue(candidate.o1)
    && isValidObservationScaleValue(candidate.o2)
    && isValidObservationScaleValue(candidate.o3)
    && isValidObservationScaleValue(candidate.o4)
  if (!validScores) return false
  if (candidate.notes !== undefined && candidate.notes !== null) {
    if (typeof candidate.notes !== 'string' || candidate.notes.length > OBSERVATION_NOTES_MAX_LENGTH) return false
  }
  return true
}
