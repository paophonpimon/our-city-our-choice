import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot, orderChoicesForPlayer } from './classroomQuestions'
import {
  countAnswersForQuestion,
  getCityImagePath,
  getFinalAnswerTotals,
  getLiveCityScore,
  getRoleQuestion,
  resolveLobbyGuardRoute,
  resolveStudentRouteForStatus,
  shouldCloseQuestion,
} from './classroomGameLoop'
import { ROLE_IDS } from './ourCity'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type { ClassroomAnswerRecord, ClassroomRoomStatus, ClassroomRoundResult } from '../types/classroomGame'

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
    expect(orderChoicesForPlayer(question, 'player-1')).toEqual(
      orderChoicesForPlayer(question, 'player-1'),
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

describe('resolveLobbyGuardRoute — PRE must gate every status, not just lobby', () => {
  const ROOM_ID = 'ROOM01'
  const ADVANCED_STATUSES: ClassroomRoomStatus[] = [
    'role-draw', 'playing', 'round-result', 'crisis-intro', 'crisis-playing', 'crisis-result', 'game-result',
  ]

  // 1. lobby + incomplete PRE + playing room → PRE
  it.each(ADVANCED_STATUSES)('sends an incomplete-PRE student to PRE even once the room has advanced to %s, not into the room', (status) => {
    expect(resolveLobbyGuardRoute(status, false, ROOM_ID)).toBe(`/assessment/pre/${ROOM_ID}`)
  })

  it('sends an incomplete-PRE student to PRE while the room is still in lobby too', () => {
    expect(resolveLobbyGuardRoute('lobby', false, ROOM_ID)).toBe(`/assessment/pre/${ROOM_ID}`)
  })

  // 2. PRE remains usable after room advances (this function never blocks
  // PRE itself - PreAssessmentPage has no status check at all, and this
  // guard's only job for an incomplete student is to always point at PRE,
  // for every status above, which is exactly what the loop above proves.)

  // 4. completed PRE + playing room → game
  it('routes a completed-PRE student straight into the current game screen once the room has advanced', () => {
    expect(resolveLobbyGuardRoute('playing', true, ROOM_ID)).toBe(`/game/${ROOM_ID}`)
    expect(resolveLobbyGuardRoute('role-draw', true, ROOM_ID)).toBe(`/role-draw/${ROOM_ID}`)
    expect(resolveLobbyGuardRoute('game-result', true, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })

  // 5. completed PRE + lobby → lobby (stay put: null means "render the lobby")
  it('lets a completed-PRE student stay on the lobby page while the room is still in lobby', () => {
    expect(resolveLobbyGuardRoute('lobby', true, ROOM_ID)).toBeNull()
    expect(resolveLobbyGuardRoute(undefined, true, ROOM_ID)).toBeNull()
  })

  it('never traps a stale, incomplete-PRE student in PRE for a finished room - the existing finished-room route wins', () => {
    expect(resolveLobbyGuardRoute('finished', false, ROOM_ID)).toBe(resolveStudentRouteForStatus('finished', ROOM_ID))
    expect(resolveLobbyGuardRoute('finished', false, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })

  it('also sends a completed-PRE student to the finished-room route, unchanged from before', () => {
    expect(resolveLobbyGuardRoute('finished', true, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })
})

describe('resolveStudentRouteForStatus — PRE submission must route to the CURRENT room status', () => {
  const ROOM_ID = 'ROOM01'

  // 3. submit after room advances → current game route. PreAssessmentPage
  // calls this exact function, live, after a successful submit - proving it
  // resolves every advanced status to the room, not back to the lobby.
  it.each([
    ['role-draw', `/role-draw/${ROOM_ID}`],
    ['playing', `/game/${ROOM_ID}`],
    ['crisis-playing', `/game/${ROOM_ID}`],
    ['round-result', `/game/${ROOM_ID}`],
    ['game-result', `/result/${ROOM_ID}`],
    ['finished', `/result/${ROOM_ID}`],
  ] as const)('routes a just-completed PRE straight to %s -> %s, never back to the lobby', (status, expected) => {
    expect(resolveStudentRouteForStatus(status, ROOM_ID)).toBe(expected)
    expect(resolveStudentRouteForStatus(status, ROOM_ID)).not.toBe(`/lobby/${ROOM_ID}`)
  })

  it('only resolves to the lobby itself while the room genuinely is still lobby (or status is not yet known)', () => {
    expect(resolveStudentRouteForStatus('lobby', ROOM_ID)).toBe(`/lobby/${ROOM_ID}`)
    expect(resolveStudentRouteForStatus(undefined, ROOM_ID)).toBe(`/lobby/${ROOM_ID}`)
  })
})
