import { describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from './classroomQuestions'
import { resolveLiveAnswerImpact } from './liveAnswerImpact'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type { ClassroomAnswerRecord } from '../types/classroomGame'

const answer = (questionId: string, choiceId: string): ClassroomAnswerRecord => ({
  answerId: `0::player-1::${questionId}`,
  roomId: 'ROOM01',
  playerId: 'player-1',
  ownerUid: 'owner-1',
  gameCycle: 0,
  questionNumber: 1,
  questionId,
  choiceId,
  submittedAt: 100,
})

describe('live answer impacts', () => {
  it('maps integrity and corruption choices to the correct building immediately', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 1)
    const question = snapshot.trustedQuestions.find((candidate) => candidate.questionNumber === 1)
    if (!question) throw new Error('missing question')

    expect(resolveLiveAnswerImpact(answer(question.questionId, question.integrityChoiceId), snapshot)).toMatchObject({ score: 50 })
    expect(resolveLiveAnswerImpact(answer(question.questionId, question.corruptionChoiceId), snapshot)).toMatchObject({ score: -100 })
  })

  it('ignores choices that are not part of the trusted teacher snapshot', () => {
    const snapshot = createRoomQuestionSnapshot('ROOM01', createTrustedQuestions(), 1)
    const question = snapshot.trustedQuestions[0]
    expect(resolveLiveAnswerImpact(answer(question.questionId, 'forged-choice'), snapshot)).toBeNull()
  })
})

