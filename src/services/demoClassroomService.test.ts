import { beforeEach, describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import { hasBalancedLockedRoles, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { MAX_GAME_CYCLES } from '../domain/ourCity'
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

const setupRoleDraw = async (playerCount = 8, duration = 30) => {
  const service = new DemoClassroomGameService()
  const room = await service.createRoom(teacherUid, duration)
  for (let index = 0; index < playerCount; index += 1) {
    await service.joinRoom({ roomId: room.roomId, nickname: `Player ${index + 1}` }, `owner-${index + 1}`)
  }
  const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
  await service.startGame(room.roomId, teacherUid, snapshot)
  return { service, roomId: room.roomId, snapshot }
}

const setupPlaying = async (playerCount = 8, duration = 30) => {
  const setup = await setupRoleDraw(playerCount, duration)
  await setup.service.beginQuestions(setup.roomId, teacherUid)
  return setup
}

const completeCurrentCycle = async (
  service: DemoClassroomGameService,
  roomId: string,
  snapshot: ReturnType<typeof createRoomQuestionSnapshot>,
): Promise<void> => {
  for (let questionNumber = 1; questionNumber <= 10; questionNumber += 1) {
    await service.closeQuestion(roomId, teacherUid, snapshot)
    if (questionNumber < 10) await service.openNextQuestion(roomId, teacherUid)
  }
  await service.finishGame(roomId, teacherUid)
}

beforeEach(() => resetDemoClassroomStateForTests())

describe('Continue City Progress setup and role draw', () => {
  it('creates a new room with fresh city progress and empty role history', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom({ roomId: room.roomId, nickname: 'น้ำ' }, 'owner-1')
    expect(room).toMatchObject({ status: 'lobby', gameCycle: 0, completedGameCount: 0, currentQuestionNumber: 0, cityScore: 500 })
    expect(room).toMatchObject({ integrityTotal: 0, corruptionTotal: 0, timeoutTotal: 0 })
    expect(player).toMatchObject({ roleId: null, roleHistory: [], roleOffset: null })
  })

  it('rejects duplicate names and blocks new joins after the first role draw', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.joinRoom({ roomId: room.roomId, nickname: 'น้ำ' }, 'owner-1')
    await expect(service.joinRoom({ roomId: room.roomId, nickname: 'น้ำ' }, 'owner-2')).rejects.toThrow('ชื่อนี้ถูกใช้แล้ว')
    const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
    await service.startGame(room.roomId, teacherUid, snapshot)
    await expect(service.joinRoom({ roomId: room.roomId, nickname: 'คนใหม่' }, 'owner-3')).rejects.toThrow('เกมเริ่มแล้ว')
  })

  it('stores balanced role assignments and shows role-draw before question one', async () => {
    const { service, roomId } = await setupRoleDraw(17)
    const room = currentRoom(service, roomId)
    const players = currentPlayers(service, roomId)
    expect(room).toMatchObject({ status: 'role-draw', currentQuestionNumber: 0, gameCycle: 0, lockedPlayerCount: 17 })
    expect(room.roleRotation).toHaveLength(8)
    expect(hasBalancedLockedRoles(players)).toBe(true)
    expect(players.every((player) => player.roleHistory.length === 1 && player.roleOffset !== null)).toBe(true)
    expect(currentQuestions(service, roomId)).toHaveLength(80)
  })

  it('requires the teacher to start questions after role reveal', async () => {
    const { service, roomId, snapshot } = await setupRoleDraw(1)
    const player = currentPlayers(service, roomId)[0]
    if (!player?.roleId) throw new Error('missing role')
    const question = snapshot.trustedQuestions.find((item) => item.roleId === player.roleId && item.questionNumber === 1)
    if (!question) throw new Error('missing question')
    await expect(service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.integrityChoiceId)).rejects.toThrow('ปิดแล้ว')
    await service.beginQuestions(roomId, teacherUid)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'playing', currentQuestionNumber: 1 })
  })

  it('restores the exact role and role history during role-draw', async () => {
    const { service, roomId } = await setupRoleDraw(8)
    const before = currentPlayers(service, roomId)
    const refreshed = new DemoClassroomGameService()
    const after = currentPlayers(refreshed, roomId)
    expect(after.map(({ playerId, roleId, roleHistory, roleOffset }) => ({ playerId, roleId, roleHistory, roleOffset })))
      .toEqual(before.map(({ playerId, roleId, roleHistory, roleOffset }) => ({ playerId, roleId, roleHistory, roleOffset })))
    expect(currentRoom(refreshed, roomId).status).toBe('role-draw')
  })
})

