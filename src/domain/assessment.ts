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

/**
 * Pure scoring helpers only - no derived aggregate (no preTotal/preMean/
 * postTotal/postMean/gain) is persisted in Firestore for PRE or POST. These
 * exist so a later phase can compute totals/means/gain from the raw
 * responses without duplicating this arithmetic, not to power any
 * aggregate UI yet (matched PRE/POST statistics are explicitly out of
 * scope for this phase).
 */
export const sumAssessmentResponses = (responses: readonly number[]): number =>
  responses.reduce((total, value) => total + value, 0)

export const meanAssessmentResponses = (responses: readonly number[]): number =>
  responses.length === 0 ? 0 : sumAssessmentResponses(responses) / responses.length

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
