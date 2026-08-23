import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { PublicRoomQuestion, RoomQuestionSnapshot } from '../domain/classroomQuestions'
import type { CityLevel, QuestionNumber } from '../domain/ourCity'
import type { RoundScoreResult } from '../domain/cityScoring'

export interface ClassroomAnswer {
  answerId: string
  roomId: string
  playerId: string
  ownerUid: string
  gameCycle: number
  questionNumber: QuestionNumber
  questionId: string
  choiceId: string
  submittedAt: unknown
}

export interface ClassroomRoomState {
  status: string
  currentQuestionNumber: QuestionNumber
  questionDurationSec: number
  questionStartedAt: unknown
  questionDeadlineAt: unknown
  lockedPlayerCount: number
  cityScore: number
  cityLevel: CityLevel
  updatedAt: unknown
}

export const classroomPaths = {
  room: (roomId: string) => `rooms/${roomId}`,
  player: (roomId: string, playerId: string) => `rooms/${roomId}/players/${playerId}`,
  question: (roomId: string, questionId: string) => `rooms/${roomId}/questions/${questionId}`,
  answer: (roomId: string, answerId: string) => `rooms/${roomId}/answers/${answerId}`,
  round: (roomId: string, gameCycle: number, questionNumber: number) => `rooms/${roomId}/rounds/${gameCycle}::${questionNumber}`,
  crisisResult: (roomId: string, gameCycle: number, eventIndex: number) => `rooms/${roomId}/crisisResults/${gameCycle}::${eventIndex}`,
  personalDecisionResult: (roomId: string, decisionId: string) => `rooms/${roomId}/personalResults/${decisionId}`,
  assessment: (roomId: string, assessmentId: string) => `rooms/${roomId}/assessments/${assessmentId}`,
} as const

export const createClassroomAnswerId = (gameCycle: number, playerId: string, questionId: string): string => {
  if (!Number.isInteger(gameCycle) || gameCycle < 0 || !playerId.trim() || !questionId.trim() || playerId.includes('/') || questionId.includes('/')) {
    throw new Error('gameCycle and Firestore-safe playerId/questionId are required')
  }
  return `${gameCycle}::${playerId}::${questionId}`
}

export const createClassroomRoundId = (gameCycle: number, questionNumber: number): string => {
  if (!Number.isInteger(gameCycle) || gameCycle < 0 || !Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 10) {
    throw new Error('gameCycle and questionNumber must be valid')
  }
  return `${gameCycle}::${questionNumber}`
}

export const createCrisisAnswerId = (gameCycle: number, playerId: string, eventId: string): string => {
  if (!Number.isInteger(gameCycle) || gameCycle < 0 || !playerId.trim() || !eventId.trim() || playerId.includes('/') || eventId.includes('/')) {
    throw new Error('gameCycle and Firestore-safe playerId/eventId are required')
  }
  return `${gameCycle}::${playerId}::crisis::${eventId}`
}

export const createCrisisResultId = (gameCycle: number, eventIndex: number): string => {
  if (!Number.isInteger(gameCycle) || gameCycle < 0 || ![1, 2].includes(eventIndex)) throw new Error('invalid crisis result id')
  return `${gameCycle}::${eventIndex}`
}

export const createPreAssessmentId = (playerId: string): string => {
  if (!playerId.trim() || playerId.includes('/')) throw new Error('Firestore-safe playerId is required')
  return `pre::${playerId}`
}

export const createPostAssessmentId = (playerId: string): string => {
  if (!playerId.trim() || playerId.includes('/')) throw new Error('Firestore-safe playerId is required')
  return `post::${playerId}`
}

export const createReflectionId = (playerId: string): string => {
  if (!playerId.trim() || playerId.includes('/')) throw new Error('Firestore-safe playerId is required')
  return `reflection::${playerId}`
}

export const createPersonalDecisionId = (
  gameCycle: number,
  source: 'question' | 'crisis',
  sequenceNumber: number,
  playerId: string,
): string => {
  if (!Number.isInteger(gameCycle) || gameCycle < 0 || !Number.isInteger(sequenceNumber) || sequenceNumber < 1 || !playerId.trim() || playerId.includes('/')) {
    throw new Error('personal decision id requires safe cycle, sequence, and player id')
  }
  return `${gameCycle}::${source}::${sequenceNumber}::${playerId}`
}

export const toPublicQuestionDocument = (question: PublicRoomQuestion): PublicRoomQuestion => ({
  questionId: question.questionId,
  roleId: question.roleId,
  questionNumber: question.questionNumber,
  prompt: question.prompt,
  choices: [{ ...question.choices[0] }, { ...question.choices[1] }],
  // Passed through as-is; startGame() is the only real caller and always
  // overwrites this with the real computeChoiceOrderByQuestion result.
  choiceOrder: { ...question.choiceOrder },
  imageUrl: question.imageUrl,
})

export const writePublicQuestionSnapshot = async (
  db: Firestore,
  roomId: string,
  snapshot: RoomQuestionSnapshot,
): Promise<void> => {
  if (snapshot.roomId !== roomId) throw new Error('snapshot roomId does not match target room')
  const batch = writeBatch(db)
  for (const question of snapshot.publicQuestions) {
    batch.set(doc(db, classroomPaths.question(roomId, question.questionId)), toPublicQuestionDocument(question))
  }
  await batch.commit()
}

export const submitClassroomAnswer = async (
  db: Firestore,
  input: Omit<ClassroomAnswer, 'answerId' | 'submittedAt'>,
): Promise<string> => {
  const answerId = createClassroomAnswerId(input.gameCycle, input.playerId, input.questionId)
  await setDoc(doc(db, classroomPaths.answer(input.roomId, answerId)), {
    ...input,
    answerId,
    submittedAt: serverTimestamp(),
  })
  return answerId
}

export const subscribeClassroomAnswers = (
  db: Firestore,
  roomId: string,
  listener: (answers: ClassroomAnswer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe =>
  onSnapshot(
    collection(db, `${classroomPaths.room(roomId)}/answers`),
    (snapshot) => listener(snapshot.docs.map((answer) => answer.data() as ClassroomAnswer)),
    onError,
  )

export const writeRoundResult = async (
  db: Firestore,
  roomId: string,
  gameCycle: number,
  result: RoundScoreResult,
): Promise<void> => {
  const batch = writeBatch(db)
  batch.set(doc(db, classroomPaths.round(roomId, gameCycle, result.questionNumber)), {
    ...result,
    gameCycle,
    finalizedAt: serverTimestamp(),
  })
  batch.update(doc(db, classroomPaths.room(roomId)), {
    cityScore: result.newCityScore,
    cityLevel: result.cityLevel,
    status: 'round-result',
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}
