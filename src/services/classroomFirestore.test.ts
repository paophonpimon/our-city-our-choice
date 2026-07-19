import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import { createTrustedQuestions } from '../test/classroomFixtures'
import { classroomPaths, createClassroomAnswerId, toPublicQuestionDocument } from './classroomFirestore'

describe('simple classroom Firestore data', () => {
  it('uses stable room subcollection paths and answer IDs', () => {
    expect(classroomPaths.player('ROOM01', 'p1')).toBe('rooms/ROOM01/players/p1')
    expect(classroomPaths.question('ROOM01', 'doctor-01')).toBe('rooms/ROOM01/questions/doctor-01')
    expect(classroomPaths.answer('ROOM01', '2::p1::doctor-01')).toBe('rooms/ROOM01/answers/2::p1::doctor-01')
    expect(classroomPaths.round('ROOM01', 2, 1)).toBe('rooms/ROOM01/rounds/2::1')
    expect(createClassroomAnswerId(2, 'p1', 'doctor-01')).toBe('2::p1::doctor-01')
  })

  it('never includes integrity mapping in a public Firestore question', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 100)
    const question = snapshot.publicQuestions[0]
    if (!question) throw new Error('snapshot is empty')
    const document = toPublicQuestionDocument(question)

    expect(document).not.toHaveProperty('integrityChoiceId')
    expect(document).not.toHaveProperty('corruptionChoiceId')
    expect(Object.keys(document)).toEqual(['questionId', 'roleId', 'questionNumber', 'prompt', 'choices', 'imageUrl'])
  })
})
