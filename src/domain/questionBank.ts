import {
  QUESTION_NUMBERS,
  QUESTIONS_PER_PLAYER,
  ROLE_IDS,
  isRoleId,
  type QuestionDefinition,
  type QuestionNumber,
  type RoleId,
} from './ourCity'

export type QuestionBank = Readonly<Record<RoleId, readonly QuestionDefinition[]>>

export const EXPECTED_TOTAL_QUESTIONS = ROLE_IDS.length * QUESTIONS_PER_PLAYER

export interface QuestionBankInventory {
  questionsByRole: Record<RoleId, number>
  totalQuestions: number
}

export type QuestionBankValidationIssueCode =
  | 'missing-role-list'
  | 'unexpected-role'
  | 'questions-per-role'
  | 'total-questions'
  | 'invalid-question-shape'
  | 'invalid-question-id'
  | 'duplicate-question-id'
  | 'invalid-question-role-id'
  | 'question-role-mismatch'
  | 'invalid-question-number'
  | 'invalid-question-text'
  | 'invalid-choices'
  | 'choices-per-question'
  | 'invalid-choice-shape'
  | 'invalid-choice-id'
  | 'duplicate-choice-id'
  | 'invalid-choice-text'
  | 'exposed-internal-impact'

export interface QuestionBankValidationIssue {
  code: QuestionBankValidationIssueCode
  roleId?: RoleId
  questionId?: string
  choiceId?: string
  expected?: number | string
  actual?: number | string
}

export interface QuestionBankValidationResult extends QuestionBankInventory {
  valid: boolean
  issues: QuestionBankValidationIssue[]
}

const QUESTION_NUMBER_SET: ReadonlySet<number> = new Set(QUESTION_NUMBERS)
const FORBIDDEN_PUBLIC_FIELDS = new Set([
  'impact',
  'cityimpact',
  'impactbychoiceid',
  'cityscore',
  'cityscoredelta',
  'scoredelta',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasForbiddenPublicField = (value: Record<string, unknown>): boolean =>
  Object.keys(value).some((key) => FORBIDDEN_PUBLIC_FIELDS.has(key.toLowerCase().replaceAll(/[-_]/g, '')))

const isQuestionNumber = (value: unknown): value is QuestionNumber =>
  typeof value === 'number' && QUESTION_NUMBER_SET.has(value)

export const getQuestionBankInventory = (bank: unknown): QuestionBankInventory => {
  const bankRecord = isRecord(bank) ? bank : {}
  const questionsByRole = Object.fromEntries(
    ROLE_IDS.map((roleId) => [roleId, Array.isArray(bankRecord[roleId]) ? bankRecord[roleId].length : 0]),
  ) as Record<RoleId, number>

  return {
    questionsByRole,
    totalQuestions: Object.values(questionsByRole).reduce((total, count) => total + count, 0),
  }
}

export const validateQuestionBank = (bank: unknown): QuestionBankValidationResult => {
  const bankRecord = isRecord(bank) ? bank : {}
  const inventory = getQuestionBankInventory(bank)
  const issues: QuestionBankValidationIssue[] = []
  const seenQuestionIds = new Set<string>()

  for (const key of Object.keys(bankRecord)) {
    if (!isRoleId(key)) issues.push({ code: 'unexpected-role', actual: key })
  }

  for (const roleId of ROLE_IDS) {
    const questions = bankRecord[roleId]
    if (!Array.isArray(questions)) {
      issues.push({ code: 'missing-role-list', roleId })
      continue
    }

    if (questions.length !== QUESTIONS_PER_PLAYER) {
      issues.push({
        code: 'questions-per-role',
        roleId,
        expected: QUESTIONS_PER_PLAYER,
        actual: questions.length,
      })
    }

    for (const rawQuestion of questions) {
      if (!isRecord(rawQuestion)) {
        issues.push({ code: 'invalid-question-shape', roleId })
        continue
      }

      const questionId = typeof rawQuestion.id === 'string' ? rawQuestion.id : undefined
      if (!questionId?.trim()) {
        issues.push({ code: 'invalid-question-id', roleId })
      } else if (seenQuestionIds.has(questionId)) {
        issues.push({ code: 'duplicate-question-id', roleId, questionId })
      } else {
        seenQuestionIds.add(questionId)
      }

      if (!isRoleId(rawQuestion.roleId)) {
        issues.push({ code: 'invalid-question-role-id', roleId, questionId })
      } else if (rawQuestion.roleId !== roleId) {
        issues.push({
          code: 'question-role-mismatch',
          roleId,
          questionId,
          expected: roleId,
          actual: rawQuestion.roleId,
        })
      }

      if (!isQuestionNumber(rawQuestion.questionNumber)) {
        issues.push({ code: 'invalid-question-number', roleId, questionId })
      } else if (questionId) {
        const expectedId = `${roleId}-${String(rawQuestion.questionNumber).padStart(2, '0')}`
        if (questionId !== expectedId) {
          issues.push({ code: 'invalid-question-id', roleId, questionId, expected: expectedId, actual: questionId })
        }
      }

      if (typeof rawQuestion.situation !== 'string' || !rawQuestion.situation.trim()) {
        issues.push({ code: 'invalid-question-text', roleId, questionId })
      }
      if (typeof rawQuestion.topic !== 'string' || !rawQuestion.topic.trim()) {
        issues.push({ code: 'invalid-question-text', roleId, questionId })
      }
      if (hasForbiddenPublicField(rawQuestion)) {
        issues.push({ code: 'exposed-internal-impact', roleId, questionId })
      }

      if (!Array.isArray(rawQuestion.choices) || rawQuestion.choices.length === 0) {
        issues.push({ code: 'invalid-choices', roleId, questionId })
        continue
      }
      if (rawQuestion.choices.length !== 2) {
        issues.push({ code: 'choices-per-question', roleId, questionId, expected: 2, actual: rawQuestion.choices.length })
      }

      const seenChoiceIds = new Set<string>()
      for (const rawChoice of rawQuestion.choices) {
        if (!isRecord(rawChoice)) {
          issues.push({ code: 'invalid-choice-shape', roleId, questionId })
          continue
        }

        const choiceId = typeof rawChoice.id === 'string' ? rawChoice.id : undefined
        if (!choiceId?.trim()) {
          issues.push({ code: 'invalid-choice-id', roleId, questionId })
        } else if (seenChoiceIds.has(choiceId)) {
          issues.push({ code: 'duplicate-choice-id', roleId, questionId, choiceId })
        } else {
          seenChoiceIds.add(choiceId)
        }

        if (typeof rawChoice.text !== 'string' || !rawChoice.text.trim()) {
          issues.push({ code: 'invalid-choice-text', roleId, questionId, choiceId })
        }
        if (hasForbiddenPublicField(rawChoice)) {
          issues.push({ code: 'exposed-internal-impact', roleId, questionId, choiceId })
        }
      }
    }
  }

  if (inventory.totalQuestions !== EXPECTED_TOTAL_QUESTIONS) {
    issues.push({
      code: 'total-questions',
      expected: EXPECTED_TOTAL_QUESTIONS,
      actual: inventory.totalQuestions,
    })
  }

  return { valid: issues.length === 0, issues, ...inventory }
}
