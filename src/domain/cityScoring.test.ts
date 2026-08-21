import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from './classroomQuestions'
import {
  SCORE_POLICY,
  getCityLevel,
  scoreClassroomRound,
  type LockedPlayer,
} from './cityScoring'
import { createTrustedQuestions } from '../test/classroomFixtures'

const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
const questionFor = (roleId: LockedPlayer['roleId']) => {
  const question = snapshot.trustedQuestions.find((item) => item.roleId === roleId && item.questionNumber === 1)
  if (!question) throw new Error(`missing ${roleId} question`)
  return question
}

describe('classroom city scoring', () => {
  it('applies integrity +50, corruption -100, and timeout -20', () => {
    const players: LockedPlayer[] = [
      { playerId: 'p1', roleId: 'doctor' },
      { playerId: 'p2', roleId: 'police' },
      { playerId: 'p3', roleId: 'merchant' },
    ]
    const result = scoreClassroomRound(500, 1, players, snapshot.trustedQuestions, [
      { playerId: 'p1', questionId: questionFor('doctor').questionId, choiceId: questionFor('doctor').integrityChoiceId },
      {
        playerId: 'p2',
        questionId: questionFor('police').questionId,
        choiceId: questionFor('police').corruptionChoiceId,
      },
    ])

    expect(SCORE_POLICY).toMatchObject({ integrity: 50, corruption: -100, timeout: -20 })
    expect(result).toMatchObject({ integrityCount: 1, corruptionCount: 1, timeoutCount: 1, roundTotal: -70 })
  })

  it('uses lockedPlayerCount as the round-average denominator', () => {
    const players: LockedPlayer[] = [
      { playerId: 'p1', roleId: 'doctor' },
      { playerId: 'p2', roleId: 'police' },
    ]
    const result = scoreClassroomRound(500, 1, players, snapshot.trustedQuestions, [
      { playerId: 'p1', questionId: questionFor('doctor').questionId, choiceId: questionFor('doctor').integrityChoiceId },
    ])

    expect(result.roundTotal).toBe(30)
    expect(result.roundAverage).toBe(15)
    expect(result.newCityScore).toBe(515)
  })

  it('does not count a duplicate answer twice', () => {
    const question = questionFor('doctor')
    const answer = { playerId: 'p1', questionId: question.questionId, choiceId: question.integrityChoiceId }
    const result = scoreClassroomRound(
      500,
      1,
      [{ playerId: 'p1', roleId: 'doctor' }],
      snapshot.trustedQuestions,
      [answer, { ...answer, choiceId: question.corruptionChoiceId }],
    )

    expect(result.integrityCount).toBe(1)
    expect(result.corruptionCount).toBe(0)
    expect(result.roundTotal).toBe(50)
  })

  it('clamps city score to 0–1000', () => {
    const player: LockedPlayer[] = [{ playerId: 'p1', roleId: 'doctor' }]
    const question = questionFor('doctor')

    expect(
      scoreClassroomRound(990, 1, player, snapshot.trustedQuestions, [
        { playerId: 'p1', questionId: question.questionId, choiceId: question.integrityChoiceId },
      ]).newCityScore,
    ).toBe(1000)
    expect(
      scoreClassroomRound(10, 1, player, snapshot.trustedQuestions, [
        { playerId: 'p1', questionId: question.questionId, choiceId: question.corruptionChoiceId },
      ]).newCityScore,
    ).toBe(0)
  })

  it.each([
    [0, 'critical'],
    [199, 'critical'],
    [200, 'declining'],
    [299, 'declining'],
    [300, 'neutral'],
    [599, 'neutral'],
    [600, 'improving'],
    [799, 'improving'],
    [800, 'prosperous'],
    [1000, 'prosperous'],
  ] as const)('maps score %i to %s', (score, expected) => {
    expect(getCityLevel(score)).toBe(expected)
  })

  it('combines teacher and student in the school location summary', () => {
    const result = scoreClassroomRound(
      500,
      1,
      [
        { playerId: 'teacher-player', roleId: 'teacher' },
        { playerId: 'student-player', roleId: 'student' },
      ],
      snapshot.trustedQuestions,
      [],
    )

    expect(result.locationSummaries.school).toMatchObject({ participantCount: 2, timeoutCount: 2, scoreTotal: -40 })
  })
})
