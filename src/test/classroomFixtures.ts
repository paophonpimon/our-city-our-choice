import { QUESTION_SHEET_HEADERS, parseQuestionSheetRows, type TrustedQuestion } from '../domain/classroomQuestions'
import { ROLE_IDS } from '../domain/ourCity'

export const createQuestionRows = (questionsPerRole = 10): string[][] => [
  [...QUESTION_SHEET_HEADERS],
  ...ROLE_IDS.flatMap((roleId) =>
    Array.from({ length: questionsPerRole }, (_, index) => {
      const number = index + 1
      return [
        'TRUE',
        roleId,
        `${roleId}-${String(number).padStart(2, '0')}`,
        String(number),
        `Question ${roleId} ${number}`,
        `Integrity choice ${number}`,
        `Corruption choice ${number}`,
        '1',
        '',
      ]
    }),
  ),
]

export const createTrustedQuestions = (questionsPerRole = 10): TrustedQuestion[] => {
  const parsed = parseQuestionSheetRows(createQuestionRows(questionsPerRole))
  if (!parsed.valid) throw new Error(`test fixture is invalid: ${JSON.stringify(parsed.errors)}`)
  return parsed.questions
}

export const rowsToCsv = (rows: readonly (readonly string[])[]): string =>
  rows
    .map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
