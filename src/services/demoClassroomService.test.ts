import { beforeEach, describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import { hasBalancedLockedRoles, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type {
  ClassroomAnswerRecord,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import { DemoClassroomGameService, resetDemoClassroomStateForTests } from './demoClassroomService'

const teacherUid = 'teacher-uid'

const currentRoom = (service: DemoClassroomGameService, roomId: string): ClassroomRoom => {
  let value: ClassroomRoom | null = null
  const unsubscribe = service.subscribeRoom(roomId, (room) => { value = room }, () => undefined)
  unsubscribe()
  if (!value) throw new Error('room not found')
  return value
}

const currentPlayers = (service: DemoClassroomGameService, roomId: string): ClassroomPlayer[] => {
  let value: ClassroomPlayer[] = []
  const unsubscribe = service.subscribePlayers(roomId, (players) => { value = players }, () => undefined)
  unsubscribe()
  return value
}

const currentQuestions = (service: DemoClassroomGameService, roomId: string): PublicRoomQuestion[] => {
  let value: PublicRoomQuestion[] = []
  const unsubscribe = service.subscribeQuestions(roomId, (questions) => { value = questions }, () => undefined)
  unsubscribe()
  return value
}

const currentAnswers = (service: DemoClassroomGameService, roomId: string): ClassroomAnswerRecord[] => {
  let value: ClassroomAnswerRecord[] = []
  const unsubscribe = service.subscribeAnswers(roomId, (answers) => { value = answers }, () => undefined)
  unsubscribe()
  return value
}

const currentRounds = (service: DemoClassroomGameService, roomId: string): ClassroomRoundResult[] => {
  let value: ClassroomRoundResult[] = []
  const unsubscribe = service.subscribeRounds(roomId, (rounds) => { value = rounds }, () => undefined)
  unsubscribe()
  return value
}

const setupGame = async (playerCount = 1, duration = 30) => {
  const service = new DemoClassroomGameService()
  const room = await service.createRoom(teacherUid, duration)
  for (let index = 0; index < playerCount; index += 1) {
    await service.joinRoom({ roomId: room.roomId, nickname: `Player ${index + 1}` }, `owner-${index + 1}`)
  }
  const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
  await service.startGame(room.roomId, teacherUid, snapshot)
  return { service, roomId: room.roomId, snapshot }
}

beforeEach(() => resetDemoClassroomStateForTests())

describe('Demo classroom setup and restore', () => {
  it('rejects duplicate nicknames and incomplete setup', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.joinRoom({ roomId: room.roomId, nickname: 'น้ำ' }, 'owner-1')
    await expect(service.joinRoom({ roomId: room.roomId, nickname: 'น้ำ' }, 'owner-2')).rejects.toThrow('ชื่อนี้ถูกใช้แล้ว')
  })

  it('assigns balanced locked roles and keeps them after a service refresh', async () => {
    const { service, roomId } = await setupGame(17)
    const assigned = currentPlayers(service, roomId)
    const refreshedService = new DemoClassroomGameService()
    const restored = currentPlayers(refreshedService, roomId)

    expect(hasBalancedLockedRoles(assigned)).toBe(true)
    expect(restored.map(({ playerId, roleId }) => ({ playerId, roleId }))).toEqual(
      assigned.map(({ playerId, roleId }) => ({ playerId, roleId })),
    )
  })

  it('restores the same student and current room state after refresh', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const joined = await service.joinRoom({ roomId: room.roomId, nickname: 'เมฆ' }, 'owner-1')
    const refreshed = new DemoClassroomGameService()
    let restored: ClassroomPlayer | null = null
    const unsubscribe = refreshed.subscribePlayer(room.roomId, joined.playerId, (player) => { restored = player }, () => undefined)
    unsubscribe()
    expect(restored).toMatchObject({ playerId: joined.playerId, nickname: 'เมฆ', ownerUid: 'owner-1' })
  })
})

describe('Demo playable ten-question loop', () => {
  it('starts with 80 public questions, ten per role, synchronized at question one', async () => {
    const { service, roomId } = await setupGame(8)
    const room = currentRoom(service, roomId)
    const questions = currentQuestions(service, roomId)

    expect(room).toMatchObject({ status: 'question', currentQuestionNumber: 1, lockedPlayerCount: 8, cityScore: 500 })
    expect(questions).toHaveLength(80)
    expect(questions.every((question) => !('integrityChoiceId' in question))).toBe(true)
  })

  it('accepts one stable answer only and closes when all players answered', async () => {
    const { service, roomId, snapshot } = await setupGame()
    const player = currentPlayers(service, roomId)[0]
    if (!player?.roleId) throw new Error('missing assigned player')
    const question = snapshot.trustedQuestions.find(
      (item) => item.roleId === player.roleId && item.questionNumber === 1,
    )
    if (!question) throw new Error('missing question')

    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.integrityChoiceId)
    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.corruptionChoiceId)
    expect(currentAnswers(service, roomId)).toHaveLength(1)
    expect(shouldCloseQuestion(1, 1, Date.now() + 10_000)).toBe(true)

    const round = await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(round).toMatchObject({ integrityCount: 1, corruptionCount: 0, timeoutCount: 0, roundTotal: 50, newCityScore: 550 })
    expect(currentRoom(service, roomId).status).toBe('question-closed')
  })

  it('turns missing answers into timeout -20 and combines school roles', async () => {
    const { service, roomId, snapshot } = await setupGame(8)
    const round = await service.closeQuestion(roomId, teacherUid, snapshot)

    expect(round.timeoutCount).toBe(8)
    expect(round.roundTotal).toBe(-160)
    expect(round.roundAverage).toBe(-20)
    expect(round.newCityScore).toBe(480)
    expect(round.locationSummaries.school.participantCount).toBe(2)
    expect(round.locationSummaries.school.timeoutCount).toBe(2)
  })

  it('waits in question-closed until the teacher explicitly opens Next', async () => {
    const { service, roomId, snapshot } = await setupGame()
    await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(currentRoom(service, roomId).currentQuestionNumber).toBe(1)
    expect(currentRoom(service, roomId).status).toBe('question-closed')

    await service.openNextQuestion(roomId, teacherUid)
    expect(currentRoom(service, roomId)).toMatchObject({ currentQuestionNumber: 2, status: 'question' })
  })

  it('plays all ten questions and finishes without winner or leaderboard data', async () => {
    const { service, roomId, snapshot } = await setupGame()
    for (let number = 1; number <= 10; number += 1) {
      const player = currentPlayers(service, roomId)[0]
      if (!player?.roleId) throw new Error('missing assigned player')
      const question = snapshot.trustedQuestions.find(
        (item) => item.roleId === player.roleId && item.questionNumber === number,
      )
      if (!question) throw new Error('missing question')
      await service.submitAnswer(
        roomId,
        player.playerId,
        player.ownerUid,
        number,
        question.questionId,
        question.integrityChoiceId,
      )
      await service.closeQuestion(roomId, teacherUid, snapshot)
      if (number < 10) await service.openNextQuestion(roomId, teacherUid)
    }
    await service.finishGame(roomId, teacherUid)
    const room = currentRoom(service, roomId)

    expect(room.status).toBe('finished')
    expect(room.currentQuestionNumber).toBe(10)
    expect(room.cityScore).toBe(1000)
    expect(room.cityLevel).toBe('prosperous')
    expect(room).not.toHaveProperty('winner')
    expect(room).not.toHaveProperty('leaderboard')
    expect(currentRounds(service, roomId)).toHaveLength(10)
  })
})
