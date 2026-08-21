import { describe, expect, it } from 'vitest'
import { assignRolesForCycle, createBalancedRoleOffsets, createRoleRotation, ROLE_IDS, type RotatingRolePlayer } from './ourCity'
import {
  computeChoiceOrderByQuestion,
  createRoomQuestionSnapshot,
  orderChoicesForPlayer,
  parseQuestionSheetRows,
  toPublicRoomQuestion,
} from './classroomQuestions'
import { createQuestionRows, createTrustedQuestions } from '../test/classroomFixtures'

const testPlayers = (count: number): RotatingRolePlayer[] =>
  Array.from({ length: count }, (_, index) => ({
    playerId: `player-${index}`,
    roleId: null,
    roleHistory: [],
    roleOffset: null,
  }))

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

  it('never carries integrity or corruption choice ids to the public question', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const trusted = snapshot.trustedQuestions[0]
    if (!trusted) throw new Error('snapshot is empty')
    const publicQuestion = toPublicRoomQuestion(trusted)

    expect(trusted.integrityChoiceId).toBe(`${trusted.questionId}-c1`)
    expect(trusted.corruptionChoiceId).toBe(`${trusted.questionId}-c2`)
    // Students must never receive the semantic answer key. Position balance
    // is achieved via computeChoiceOrderByQuestion's non-semantic
    // choiceOrder map instead — see the "choice order" describe block below.
    expect(publicQuestion).not.toHaveProperty('integrityChoiceId')
    expect(publicQuestion).not.toHaveProperty('corruptionChoiceId')
    expect(publicQuestion.choiceOrder).toEqual({})
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

  it('creates stable choice IDs', () => {
    const question = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100).publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')

    expect(question.choices.map((choice) => choice.id)).toEqual([`${question.questionId}-c1`, `${question.questionId}-c2`])
  })
})

describe('orderChoicesForPlayer (purely mechanical — never sees integrity)', () => {
  it('shows choices as-is when choiceOrder says index 0, or reversed for index 1', () => {
    const question = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100).publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')
    const asIs = { ...question, choiceOrder: { p1: 0 as const } }
    const reversed = { ...question, choiceOrder: { p1: 1 as const } }

    expect(orderChoicesForPlayer(asIs, 'p1')).toEqual(question.choices)
    expect(orderChoicesForPlayer(reversed, 'p1')).toEqual([question.choices[1], question.choices[0]])
  })

  it('defaults to index 0 for a player with no recorded entry', () => {
    const question = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100).publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')

    expect(orderChoicesForPlayer(question, 'unknown-player')).toEqual(question.choices)
  })

  it('never changes which choice ids are on offer, only their display order', () => {
    const question = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100).publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')
    const withOrder = { ...question, choiceOrder: { p1: 1 as const } }
    const ordered = orderChoicesForPlayer(withOrder, 'p1')

    expect(new Set(ordered.map((choice) => choice.id))).toEqual(new Set(question.choices.map((choice) => choice.id)))
  })
})

describe('computeChoiceOrderByQuestion (the only place integrity is consulted, and never published)', () => {
  const setup = (playerCount = 16) => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const players = testPlayers(playerCount)
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
    const orderByQuestion = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')
    return { snapshot, players, roleRotation, offsets, orderByQuestion }
  }

  it('never produces a value other than 0 or 1 (no semantic/integrity data leaks through)', () => {
    const { orderByQuestion } = setup()
    for (const entries of Object.values(orderByQuestion)) {
      for (const value of Object.values(entries)) {
        expect(value === 0 || value === 1).toBe(true)
      }
    }
  })

  it('balances the integrity choice exactly 5/5 across the 10 questions of one player-role-cycle', () => {
    const { snapshot, players, roleRotation, offsets, orderByQuestion } = setup()
    // cycle 0's assignment is exactly what computeChoiceOrderByQuestion's
    // own first iteration computes, so this finds a real (player, doctor)
    // pairing without duplicating the role-rotation formula in the test.
    const cycle0 = assignRolesForCycle(players, roleRotation, 0, offsets)
    const doctorPlayerId = cycle0.find((player) => player.roleId === 'doctor')?.playerId
    if (!doctorPlayerId) throw new Error('no player reached the doctor role in cycle 0 of the fixture roster')

    const doctorQuestions = snapshot.trustedQuestions.filter((question) => question.roleId === 'doctor')
    expect(doctorQuestions).toHaveLength(10)
    const integrityFirstCount = doctorQuestions.filter((question) => orderByQuestion[question.questionId]?.[doctorPlayerId] === 0).length
    expect(integrityFirstCount).toBe(5)
  })

  it('is deterministic across a simulated refresh/reconnect (same inputs, repeated calls)', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const players = testPlayers(8)
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))

    const first = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const again = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')
      expect(again).toEqual(first)
    }
  })

  it('does not give every player the same position pattern', () => {
    const { orderByQuestion, players } = setup(16)
    const patterns = new Set(
      players.map((player) =>
        Object.keys(orderByQuestion)
          .sort()
          .map((questionId) => orderByQuestion[questionId]?.[player.playerId] ?? '-')
          .join(''),
      ),
    )
    expect(patterns.size).toBeGreaterThan(1)
  })

  it('40-player sanity check: every player-cycle-role hits exactly 5/5, deterministically, with no missing entries', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const players = testPlayers(40)
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
    const orderByQuestion = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')

    // Determinism across all 8 cycles: recomputing from the same inputs
    // must reproduce the exact same map (not just "similar").
    const recomputed = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')
    expect(recomputed).toEqual(orderByQuestion)

    // Replay the real role-rotation mechanism cycle by cycle (exactly as
    // continueCityProgress does in production) to know, for every player,
    // which role they hold in each of the 8 cycles.
    let cyclePlayers: readonly RotatingRolePlayer[] = players
    const assignmentsByCycle: Array<ReturnType<typeof assignRolesForCycle>> = []
    for (let gameCycle = 0; gameCycle < 8; gameCycle += 1) {
      cyclePlayers = assignRolesForCycle(cyclePlayers, roleRotation, gameCycle, offsets)
      assignmentsByCycle.push(cyclePlayers as ReturnType<typeof assignRolesForCycle>)
    }

    // Every player reaches every one of the 8 roles exactly once across the
    // 8 cycles (the pre-existing role-rotation guarantee) — sanity-check
    // that assumption still holds before relying on it below.
    for (const player of players) {
      const rolesSeen = assignmentsByCycle.map((cycle) => cycle.find((candidate) => candidate.playerId === player.playerId)?.roleId)
      expect(new Set(rolesSeen).size).toBe(8)
    }

    let checkedPairs = 0
    for (let gameCycle = 0; gameCycle < 8; gameCycle += 1) {
      for (const player of assignmentsByCycle[gameCycle]!) {
        const roleQuestions = snapshot.trustedQuestions.filter((question) => question.roleId === player.roleId)
        expect(roleQuestions).toHaveLength(10)

        let integrityFirstCount = 0
        for (const question of roleQuestions) {
          const entry = orderByQuestion[question.questionId]?.[player.playerId]
          // No missing player/order entry for the role each player receives.
          expect(entry === 0 || entry === 1).toBe(true)
          if (entry === 0) integrityFirstCount += 1
          checkedPairs += 1
        }
        // Exactly 5/5 for every player, for every cycle — not just one
        // sampled player/role.
        expect(integrityFirstCount).toBe(5)
      }
    }
    expect(checkedPairs).toBe(40 * 8 * 10)
  })
})