describe('cycle-aware answers, rounds, and scoring', () => {
  it('accepts one answer per cycle and uses cycle-aware answer IDs', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    const player = currentPlayers(service, roomId)[0]
    if (!player?.roleId) throw new Error('missing role')
    const question = snapshot.trustedQuestions.find((item) => item.roleId === player.roleId && item.questionNumber === 1)
    if (!question) throw new Error('missing question')
    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.integrityChoiceId)
    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.corruptionChoiceId)
    const answers = currentAnswers(service, roomId)
    expect(answers).toHaveLength(1)
    expect(answers[0]).toMatchObject({ gameCycle: 0, answerId: `0::${player.playerId}::${question.questionId}` })
    expect(shouldCloseQuestion(1, 1, Date.now() + 10_000)).toBe(true)
  })

  it('uses cycle-aware round IDs and filters old answers from a new cycle', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    const firstPlayer = currentPlayers(service, roomId)[0]
    if (!firstPlayer?.roleId) throw new Error('missing role')
    const firstQuestion = snapshot.trustedQuestions.find((item) => item.roleId === firstPlayer.roleId && item.questionNumber === 1)
    if (!firstQuestion) throw new Error('missing question')
    await service.submitAnswer(roomId, firstPlayer.playerId, firstPlayer.ownerUid, 1, firstQuestion.questionId, firstQuestion.integrityChoiceId)
    await completeCurrentCycle(service, roomId, snapshot)
    await service.continueCityProgress(roomId, teacherUid)
    await service.beginQuestions(roomId, teacherUid)
    const secondPlayer = currentPlayers(service, roomId)[0]
    if (!secondPlayer?.roleId) throw new Error('missing second role')
    const secondQuestion = snapshot.trustedQuestions.find((item) => item.roleId === secondPlayer.roleId && item.questionNumber === 1)
    if (!secondQuestion) throw new Error('missing second question')
    await service.submitAnswer(roomId, secondPlayer.playerId, secondPlayer.ownerUid, 1, secondQuestion.questionId, secondQuestion.integrityChoiceId)
    const answers = currentAnswers(service, roomId)
    expect(answers.map((answer) => answer.gameCycle).sort()).toEqual([0, 1])
    expect(new Set(answers.map((answer) => answer.answerId)).size).toBe(2)
    const round = await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(round).toMatchObject({ gameCycle: 1, integrityCount: 1, corruptionCount: 0, timeoutCount: 0 })
    expect(currentRounds(service, roomId).filter((item) => item.questionNumber === 1).map((item) => item.gameCycle)).toEqual([0, 1])
  })

  it('keeps timeout -20 and accumulates totals across rounds', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    const round = await service.closeQuestion(roomId, teacherUid, snapshot)
    const room = currentRoom(service, roomId)
    expect(round).toMatchObject({ timeoutCount: 8, roundTotal: -160, roundAverage: -20, newCityScore: 480 })
    expect(room).toMatchObject({ cityScore: 480, timeoutTotal: 8, integrityTotal: 0, corruptionTotal: 0 })
    expect(round.locationSummaries.school).toMatchObject({ participantCount: 2, timeoutCount: 2 })
  })

  it('waits at round-result until the teacher opens Next', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'round-result', currentQuestionNumber: 1 })
    await service.openNextQuestion(roomId, teacherUid)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'playing', currentQuestionNumber: 2 })
  })
})

