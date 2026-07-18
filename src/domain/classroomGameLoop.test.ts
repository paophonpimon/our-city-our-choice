import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot, orderChoicesForPlayer } from './classroomQuestions'
import {
  countAnswersForQuestion,
  getCityImagePath,
  getFinalAnswerTotals,
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

  it('closes when everyone answered or the shared deadline elapsed', () => {
    expect(shouldCloseQuestion(3, 3, Date.now() + 10_000)).toBe(true)
    expect(shouldCloseQuestion(1, 3, Date.now() - 1)).toBe(true)
    expect(shouldCloseQuestion(1, 3, Date.now() + 10_000)).toBe(false)
  })

  it.each(['critical', 'declining', 'neutral', 'improving', 'prosperous'] as const)(
    'maps %s to the confirmed city image',
    (level) => expect(getCityImagePath(level)).toBe(`/images/city/city-${level}.png`),
  )

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
