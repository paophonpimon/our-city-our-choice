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

export const toPublicQuestionDocument = (question: PublicRoomQuestion): PublicRoomQuestion => ({
  questionId: question.questionId,
  roleId: question.roleId,
  questionNumber: question.questionNumber,
  prompt: question.prompt,
  choices: [{ ...question.choices[0] }, { ...question.choices[1] }],
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
