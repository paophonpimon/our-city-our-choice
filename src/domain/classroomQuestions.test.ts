import { describe, expect, it } from 'vitest'
import { ROLE_IDS } from './ourCity'
import {
  createRoomQuestionSnapshot,
  orderChoicesForPlayer,
  parseQuestionSheetRows,
  toPublicRoomQuestion,
} from './classroomQuestions'
import { createQuestionRows, createTrustedQuestions } from '../test/classroomFixtures'

describe('Google Sheets question parsing', () => {
  it('parses all 80 questions for the eight canonical roles', () => {
    const result = parseQuestionSheetRows(createQuestionRows())

    expect(result.valid).toBe(true)
    expect(result.questions).toHaveLength(80)
    expect(Object.keys(result.activeByRole)).toEqual(ROLE_IDS)
    expect(result.activeByRole.doctor).toBe(10)
    expect(result.activeByRole).not.toHaveProperty('mayor')
  })

  it('reports row numbers and requires at least ten active questions per role', () => {
    const rows = createQuestionRows()
    const doctorLastRow = rows.find((row) => row[2] === 'doctor-10')
    if (!doctorLastRow) throw new Error('missing fixture row')
    doctorLastRow[0] = 'FALSE'
    const result = parseQuestionSheetRows(rows)

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({
      row: 1,
      column: 'active',
      message: 'doctor requires at least 10 active questions; found 9',
    })
  })

  it('rejects mayor, duplicate IDs, invalid integrity choice, and malformed choices', () => {
    const rows = createQuestionRows()
    const first = rows[1]
    const second = rows[2]
    if (!first || !second) throw new Error('missing fixture rows')
    first[1] = 'mayor'
    second[2] = 'doctor-01'
    second[7] = '3'
    second[6] = second[5] ?? ''
    const result = parseQuestionSheetRows(rows)

    expect(result.errors.some((error) => error.row === 2 && error.column === 'role_id')).toBe(true)
    expect(result.errors.some((error) => error.row === 3 && error.column === 'question_id')).toBe(true)
    expect(result.errors.some((error) => error.row === 3 && error.column === 'integrity_choice')).toBe(true)
    expect(result.errors.some((error) => error.row === 3 && error.column === 'choice_2')).toBe(true)
  })
})

describe('room question snapshots', () => {
  it('selects exactly ten sorted questions for each role', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(11), 100)

    expect(snapshot.trustedQuestions).toHaveLength(80)
    for (const roleId of ROLE_IDS) {
      const roleQuestions = snapshot.trustedQuestions.filter((question) => question.roleId === roleId)
      expect(roleQuestions).toHaveLength(10)
      expect(roleQuestions.map((question) => question.questionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    }
  })

  it('keeps integrity mapping only in trusted snapshot', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const trusted = snapshot.trustedQuestions[0]
    if (!trusted) throw new Error('snapshot is empty')
    const publicQuestion = toPublicRoomQuestion(trusted)

    expect(trusted.integrityChoiceId).toBe(`${trusted.questionId}-c1`)
    expect(trusted.corruptionChoiceId).toBe(`${trusted.questionId}-c2`)
    expect(publicQuestion).not.toHaveProperty('integrityChoiceId')
    expect(publicQuestion).not.toHaveProperty('corruptionChoiceId')
  })

  it('does not change after the source question bank changes', () => {
    const source = createTrustedQuestions()
    const snapshot = createRoomQuestionSnapshot('ROOM01', source, 100)
    const originalPrompt = snapshot.trustedQuestions[0]?.prompt
    const firstSource = source[0]
    if (!firstSource) throw new Error('source is empty')
    firstSource.prompt = 'Changed in Google Sheets later'

    expect(snapshot.trustedQuestions[0]?.prompt).toBe(originalPrompt)
  })

  it('creates stable choice IDs and deterministic ordering after refresh', () => {
    const question = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100).publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')

    expect(question.choices.map((choice) => choice.id)).toEqual([`${question.questionId}-c1`, `${question.questionId}-c2`])
    expect(orderChoicesForPlayer(question, 'ROOM01', 'player-1')).toEqual(
      orderChoicesForPlayer(question, 'ROOM01', 'player-1'),
    )
  })
})
