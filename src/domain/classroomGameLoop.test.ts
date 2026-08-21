import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot, orderChoicesForPlayer } from './classroomQuestions'
import {
  countAnswersForQuestion,
  getCityImagePath,
  getFinalAnswerTotals,
  getLiveCityScore,
  getRoleQuestion,
  shouldCloseQuestion,
} from './classroomGameLoop'
import { ROLE_IDS } from './ourCity'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type { ClassroomAnswerRecord, ClassroomRoundResult } from '../types/classroomGame'

const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)

describe('playable classroom loop helpers', () => {
  it('gives every role its own question at the synchronized question number', () => {
    for (const roleId of ROLE_IDS) {
      const question = getRoleQuestion(snapshot.publicQuestions, roleId, 4)
      expect(question?.roleId).toBe(roleId)
      expect(question?.questionNumber).toBe(4)
    }
  })

  it('keeps deterministic choice order after refresh', () => {
    const question = snapshot.publicQuestions[0]
    if (!question) throw new Error('missing question')
    expect(orderChoicesForPlayer(question, 'ROOM01', 'player-1')).toEqual(
      orderChoicesForPlayer(question, 'ROOM01', 'player-1'),
    )
  })

  it('counts one answer per player for the current question', () => {
    const answers = [
      { playerId: 'p1', questionNumber: 1 },
      { playerId: 'p1', questionNumber: 1 },
      { playerId: 'p2', questionNumber: 1 },
      { playerId: 'p3', questionNumber: 2 },
    ] as ClassroomAnswerRecord[]
    expect(countAnswersForQuestion(answers, 1)).toBe(2)
  })

  it('makes the teacher advance action ready when everyone answers or the deadline expires', () => {
    expect(shouldCloseQuestion(3, 3, Date.now() + 10_000)).toBe(true)
    expect(shouldCloseQuestion(1, 3, Date.now() - 1)).toBe(true)
    expect(shouldCloseQuestion(1, 3, Date.now() + 10_000)).toBe(false)
  })

  it('previews only submitted answer impacts and leaves missing answers for final timeout scoring', () => {
    const doctorQuestion = snapshot.trustedQuestions.find((question) => question.roleId === 'doctor' && question.questionNumber === 1)
    const policeQuestion = snapshot.trustedQuestions.find((question) => question.roleId === 'police' && question.questionNumber === 1)
    if (!doctorQuestion || !policeQuestion) throw new Error('missing test questions')
    const answers = [
      {
        answerId: 'a1', roomId: 'ROOM01', playerId: 'p1', ownerUid: 'u1', gameCycle: 0,
        questionNumber: 1, questionId: doctorQuestion.questionId, choiceId: doctorQuestion.integrityChoiceId, submittedAt: 1,
      },
      {
        answerId: 'a2', roomId: 'ROOM01', playerId: 'p2', ownerUid: 'u2', gameCycle: 0,
        questionNumber: 1, questionId: policeQuestion.questionId, choiceId: policeQuestion.corruptionChoiceId, submittedAt: 2,
      },
    ] as ClassroomAnswerRecord[]

    expect(getLiveCityScore(500, 4, 1, 0, answers, snapshot)).toBe(487.5)
    expect(getLiveCityScore(500, 4, 2, 0, answers, snapshot)).toBe(500)
  })

  it.each([
    ['critical', '/images/new-city/backgrounds/city-overview-degraded.webp'],
    ['declining', '/images/new-city/backgrounds/city-overview-degraded.webp'],
    ['neutral', '/images/new-city/backgrounds/city-overview-normal.webp'],
    ['improving', '/images/new-city/backgrounds/city-overview-developed.webp'],
    ['prosperous', '/images/new-city/backgrounds/city-overview-developed.webp'],
  ] as const)('maps %s to its city scene image', (level, expected) => expect(getCityImagePath(level)).toBe(expected))

  it('adds final integrity, corruption, and timeout totals without winner fields', () => {
    const rounds = [
      { integrityCount: 2, corruptionCount: 1, timeoutCount: 1 },
      { integrityCount: 3, corruptionCount: 0, timeoutCount: 2 },
    ] as ClassroomRoundResult[]
    expect(getFinalAnswerTotals(rounds)).toEqual({ integrityCount: 5, corruptionCount: 1, timeoutCount: 3 })
    expect(getFinalAnswerTotals(rounds)).not.toHaveProperty('winner')
    expect(getFinalAnswerTotals(rounds)).not.toHaveProperty('leaderboard')
  })
})
