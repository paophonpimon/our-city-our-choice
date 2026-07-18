import { describe, expect, it } from 'vitest'
import { OUR_CITY_QUESTION_BANK_SCAFFOLD } from '../data/ourCityQuestions'
import {
  EXPECTED_TOTAL_QUESTIONS,
  getQuestionBankInventory,
  validateQuestionBank,
  type QuestionBank,
} from './questionBank'
import { QUESTION_NUMBERS, ROLE_IDS, type QuestionDefinition, type RoleId } from './ourCity'

const TEST_ONLY_TEXT = '__TEST_ONLY_NOT_CANONICAL_CONTENT__'

const createTestQuestion = (roleId: RoleId, questionNumber: (typeof QUESTION_NUMBERS)[number], choiceCount: number) =>
  ({
    id: `${roleId}-${String(questionNumber).padStart(2, '0')}`,
    roleId,
    questionNumber,
    situation: TEST_ONLY_TEXT,
    choices: Array.from({ length: choiceCount }, (_, index) => ({
      id: `choice-${index + 1}`,
      text: TEST_ONLY_TEXT,
    })),
    topic: TEST_ONLY_TEXT,
  }) as unknown as QuestionDefinition

const createCompleteTestBank = (choiceCount: number): QuestionBank =>
  Object.fromEntries(
    ROLE_IDS.map((roleId) => [
      roleId,
      QUESTION_NUMBERS.map((questionNumber) => createTestQuestion(roleId, questionNumber, choiceCount)),
    ]),
  ) as unknown as QuestionBank

const replaceRoleQuestions = (
  bank: QuestionBank,
  roleId: RoleId,
  questions: readonly QuestionDefinition[],
): QuestionBank => ({ ...bank, [roleId]: questions })

describe('Our City question bank scaffold', () => {
  it('contains lists for exactly the 8 confirmed roles without invented content', () => {
    expect(Object.keys(OUR_CITY_QUESTION_BANK_SCAFFOLD)).toEqual(ROLE_IDS)
    expect(getQuestionBankInventory(OUR_CITY_QUESTION_BANK_SCAFFOLD)).toEqual({
      questionsByRole: Object.fromEntries(ROLE_IDS.map((roleId) => [roleId, 0])),
      totalQuestions: 0,
    })
  })

  it('reports 10 missing questions for every role and 80 overall', () => {
    const result = validateQuestionBank(OUR_CITY_QUESTION_BANK_SCAFFOLD)
    const countIssues = result.issues.filter((issue) => issue.code === 'questions-per-role')

    expect(result.valid).toBe(false)
    expect(result.totalQuestions).toBe(0)
    expect(countIssues).toHaveLength(8)
    expect(countIssues.every((issue) => issue.expected === 10 && issue.actual === 0)).toBe(true)
    expect(result.issues).toContainEqual({ code: 'total-questions', expected: EXPECTED_TOTAL_QUESTIONS, actual: 0 })
  })
})

describe('Our City question bank validation', () => {
  it('accepts exactly 2 choices per question', () => {
    expect(validateQuestionBank(createCompleteTestBank(2)).valid).toBe(true)
    expect(validateQuestionBank(createCompleteTestBank(4)).issues.some((issue) => issue.code === 'choices-per-question')).toBe(
      true,
    )
  })

  it('rejects duplicate question IDs and role mismatches', () => {
    const bank = createCompleteTestBank(2)
    const firstPoliceQuestion = bank.police[0]
    if (!firstPoliceQuestion) throw new Error('test fixture is incomplete')

    const invalidQuestion = { ...firstPoliceQuestion, id: 'doctor-01', roleId: 'doctor' as const }
    const invalidBank = replaceRoleQuestions(bank, 'police', [invalidQuestion, ...bank.police.slice(1)])
    const result = validateQuestionBank(invalidBank)

    expect(result.issues.some((issue) => issue.code === 'duplicate-question-id')).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'question-role-mismatch')).toBe(true)
  })

  it('rejects duplicate choice IDs within one question', () => {
    const bank = createCompleteTestBank(2)
    const firstQuestion = bank.doctor[0]
    if (!firstQuestion) throw new Error('test fixture is incomplete')
    const firstChoice = firstQuestion.choices[0]
    if (!firstChoice) throw new Error('test fixture has no choices')

    const invalidQuestion = { ...firstQuestion, choices: [firstChoice, { ...firstChoice }] as const }
    const invalidBank = replaceRoleQuestions(bank, 'doctor', [invalidQuestion, ...bank.doctor.slice(1)])

    expect(validateQuestionBank(invalidBank).issues.some((issue) => issue.code === 'duplicate-choice-id')).toBe(true)
  })

  it('rejects numeric impact or city score fields from UI question data', () => {
    const bank = createCompleteTestBank(2)
    const firstQuestion = bank.doctor[0]
    if (!firstQuestion) throw new Error('test fixture is incomplete')
    const firstChoice = firstQuestion.choices[0]
    const secondChoice = firstQuestion.choices[1]
    if (!firstChoice) throw new Error('test fixture has no choices')

    const exposedQuestion = {
      ...firstQuestion,
      choices: [{ ...firstChoice, cityScoreDelta: -1 }, secondChoice] as const,
    } as unknown as QuestionDefinition
    const exposedBank = replaceRoleQuestions(bank, 'doctor', [exposedQuestion, ...bank.doctor.slice(1)])

    expect(validateQuestionBank(exposedBank).issues.some((issue) => issue.code === 'exposed-internal-impact')).toBe(true)
  })

  it('enforces stable role-and-sequence question IDs', () => {
    const bank = createCompleteTestBank(2)
    const firstQuestion = bank.journalist[0]
    if (!firstQuestion) throw new Error('test fixture is incomplete')
    const invalidQuestion = { ...firstQuestion, id: 'temporary-index-0' }
    const invalidBank = replaceRoleQuestions(bank, 'journalist', [invalidQuestion, ...bank.journalist.slice(1)])

    expect(validateQuestionBank(invalidBank).issues).toContainEqual({
      code: 'invalid-question-id',
      roleId: 'journalist',
      questionId: 'temporary-index-0',
      expected: 'journalist-01',
      actual: 'temporary-index-0',
    })
  })
})
