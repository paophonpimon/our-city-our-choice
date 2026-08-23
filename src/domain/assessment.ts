export const PRE_ASSESSMENT_ITEM_COUNT = 10

export type AssessmentScaleValue = 1 | 2 | 3 | 4 | 5

/**
 * Source of truth for the PRE assessment's 10 statements, in the exact
 * fixed order responses are stored in. Student-facing M.1 Thai. This is a
 * civic-values self-assessment, not a game score - deliberately never
 * framed in game-score or "morality score" language anywhere in the UI.
 */
export const PRE_ASSESSMENT_ITEMS: readonly string[] = [
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

/** Exactly 10 integer responses, each 1-5 - the only shape ever accepted for storage. */
export const isValidAssessmentResponses = (value: unknown): value is AssessmentScaleValue[] =>
  Array.isArray(value)
  && value.length === PRE_ASSESSMENT_ITEM_COUNT
  && value.every((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 5)

/**
 * Pure scoring helpers only - Phase A stores no derived aggregate (no
 * preTotal/preMean in Firestore). These exist so a later phase can compute
 * totals/means from the raw responses without duplicating this arithmetic,
 * not to power any aggregate UI yet.
 */
export const sumAssessmentResponses = (responses: readonly number[]): number =>
  responses.reduce((total, value) => total + value, 0)

export const meanAssessmentResponses = (responses: readonly number[]): number =>
  responses.length === 0 ? 0 : sumAssessmentResponses(responses) / responses.length
