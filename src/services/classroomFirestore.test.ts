import { describe, expect, it } from 'vitest'
import { computeChoiceOrderByQuestion, createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import { createBalancedRoleOffsets, createRoleRotation, type RotatingRolePlayer } from '../domain/ourCity'
import { createTrustedQuestions } from '../test/classroomFixtures'
import { classroomPaths, createClassroomAnswerId, createPreAssessmentId, toPublicQuestionDocument } from './classroomFirestore'

describe('simple classroom Firestore data', () => {
  it('uses stable room subcollection paths and answer IDs', () => {
    expect(classroomPaths.player('ROOM01', 'p1')).toBe('rooms/ROOM01/players/p1')
    expect(classroomPaths.question('ROOM01', 'doctor-01')).toBe('rooms/ROOM01/questions/doctor-01')
    expect(classroomPaths.answer('ROOM01', '2::p1::doctor-01')).toBe('rooms/ROOM01/answers/2::p1::doctor-01')
    expect(classroomPaths.round('ROOM01', 2, 1)).toBe('rooms/ROOM01/rounds/2::1')
    expect(createClassroomAnswerId(2, 'p1', 'doctor-01')).toBe('2::p1::doctor-01')
  })

  it('keeps the PRE assessment isolated in its own collection, keyed pre::{playerId}', () => {
    expect(createPreAssessmentId('p1')).toBe('pre::p1')
    expect(classroomPaths.assessment('ROOM01', createPreAssessmentId('p1'))).toBe('rooms/ROOM01/assessments/pre::p1')
    expect(() => createPreAssessmentId('')).toThrow()
    expect(() => createPreAssessmentId('a/b')).toThrow()
  })

  // Security boundary regression test: students must never receive the
  // semantic answer key, in any form, on any question document actually
  // written by startGame(). This exercises the real production path
  // (trusted snapshot -> public question -> computeChoiceOrderByQuestion ->
  // Firestore document shape), not just an empty/default choiceOrder.
  it('never leaks integrity/corruption truth in the document startGame() actually writes', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const players: RotatingRolePlayer[] = Array.from({ length: 8 }, (_, index) => ({
      playerId: `player-${index}`,
      roleId: null,
      roleHistory: [],
      roleOffset: null,
    }))
    const roleRotation = createRoleRotation()
    const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
    const choiceOrderByQuestion = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'ROOM01')

    for (const publicQuestion of snapshot.publicQuestions) {
      const document = {
        ...toPublicQuestionDocument(publicQuestion),
        choiceOrder: choiceOrderByQuestion[publicQuestion.questionId] ?? {},
      }
      expect(Object.keys(document).sort()).toEqual(
        ['choiceOrder', 'choices', 'imageUrl', 'prompt', 'questionId', 'questionNumber', 'roleId'],
      )
      expect(document).not.toHaveProperty('integrityChoiceId')
      expect(document).not.toHaveProperty('corruptionChoiceId')
      // choiceOrder values must be plain 0/1 — never a choice id string or
      // anything else that could be correlated back to which is integrity.
      for (const value of Object.values(document.choiceOrder)) {
        expect(value === 0 || value === 1).toBe(true)
      }
    }
  })
})
