import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from './classroomQuestions'
import { CITY_CRISIS_EVENTS } from './cityCrisisEvents'
import { assertPersonalOutcomeTotals, countPersonalDecisionOutcomes, derivePersonalImpactNarrative, resolveCrisisPersonalResults, resolveQuestionPersonalResults } from './personalDecisionResults'
import { createTrustedQuestions } from '../test/classroomFixtures'

const players = [
  { playerId: 'student-1', ownerUid: 'owner-1', roleId: 'doctor' as const },
  { playerId: 'student-2', ownerUid: 'owner-2', roleId: 'municipal' as const },
  { playerId: 'student-3', ownerUid: 'owner-3', roleId: 'police' as const },
]

describe('trusted personal decision results', () => {
  it('counts numeric personal totals from the finalized records available to Result', () => {
    const records = (['integrity', 'integrity', 'corruption', 'timeout'] as const).map((outcome, index) => ({
      decisionId: `0::question::${index + 1}::student-1`,
      roomId: 'ROOM01',
      playerId: 'student-1',
      ownerUid: 'owner-1',
      gameCycle: 0,
      roleId: 'doctor' as const,
      source: 'question' as const,
      sequenceNumber: index + 1,
      outcome,
      resolvedAt: 100 + index,
    }))
    expect(countPersonalDecisionOutcomes(records)).toEqual({ integrity: 2, corruption: 1, timeout: 1 })
  })

  it('resolves normal-question outcomes without exposing answer keys or chosen ids', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const questionFor = (roleId: typeof players[number]['roleId']) => {
      const question = snapshot.trustedQuestions.find((candidate) => candidate.roleId === roleId && candidate.questionNumber === 1)
      if (!question) throw new Error(`missing fixture question for ${roleId}`)
      return question
    }
    const integrityQuestion = questionFor(players[0].roleId)
    const corruptionQuestion = questionFor(players[1].roleId)
    const corruptionChoice = corruptionQuestion.choices.find((choice) => choice.id !== corruptionQuestion.integrityChoiceId)
    if (!corruptionChoice) throw new Error('missing corruption choice')

    const results = resolveQuestionPersonalResults('ROOM01', 0, 1, players, snapshot, [
      { answerId: 'a1', roomId: 'ROOM01', playerId: players[0].playerId, ownerUid: players[0].ownerUid, gameCycle: 0, questionNumber: 1, questionId: integrityQuestion.questionId, choiceId: integrityQuestion.integrityChoiceId, submittedAt: 110 },
      { answerId: 'a2', roomId: 'ROOM01', playerId: players[1].playerId, ownerUid: players[1].ownerUid, gameCycle: 0, questionNumber: 1, questionId: corruptionQuestion.questionId, choiceId: corruptionChoice.id, submittedAt: 111 },
    ], 120)

    expect(results.map((result) => result.outcome)).toEqual(['integrity', 'corruption', 'timeout'])
    expect(results.every((result) => !('choiceId' in result) && !('integrityChoiceId' in result) && !('score' in result))).toBe(true)
    assertPersonalOutcomeTotals(results, { integrityCount: 1, corruptionCount: 1, timeoutCount: 1 })
  })

  it('includes crisis decisions in the same private outcome model', () => {
    const event = CITY_CRISIS_EVENTS[0]
    const integrityChoice = event.dilemmas[players[0].roleId].integrityChoiceId
    const corruptionChoice = event.dilemmas[players[1].roleId].choices.find((choice) => choice.id !== event.dilemmas[players[1].roleId].integrityChoiceId)
    if (!corruptionChoice) throw new Error('missing crisis corruption choice')

    const results = resolveCrisisPersonalResults('ROOM01', 0, event, players, [
      { recordType: 'crisis', answerId: 'c1', roomId: 'ROOM01', playerId: players[0].playerId, ownerUid: players[0].ownerUid, gameCycle: 0, eventIndex: event.index, eventId: event.id, roleId: players[0].roleId, choiceId: integrityChoice, submittedAt: 130 },
      { recordType: 'crisis', answerId: 'c2', roomId: 'ROOM01', playerId: players[1].playerId, ownerUid: players[1].ownerUid, gameCycle: 0, eventIndex: event.index, eventId: event.id, roleId: players[1].roleId, choiceId: corruptionChoice.id, submittedAt: 131 },
    ], 140)

    expect(results.map((result) => [result.source, result.outcome])).toEqual([
      ['crisis', 'integrity'],
      ['crisis', 'corruption'],
      ['crisis', 'timeout'],
    ])
    assertPersonalOutcomeTotals(results, { integrityCount: 1, corruptionCount: 1, timeoutCount: 1 })
  })
})

describe('personal impact narrative', () => {
  it.each([
    [{ integrity: 6, corruption: 2, timeout: 1 }, 'integrity-majority'],
    [{ integrity: 2, corruption: 6, timeout: 1 }, 'corruption-majority'],
    [{ integrity: 4, corruption: 4, timeout: 1 }, 'balanced'],
    [{ integrity: 2, corruption: 1, timeout: 4 }, 'high-timeout'],
  ] as const)('derives %s from finalized personal counts', (totals, expectedKind) => {
    expect(derivePersonalImpactNarrative(totals, 'neutral').kind).toBe(expectedKind)
  })

  it('adds city context without assigning a moral trait or claiming causality', () => {
    const narrative = derivePersonalImpactNarrative({ integrity: 5, corruption: 1, timeout: 0 }, 'improving')
    const text = `${narrative.decisionMessage} ${narrative.cityMessage}`
    expect(text).toContain('เมืองจำลอง')
    expect(text).not.toMatch(/คนสุจริต|คนทุจริต|เป็นคน|นิสัย|ตัวตน|พิสูจน์|ทำให้เมืองดีขึ้นเพราะคุณ/)
  })
})
