import { describe, expect, it } from 'vitest'
import * as ourCityDomain from './ourCity'
import {
  QUESTIONS_PER_PLAYER,
  ROLE_IDS,
  ROLES,
  assignBalancedRoles,
  createAnswerKey,
  formatQuestionProgressLabel,
  isPositiveInteger,
  isRoleId,
  validateRoomSettings,
} from './ourCity'

describe('Our City roles', () => {
  it('defines exactly 8 unique confirmed role IDs', () => {
    expect(ROLE_IDS).toHaveLength(8)
    expect(new Set(ROLE_IDS).size).toBe(8)
    expect(ROLE_IDS.every(isRoleId)).toBe(true)
  })

  it('defines every Thai role label and stable order', () => {
    expect(ROLES.map(({ id, label, order }) => ({ id, label, order }))).toEqual([
      { id: 'mayor', label: 'นายกเทศมนตรี', order: 1 },
      { id: 'municipal', label: 'เจ้าหน้าที่เทศบาล', order: 2 },
      { id: 'police', label: 'ตำรวจ', order: 3 },
      { id: 'teacher', label: 'ครู', order: 4 },
      { id: 'merchant', label: 'พ่อค้าแม่ค้า', order: 5 },
      { id: 'contractor', label: 'ผู้รับเหมา', order: 6 },
      { id: 'student', label: 'นักเรียน', order: 7 },
      { id: 'journalist', label: 'นักข่าว', order: 8 },
    ])
  })

  it('assigns only unassigned players and keeps role counts within one', () => {
    const players = Array.from({ length: 34 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      roleId: index === 0 ? ('mayor' as const) : index === 1 ? ('municipal' as const) : null,
    }))

    const assigned = assignBalancedRoles(players)
    const counts = Object.fromEntries(ROLE_IDS.map((roleId) => [roleId, 0])) as Record<(typeof ROLE_IDS)[number], number>
    for (const player of assigned) counts[player.roleId] += 1

    expect(assigned[0]?.roleId).toBe('mayor')
    expect(assigned[1]?.roleId).toBe('municipal')
    expect(assigned.every((player) => player.roleId !== null)).toBe(true)
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1)
  })

  it('does not change any locked role', () => {
    const players = ROLE_IDS.map((roleId, index) => ({ playerId: `locked-${index}`, roleId }))
    expect(assignBalancedRoles(players)).toEqual(players)
  })
})

describe('Our City answer and progress identity', () => {
  it('creates the same deterministic key for the same player and question', () => {
    const first = createAnswerKey('player-1', 'police-01')
    const retry = createAnswerKey('player-1', 'police-01')
    expect(first).toBe(retry)
    expect(new Set([first, retry]).size).toBe(1)
  })

  it('separates different player or question pairs', () => {
    expect(createAnswerKey('player-1', 'police-01')).not.toBe(createAnswerKey('player-2', 'police-01'))
    expect(createAnswerKey('player-1', 'police-01')).not.toBe(createAnswerKey('player-1', 'police-02'))
  })

  it('formats the first and last zero-based question indexes', () => {
    expect(formatQuestionProgressLabel(0)).toBe('คำถามข้อที่ 1/10')
    expect(formatQuestionProgressLabel(QUESTIONS_PER_PLAYER - 1)).toBe('คำถามข้อที่ 10/10')
  })
})

describe('Our City room settings', () => {
  it('accepts only positive integer question durations', () => {
    expect(isPositiveInteger(1)).toBe(true)
    expect(isPositiveInteger(30)).toBe(true)
    expect(isPositiveInteger(0)).toBe(false)
    expect(isPositiveInteger(-1)).toBe(false)
    expect(isPositiveInteger(1.5)).toBe(false)
  })

  it('validates duration and locks questionsPerPlayer to 10', () => {
    expect(validateRoomSettings({ questionDurationSec: 30, questionsPerPlayer: 10 })).toEqual({
      valid: true,
      errors: [],
    })
    expect(validateRoomSettings({ questionDurationSec: 0, questionsPerPlayer: 9 })).toEqual({
      valid: false,
      errors: ['question-duration-must-be-positive-integer', 'questions-per-player-must-be-10'],
    })
  })

  it('does not define score thresholds or a score-to-level mapper in Phase 2', () => {
    expect(ourCityDomain).not.toHaveProperty('CITY_SCORE_THRESHOLDS')
    expect(ourCityDomain).not.toHaveProperty('mapCityScoreToLevel')
  })
})
