import { describe, expect, it } from 'vitest'
import { CITY_CRISIS_EVENTS, CRISIS_SCORE_POLICY, scoreCrisisEvent } from './cityCrisisEvents'
import { ROLE_IDS } from './ourCity'

const players = ROLE_IDS.map((roleId, index) => ({ playerId: `p${index}`, roleId }))

describe('city crisis scoring', () => {
  it('contains two role-specific dilemmas for every city role', () => {
    expect(CITY_CRISIS_EVENTS).toHaveLength(2)
    for (const event of CITY_CRISIS_EVENTS) {
      expect(Object.keys(event.dilemmas).sort()).toEqual([...ROLE_IDS].sort())
      expect(new Set(Object.values(event.dilemmas).map((item) => item.prompt)).size).toBe(8)
    }
  })

  it('uses doubled high-stakes integrity and corruption while preserving timeout', () => {
    expect(CRISIS_SCORE_POLICY).toEqual({ integrity: 100, corruption: -200, timeout: -20 })
    const event = CITY_CRISIS_EVENTS[0]
    const answers = players.slice(0, 2).map((player, index) => ({
      playerId: player.playerId,
      eventId: event.id,
      choiceId: index === 0 ? event.dilemmas[player.roleId].integrityChoiceId : event.dilemmas[player.roleId].choices[1].id,
    }))
    const result = scoreCrisisEvent(500, event, players.slice(0, 3), answers)
    expect(result).toMatchObject({ integrityCount: 1, corruptionCount: 1, timeoutCount: 1, eventTotal: -120, eventAverage: -40, newCityScore: 460 })
  })

  it('clamps the city score and aggregates by each role location', () => {
    const event = CITY_CRISIS_EVENTS[1]
    const answers = players.map((player) => ({ playerId: player.playerId, eventId: event.id, choiceId: event.dilemmas[player.roleId].choices[1].id }))
    const result = scoreCrisisEvent(50, event, players, answers)
    expect(result.newCityScore).toBe(0)
    expect(result.locationSummaries.school).toMatchObject({ participantCount: 2, corruptionCount: 2, scoreAverage: -200 })
  })
})