describe('continue in the same room', () => {
  it('keeps room, players, score, city level, and totals while advancing the cycle', async () => {
    const { service, roomId, snapshot } = await setupPlaying(2)
    await completeCurrentCycle(service, roomId, snapshot)
    const before = currentRoom(service, roomId)
    const playerIds = currentPlayers(service, roomId).map((player) => player.playerId)
    const questionCount = currentQuestions(service, roomId).length
    const continued = await service.continueCityProgress(roomId, teacherUid)
    expect(continued.roomId).toBe(roomId)
    expect(currentPlayers(service, roomId).map((player) => player.playerId)).toEqual(playerIds)
    expect(continued).toMatchObject({ gameCycle: 1, completedGameCount: 1, status: 'role-draw', currentQuestionNumber: 0 })
    expect(continued.cityScore).toBe(before.cityScore)
    expect(continued.cityLevel).toBe(before.cityLevel)
    expect(continued.timeoutTotal).toBe(before.timeoutTotal)
    expect(currentQuestions(service, roomId)).toHaveLength(questionCount)
  })

  it('assigns a new balanced role not present in each player history', async () => {
    const { service, roomId, snapshot } = await setupPlaying(17)
    const firstRoles = new Map(currentPlayers(service, roomId).map((player) => [player.playerId, player.roleId]))
    await completeCurrentCycle(service, roomId, snapshot)
    await service.continueCityProgress(roomId, teacherUid)
    const players = currentPlayers(service, roomId)
    expect(hasBalancedLockedRoles(players)).toBe(true)
    for (const player of players) {
      expect(player.roleId).not.toBe(firstRoles.get(player.playerId))
      expect(player.roleHistory).toHaveLength(2)
      expect(new Set(player.roleHistory).size).toBe(2)
    }
  })

  it('gives every player all eight roles exactly once and disables a ninth cycle', async () => {
    const { service, roomId, snapshot } = await setupPlaying(9)
    for (let cycle = 0; cycle < MAX_GAME_CYCLES; cycle += 1) {
      const players = currentPlayers(service, roomId)
      expect(hasBalancedLockedRoles(players)).toBe(true)
      expect(players.every((player) => player.roleHistory.length === cycle + 1 && new Set(player.roleHistory).size === cycle + 1)).toBe(true)
      await completeCurrentCycle(service, roomId, snapshot)
      if (cycle < MAX_GAME_CYCLES - 1) {
        await service.continueCityProgress(roomId, teacherUid)
        const restored = new DemoClassroomGameService()
        expect(currentRoom(restored, roomId)).toMatchObject({ gameCycle: cycle + 1, status: 'role-draw', currentQuestionNumber: 0 })
        expect(currentPlayers(restored, roomId).map((player) => player.roleId)).toEqual(currentPlayers(service, roomId).map((player) => player.roleId))
        await service.beginQuestions(roomId, teacherUid)
      }
    }
    const finalPlayers = currentPlayers(service, roomId)
    expect(finalPlayers.every((player) => player.roleHistory.length === 8 && new Set(player.roleHistory).size === 8)).toBe(true)
    expect(currentRoom(service, roomId)).toMatchObject({ gameCycle: 7, completedGameCount: 8, status: 'game-result' })
    await expect(service.continueCityProgress(roomId, teacherUid)).rejects.toThrow('ครบทั้ง 8 อาชีพ')
  })

  it('starts a separate new room at 500 with no carried role history', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    await completeCurrentCycle(service, roomId, snapshot)
    const newRoom = await service.createRoom(teacherUid, 30)
    const newPlayer = await service.joinRoom({ roomId: newRoom.roomId, nickname: 'ผู้เล่นใหม่' }, 'new-owner')
    expect(newRoom.roomId).not.toBe(roomId)
    expect(newRoom).toMatchObject({ cityScore: 500, gameCycle: 0, completedGameCount: 0, integrityTotal: 0, corruptionTotal: 0, timeoutTotal: 0 })
    expect(newPlayer).toMatchObject({ roleHistory: [], roleOffset: null, roleId: null })
  })
})
