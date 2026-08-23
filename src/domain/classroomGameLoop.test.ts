import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot, orderChoicesForPlayer } from './classroomQuestions'
import {
  countAnswersForQuestion,
  countCompletedPreAssessments,
  countCrisisAnswersForEvent,
  getCityImagePath,
  getFinalAnswerTotals,
  getLiveCityScore,
  getRoleQuestion,
  resolveAssessmentFlowStep,
  resolveLobbyGuardRoute,
  resolvePostAssessmentGuardRoute,
  resolveStudentRouteForStatus,
  shouldCloseQuestion,
  shouldAutoCloseCrisis,
} from './classroomGameLoop'
import { ROLE_IDS } from './ourCity'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type { ClassroomAnswerRecord, ClassroomPlayer, ClassroomPreAssessment, ClassroomRoomStatus, ClassroomRoundResult } from '../types/classroomGame'

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

  // Regression pin for a reported crisis bug: a single-student room where
  // the crisis answer arrived ~28s before a ~30s deadline still showed
  // "1/1 answered" but the room only progressed once the deadline itself
  // expired - as if closure eligibility depended on the deadline. It must
  // not: reaching lockedPlayerCount is sufficient on its own, at any
  // distance from the deadline, including a deadline far in the future.
  it('is close-eligible the instant everyone has answered, however far the deadline still is - this must never require waiting for the deadline', () => {
    const wellBeforeDeadline = Date.now() + 27_800
    expect(shouldCloseQuestion(1, 1, wellBeforeDeadline)).toBe(true)
    expect(shouldCloseQuestion(1, 1, Date.now() + 10 * 60_000)).toBe(true)
    expect(shouldCloseQuestion(1, 1, null)).toBe(true)
  })

  it('keeps fresh Crisis 1 and Crisis 2 open at zero answers before their deadlines', () => {
    const now = 100_000
    expect(shouldAutoCloseCrisis(0, 1, now, now + 30_000, now + 10)).toBe(false)
    expect(shouldAutoCloseCrisis(0, 1, now + 60_000, now + 90_000, now + 60_010)).toBe(false)
  })

  it('counts Crisis answers only for the current event and cycle', () => {
    const answers = [
      { recordType: 'crisis', playerId: 'p1', gameCycle: 0, eventId: 'construction-audit' },
      { recordType: 'crisis', playerId: 'p1', gameCycle: 0, eventId: 'public-emergency' },
      { recordType: 'crisis', playerId: 'p2', gameCycle: 1, eventId: 'public-emergency' },
      { recordType: 'question', playerId: 'p3', gameCycle: 0 },
    ] as ClassroomAnswerRecord[]
    expect(countCrisisAnswersForEvent(answers, 0, 'public-emergency')).toBe(1)
    expect(shouldAutoCloseCrisis(countCrisisAnswersForEvent(answers, 0, 'construction-audit'), 2, 100, 200, 101)).toBe(false)
    const priorEventOnly = answers.filter((answer) => !('eventId' in answer) || answer.eventId !== 'public-emergency')
    expect(shouldAutoCloseCrisis(countCrisisAnswersForEvent(priorEventOnly, 0, 'public-emergency'), 1, 100, 200, 101)).toBe(false)
  })

  it('auto-closes Crisis when all current players answered or a valid current deadline elapsed', () => {
    expect(shouldAutoCloseCrisis(1, 1, 100, 30_100, 101)).toBe(true)
    expect(shouldAutoCloseCrisis(0, 1, 100, 30_100, 30_101)).toBe(true)
  })

  it('never trusts a missing, reversed, or stale unpaired Crisis deadline', () => {
    expect(shouldAutoCloseCrisis(0, 1, null, 50, 100)).toBe(false)
    expect(shouldAutoCloseCrisis(0, 1, 100, null, 200)).toBe(false)
    expect(shouldAutoCloseCrisis(0, 1, 100, 100, 200)).toBe(false)
    expect(shouldAutoCloseCrisis(0, 1, 101, 100, 200)).toBe(false)
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

describe('resolveLobbyGuardRoute — PRE only gates once the teacher has opened it', () => {
  const ROOM_ID = 'ROOM01'
  const ADVANCED_STATUSES: ClassroomRoomStatus[] = [
    'role-draw', 'playing', 'round-result', 'crisis-intro', 'crisis-playing', 'crisis-result', 'game-result',
  ]

  // Before the teacher opens PRE, an incomplete student is never gated to
  // PRE - they simply follow the room's status like anyone else.
  it('lets an incomplete-PRE student stay on the lobby page while PRE has not been opened yet', () => {
    expect(resolveLobbyGuardRoute('lobby', false, false, ROOM_ID)).toBeNull()
    expect(resolveLobbyGuardRoute(undefined, false, false, ROOM_ID)).toBeNull()
  })

  // Once opened, an incomplete student must be sent to PRE for every status
  // the room could realistically be in - even though startGame's own
  // precondition means the room cannot actually leave 'lobby' before PRE is
  // opened, this proves the guard itself does not rely on that invariant.
  it.each(ADVANCED_STATUSES)('sends an incomplete-PRE student to PRE once opened, even for status %s, not into the room', (status) => {
    expect(resolveLobbyGuardRoute(status, true, false, ROOM_ID)).toBe(`/assessment/pre/${ROOM_ID}`)
  })

  it('sends an incomplete-PRE student to PRE while the room is still in lobby too, once opened', () => {
    expect(resolveLobbyGuardRoute('lobby', true, false, ROOM_ID)).toBe(`/assessment/pre/${ROOM_ID}`)
  })

  it('routes a completed-PRE student straight into the current game screen once the room has advanced', () => {
    expect(resolveLobbyGuardRoute('playing', true, true, ROOM_ID)).toBe(`/game/${ROOM_ID}`)
    expect(resolveLobbyGuardRoute('role-draw', true, true, ROOM_ID)).toBe(`/role-draw/${ROOM_ID}`)
    expect(resolveLobbyGuardRoute('game-result', true, true, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })

  // completed PRE + lobby → lobby (stay put: null means "render the lobby")
  it('lets a completed-PRE student stay on the lobby page while the room is still in lobby', () => {
    expect(resolveLobbyGuardRoute('lobby', true, true, ROOM_ID)).toBeNull()
    expect(resolveLobbyGuardRoute(undefined, true, true, ROOM_ID)).toBeNull()
  })

  it('never traps a stale, incomplete-PRE student in PRE for a finished room - the existing finished-room route wins', () => {
    expect(resolveLobbyGuardRoute('finished', true, false, ROOM_ID)).toBe(resolveStudentRouteForStatus('finished', ROOM_ID))
    expect(resolveLobbyGuardRoute('finished', true, false, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })

  it('also sends a completed-PRE student to the finished-room route, unchanged from before', () => {
    expect(resolveLobbyGuardRoute('finished', true, true, ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })
})

describe('countCompletedPreAssessments — matched by playerId, never inflated by stale records', () => {
  const players = [
    { playerId: 'p1' },
    { playerId: 'p2' },
    { playerId: 'p3' },
  ] as ClassroomPlayer[]

  it('counts only current players who have a matching PRE submission', () => {
    const assessments = [{ playerId: 'p1' }, { playerId: 'p2' }] as ClassroomPreAssessment[]
    expect(countCompletedPreAssessments(players, assessments)).toBe(2)
  })

  it('ignores an orphaned assessment from a player no longer in the roster', () => {
    const assessments = [{ playerId: 'p1' }, { playerId: 'someone-who-left' }] as ClassroomPreAssessment[]
    expect(countCompletedPreAssessments(players, assessments)).toBe(1)
  })

  it('never double-counts a duplicate assessment record for the same player', () => {
    const assessments = [{ playerId: 'p1' }, { playerId: 'p1' }] as ClassroomPreAssessment[]
    expect(countCompletedPreAssessments(players, assessments)).toBe(1)
  })

  it('returns 0 when nobody has submitted', () => {
    expect(countCompletedPreAssessments(players, [])).toBe(0)
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

describe('resolvePostAssessmentGuardRoute — POST/Reflection only ever appropriate once the activity is truly finished', () => {
  const ROOM_ID = 'ROOM01'
  const NOT_YET_FINISHED_STATUSES: ClassroomRoomStatus[] = [
    'lobby', 'role-draw', 'playing', 'round-result', 'crisis-intro', 'crisis-playing', 'crisis-result', 'game-result',
  ]

  it.each(NOT_YET_FINISHED_STATUSES)('bounces a direct visit away from POST while the activity is not finished yet (status %s)', (status) => {
    const route = resolvePostAssessmentGuardRoute(status, ROOM_ID)
    expect(route).not.toBeNull()
    expect(route).toBe(resolveStudentRouteForStatus(status, ROOM_ID))
  })

  it('bounces even from game-result, where the teacher may still choose to continue playing', () => {
    expect(resolvePostAssessmentGuardRoute('game-result', ROOM_ID)).toBe(`/result/${ROOM_ID}`)
  })

  it('lets the student stay once the room is finished', () => {
    expect(resolvePostAssessmentGuardRoute('finished', ROOM_ID)).toBeNull()
  })

  it('bounces when status is not yet known (room still loading)', () => {
    expect(resolvePostAssessmentGuardRoute(undefined, ROOM_ID)).not.toBeNull()
  })
})

describe('resolveAssessmentFlowStep — server records plus resolved active-write acknowledgement', () => {
  it('starts at post when neither POST nor reflection exist yet', () => {
    expect(resolveAssessmentFlowStep(false, false)).toBe('post')
  })

  it('resumes at reflection once POST exists but reflection does not - refresh must never lose or repeat a completed POST', () => {
    expect(resolveAssessmentFlowStep(true, false)).toBe('reflection')
  })

  it('shows complete once both exist - refresh must never repeat a completed reflection', () => {
    expect(resolveAssessmentFlowStep(true, true)).toBe('complete')
  })

  it('never resolves to complete or reflection when POST itself is still missing, even if reflection somehow already exists', () => {
    // Reflection can only ever be submitted from the reflection step, which
    // itself requires POST to already exist, so this combination should
    // not occur in practice - but the derivation must still fail safe by
    // treating POST as the gating step, not silently skip ahead.
    expect(resolveAssessmentFlowStep(false, true)).toBe('post')
  })

  it('advances immediately from a resolved POST write without waiting for a second listener event', () => {
    expect(resolveAssessmentFlowStep(false, false, true, false)).toBe('reflection')
  })

  it('completes immediately from a resolved Reflection write while refresh still uses server records', () => {
    expect(resolveAssessmentFlowStep(true, false, false, true)).toBe('complete')
    expect(resolveAssessmentFlowStep(true, true)).toBe('complete')
  })
})
