import { beforeEach, describe, expect, it } from 'vitest'
import { createRoomQuestionSnapshot } from '../domain/classroomQuestions'
import type { BuildingLevels } from '../domain/cityBuildings'
import { hasBalancedLockedRoles, shouldCloseQuestion } from '../domain/classroomGameLoop'
import { MAX_GAME_CYCLES } from '../domain/ourCity'
import { createTrustedQuestions } from '../test/classroomFixtures'
import type {
  ClassSection,
  ClassroomAnswerRecord,
  ClassroomPlayer,
  ClassroomRoom,
  ClassroomRoundResult,
  ClassroomCrisisResult,
  PublicRoomQuestion,
} from '../types/classroomGame'
import { isQuestionAnswerRecord } from '../types/classroomGame'
import { DemoClassroomGameService, resetDemoClassroomStateForTests, setRoomFieldsForTests } from './demoClassroomService'

const teacherUid = 'teacher-uid'

const joinInput = (roomId: string, nickname: string, studentNumber = 1, classSection: ClassSection = '1/1') => ({
  roomId,
  nickname,
  classSection,
  studentNumber,
})

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

const currentCrisisResults = (service: DemoClassroomGameService, roomId: string): ClassroomCrisisResult[] => {
  let value: ClassroomCrisisResult[] = []
  const unsubscribe = service.subscribeCrisisResults(roomId, (results) => { value = results }, () => undefined)
  unsubscribe()
  return value
}

const setupRoleDraw = async (playerCount = 8, duration = 30) => {
  const service = new DemoClassroomGameService()
  const room = await service.createRoom(teacherUid, duration)
  for (let index = 0; index < playerCount; index += 1) {
    await service.joinRoom(joinInput(room.roomId, `Player ${index + 1}`, index + 1), `owner-${index + 1}`)
  }
  const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
  await service.openPreAssessment(room.roomId, teacherUid)
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
    if (questionNumber < 10) {
      const next = await service.openNextQuestion(roomId, teacherUid)
      if (next.status === 'crisis-intro') {
        await service.beginCrisisEvent(roomId, teacherUid)
        await service.closeCrisisEvent(roomId, teacherUid)
        await service.openNextQuestion(roomId, teacherUid)
      }
    }
  }
  await service.finishGame(roomId, teacherUid)
}

beforeEach(() => resetDemoClassroomStateForTests())

describe('room code generation', () => {
  it('creates a 4-character code from the unambiguous alphabet only', async () => {
    const service = new DemoClassroomGameService()
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const room = await service.createRoom(`${teacherUid}-${attempt}`, 30)
      expect(room.roomId).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
    }
  })

  it('never generates a duplicate code across many rooms', async () => {
    const service = new DemoClassroomGameService()
    const roomIds = await Promise.all(
      Array.from({ length: 25 }, (_, index) => service.createRoom(`${teacherUid}-${index}`, 30)),
    )
    expect(new Set(roomIds.map((room) => room.roomId)).size).toBe(roomIds.length)
  })
})

describe('Continue City Progress setup and role draw', () => {
  it('creates a new room with fresh city progress and empty role history', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'น้ำ', 12, '1/2'), 'owner-1')
    expect(room).toMatchObject({
      status: 'lobby',
      gameCycle: 0,
      completedGameCount: 0,
      currentQuestionNumber: 0,
      cityScore: 500,
      buildingLevels: {
        municipality: 0,
        hospital: 0,
        police: 0,
        construction: 0,
        market: 0,
        school: 0,
        newsAgency: 0,
      },
      buildingScores: {
        municipality: 500,
        hospital: 500,
        police: 500,
        construction: 500,
        market: 500,
        school: 500,
        newsAgency: 500,
      },
    })
    expect(room).toMatchObject({ integrityTotal: 0, corruptionTotal: 0, timeoutTotal: 0 })
    expect(player).toMatchObject({ classSection: '1/2', studentNumber: 12, roleId: null, roleHistory: [], roleOffset: null })
  })

  it('rejects duplicate names and blocks new joins after the first role draw', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.joinRoom(joinInput(room.roomId, 'น้ำ'), 'owner-1')
    await expect(service.joinRoom(joinInput(room.roomId, 'น้ำ'), 'owner-2')).rejects.toThrow('ชื่อนี้ถูกใช้แล้ว')
    const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
    await service.openPreAssessment(room.roomId, teacherUid)
    await service.startGame(room.roomId, teacherUid, snapshot)
    await expect(service.joinRoom(joinInput(room.roomId, 'คนใหม่'), 'owner-3')).rejects.toThrow('เกมเริ่มแล้ว')
  })

  it('lets the teacher terminate a lobby and blocks the old room from being reused', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.joinRoom(joinInput(room.roomId, 'Player one'), 'owner-1')

    await service.endActivity(room.roomId, teacherUid)

    expect(currentRoom(service, room.roomId).status).toBe('finished')
    await expect(service.joinRoom(joinInput(room.roomId, 'Player two', 2), 'owner-2')).rejects.toThrow('ห้องนี้ถูกยุติแล้ว')
    await expect(service.endActivity(room.roomId, teacherUid)).rejects.toThrow('ห้องนี้ถูกยุติแล้ว')
    const replacement = await service.createRoom(teacherUid, 30)
    expect(replacement.roomId).not.toBe(room.roomId)
    expect(replacement.status).toBe('lobby')
  })

  it('requires a positive student number and orders the teacher roster by student number', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await expect(service.joinRoom(joinInput(room.roomId, 'เลขที่ไม่ถูกต้อง', 0), 'owner-0')).rejects.toThrow('จำนวนเต็มบวก')
    await service.joinRoom(joinInput(room.roomId, 'คนเลขที่สิบสอง', 12, '1/1'), 'owner-12')
    await service.joinRoom(joinInput(room.roomId, 'คนเลขที่สามห้องสาม', 3, '1/3'), 'owner-3-3')
    await service.joinRoom(joinInput(room.roomId, 'คนเลขที่สามห้องหนึ่ง', 3, '1/1'), 'owner-3-1')
    expect(currentPlayers(service, room.roomId).map((player) => [player.studentNumber, player.classSection, player.nickname])).toEqual([
      [3, '1/1', 'คนเลขที่สามห้องหนึ่ง'],
      [3, '1/3', 'คนเลขที่สามห้องสาม'],
      [12, '1/1', 'คนเลขที่สิบสอง'],
    ])
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

const currentPreAssessment = (service: DemoClassroomGameService, roomId: string, playerId: string) => {
  let value: unknown = undefined
  const unsubscribe = service.subscribePreAssessment(roomId, playerId, (assessment) => { value = assessment }, () => undefined)
  unsubscribe()
  return value as { responses: number[]; ownerUid: string; playerId: string; roomId: string } | null
}

const VALID_PRE_RESPONSES = [5, 4, 3, 5, 4, 3, 5, 4, 3, 5]

describe('PRE assessment (isolated from the game engine)', () => {
  it('is null before any submission, then returns exactly what was submitted', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนพรี'), 'owner-pre')

    expect(currentPreAssessment(service, room.roomId, player.playerId)).toBeNull()

    await service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', VALID_PRE_RESPONSES)

    const stored = currentPreAssessment(service, room.roomId, player.playerId)
    expect(stored?.responses).toEqual(VALID_PRE_RESPONSES)
    expect(stored?.ownerUid).toBe('owner-pre')
    expect(stored?.playerId).toBe(player.playerId)
    expect(stored?.roomId).toBe(room.roomId)
  })

  it('never overwrites an existing submission - a resubmit with different answers is a silent no-op', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนพรี'), 'owner-pre')

    await service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', VALID_PRE_RESPONSES)
    await service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1])

    expect(currentPreAssessment(service, room.roomId, player.playerId)?.responses).toEqual(VALID_PRE_RESPONSES)
  })

  it('rejects anything other than exactly 10 integer responses from 1-5', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนพรี'), 'owner-pre')

    await expect(service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', [1, 2, 3])).rejects.toThrow('10 ข้อ')
    await expect(service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', [0, 2, 3, 4, 5, 1, 2, 3, 4, 5])).rejects.toThrow('10 ข้อ')
    expect(currentPreAssessment(service, room.roomId, player.playerId)).toBeNull()
  })

  it('rejects submission from someone who is not that player\'s owner', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนพรี'), 'owner-pre')

    await expect(service.submitPreAssessment(room.roomId, player.playerId, 'someone-else', VALID_PRE_RESPONSES)).rejects.toThrow('ไม่พบผู้เล่นของคุณ')
  })

  it('still succeeds after the teacher has advanced the room past lobby - PRE never depends on room status', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนพรี'), 'owner-pre')

    const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)
    await service.openPreAssessment(room.roomId, teacherUid)
    await service.startGame(room.roomId, teacherUid, snapshot)
    await service.beginQuestions(room.roomId, teacherUid)
    expect(currentRoom(service, room.roomId).status).toBe('playing')

    // The student was still mid-PRE when the teacher moved the room on -
    // submission must not be blocked by the room's current status.
    await expect(service.submitPreAssessment(room.roomId, player.playerId, 'owner-pre', VALID_PRE_RESPONSES)).resolves.toBeUndefined()
    expect(currentPreAssessment(service, room.roomId, player.playerId)?.responses).toEqual(VALID_PRE_RESPONSES)
  })
})

const currentAssessments = (service: DemoClassroomGameService, roomId: string) => {
  let value: unknown[] = []
  const unsubscribe = service.subscribeAssessments(roomId, (assessments) => { value = assessments }, () => undefined)
  unsubscribe()
  return value as { playerId: string }[]
}

describe('openPreAssessment — teacher-controlled, one-way false -> true gate', () => {
  it('defaults a newly created room to preAssessmentOpened: false', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    expect(room.preAssessmentOpened).toBe(false)
    expect(currentRoom(service, room.roomId).preAssessmentOpened).toBe(false)
  })

  it('lets the teacher open PRE while the room is still in lobby', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.openPreAssessment(room.roomId, teacherUid)
    expect(currentRoom(service, room.roomId).preAssessmentOpened).toBe(true)
  })

  it('is idempotent - opening an already-open room is a safe no-op', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.openPreAssessment(room.roomId, teacherUid)
    await expect(service.openPreAssessment(room.roomId, teacherUid)).resolves.toBeUndefined()
    expect(currentRoom(service, room.roomId).preAssessmentOpened).toBe(true)
  })

  it('rejects a non-teacher trying to open PRE', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await expect(service.openPreAssessment(room.roomId, 'not-the-teacher')).rejects.toThrow()
    expect(currentRoom(service, room.roomId).preAssessmentOpened).toBe(false)
  })

  it('rejects opening PRE once the room has left lobby', async () => {
    const { service, roomId } = await setupRoleDraw(1)
    await expect(service.openPreAssessment(roomId, teacherUid)).rejects.toThrow('ตอนอยู่ในห้องรอเท่านั้น')
  })

  it('blocks startGame until PRE has been opened, and allows it once opened', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    await service.joinRoom(joinInput(room.roomId, 'นักเรียน'), 'owner-1')
    const snapshot = createRoomQuestionSnapshot(room.roomId, createTrustedQuestions(), 100)

    await expect(service.startGame(room.roomId, teacherUid, snapshot)).rejects.toThrow('กรุณาเปิดแบบประเมินก่อนกิจกรรมก่อนเริ่มเกม')

    await service.openPreAssessment(room.roomId, teacherUid)
    await expect(service.startGame(room.roomId, teacherUid, snapshot)).resolves.toBeUndefined()
    expect(currentRoom(service, room.roomId).status).toBe('role-draw')
  })

  it('subscribeAssessments reflects submitted PRE records for the room, matched by playerId', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const playerA = await service.joinRoom(joinInput(room.roomId, 'นักเรียนเอ'), 'owner-a')
    const playerB = await service.joinRoom(joinInput(room.roomId, 'นักเรียนบี', 2), 'owner-b')

    expect(currentAssessments(service, room.roomId)).toHaveLength(0)

    await service.submitPreAssessment(room.roomId, playerA.playerId, 'owner-a', VALID_PRE_RESPONSES)
    expect(currentAssessments(service, room.roomId).map((assessment) => assessment.playerId)).toEqual([playerA.playerId])

    await service.submitPreAssessment(room.roomId, playerB.playerId, 'owner-b', VALID_PRE_RESPONSES)
    expect(currentAssessments(service, room.roomId).map((assessment) => assessment.playerId).sort())
      .toEqual([playerA.playerId, playerB.playerId].sort())
  })
})

const currentPostAssessment = (service: DemoClassroomGameService, roomId: string, playerId: string) => {
  let value: unknown = undefined
  const unsubscribe = service.subscribePostAssessment(roomId, playerId, (assessment) => { value = assessment }, () => undefined)
  unsubscribe()
  return value as { responses: number[]; ownerUid: string; playerId: string; roomId: string } | null
}

const currentReflection = (service: DemoClassroomGameService, roomId: string, playerId: string) => {
  let value: unknown = undefined
  const unsubscribe = service.subscribeReflection(roomId, playerId, (reflection) => { value = reflection }, () => undefined)
  unsubscribe()
  return value as { r1: string; r2: string; r3: string; ownerUid: string; playerId: string; roomId: string } | null
}

const VALID_POST_RESPONSES = [4, 5, 3, 4, 5, 3, 4, 5, 3, 4]
const VALID_REFLECTION = { r1: 'สถานการณ์ที่ยากคือตอนตัดสินใจเรื่องงบประมาณ', r2: 'เข้าใจมากขึ้นว่าไม่ใช่แค่เรื่องของตัวเอง', r3: 'เคยเห็นเพื่อนแจ้งเรื่องทุจริตในโรงเรียน' }

describe('POST assessment (Phase B1, isolated from the game engine, same shape as PRE)', () => {
  it('is null before any submission, then returns exactly what was submitted', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนโพสต์'), 'owner-post')

    expect(currentPostAssessment(service, room.roomId, player.playerId)).toBeNull()

    await service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', VALID_POST_RESPONSES)

    const stored = currentPostAssessment(service, room.roomId, player.playerId)
    expect(stored?.responses).toEqual(VALID_POST_RESPONSES)
    expect(stored?.ownerUid).toBe('owner-post')
    expect(stored?.playerId).toBe(player.playerId)
    expect(stored?.roomId).toBe(room.roomId)
  })

  it('never overwrites an existing submission - a resubmit with different answers is a silent no-op', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนโพสต์'), 'owner-post')

    await service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', VALID_POST_RESPONSES)
    await service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1])

    expect(currentPostAssessment(service, room.roomId, player.playerId)?.responses).toEqual(VALID_POST_RESPONSES)
  })

  it('rejects anything other than exactly 10 integer responses from 1-5', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนโพสต์'), 'owner-post')

    await expect(service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', [1, 2, 3])).rejects.toThrow('10 ข้อ')
    await expect(service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', [0, 2, 3, 4, 5, 1, 2, 3, 4, 5])).rejects.toThrow('10 ข้อ')
    expect(currentPostAssessment(service, room.roomId, player.playerId)).toBeNull()
  })

  it('rejects submission from someone who is not that player\'s owner', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนโพสต์'), 'owner-post')

    await expect(service.submitPostAssessment(room.roomId, player.playerId, 'someone-else', VALID_POST_RESPONSES)).rejects.toThrow('ไม่พบผู้เล่นของคุณ')
    expect(currentPostAssessment(service, room.roomId, player.playerId)).toBeNull()
  })

  it('does not depend on room status - a room without PRE opened, or a legacy room, must not crash POST submission', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนโพสต์'), 'owner-post')

    // No openPreAssessment/startGame ever called - room stays 'lobby'. POST
    // must still be independently submittable (mirrors PRE's own
    // no-room-status-dependency guarantee).
    await expect(service.submitPostAssessment(room.roomId, player.playerId, 'owner-post', VALID_POST_RESPONSES)).resolves.toBeUndefined()
  })
})

describe('Reflection (Phase B1, R1-R3, unscored)', () => {
  it('is null before any submission, then returns exactly the original wording submitted - never rewritten', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนสะท้อน'), 'owner-reflect')

    expect(currentReflection(service, room.roomId, player.playerId)).toBeNull()

    const withPadding = { r1: '  มีช่องว่างรอบข้อความ  ', r2: VALID_REFLECTION.r2, r3: VALID_REFLECTION.r3 }
    await service.submitReflection(room.roomId, player.playerId, 'owner-reflect', withPadding)

    const stored = currentReflection(service, room.roomId, player.playerId)
    expect(stored?.r1).toBe(withPadding.r1) // stored byte-for-byte, not trimmed
    expect(stored?.r2).toBe(VALID_REFLECTION.r2)
    expect(stored?.r3).toBe(VALID_REFLECTION.r3)
    expect(stored?.ownerUid).toBe('owner-reflect')
  })

  it('never overwrites an existing submission - a resubmit is a silent no-op', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนสะท้อน'), 'owner-reflect')

    await service.submitReflection(room.roomId, player.playerId, 'owner-reflect', VALID_REFLECTION)
    await service.submitReflection(room.roomId, player.playerId, 'owner-reflect', { r1: 'คำตอบใหม่', r2: 'คำตอบใหม่', r3: 'คำตอบใหม่' })

    expect(currentReflection(service, room.roomId, player.playerId)).toMatchObject(VALID_REFLECTION)
  })

  it('rejects an empty or whitespace-only answer, and does not score/theme anything', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนสะท้อน'), 'owner-reflect')

    await expect(service.submitReflection(room.roomId, player.playerId, 'owner-reflect', { r1: '', r2: 'ตอบ', r3: 'ตอบ' })).rejects.toThrow('ครบถ้วน')
    await expect(service.submitReflection(room.roomId, player.playerId, 'owner-reflect', { r1: '   ', r2: 'ตอบ', r3: 'ตอบ' })).rejects.toThrow('ครบถ้วน')
    expect(currentReflection(service, room.roomId, player.playerId)).toBeNull()
  })

  it('rejects submission from someone who is not that player\'s owner', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียนสะท้อน'), 'owner-reflect')

    await expect(service.submitReflection(room.roomId, player.playerId, 'someone-else', VALID_REFLECTION)).rejects.toThrow('ไม่พบผู้เล่นของคุณ')
  })
})

describe('PRE roster subscription is not polluted by POST/Reflection records in the same assessments map', () => {
  it('subscribeAssessments (teacher PRE roster) only ever reports recordType pre, even after POST and Reflection are submitted for the same player', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom(joinInput(room.roomId, 'นักเรียน'), 'owner-1')

    await service.submitPreAssessment(room.roomId, player.playerId, 'owner-1', VALID_PRE_RESPONSES)
    expect(currentAssessments(service, room.roomId)).toHaveLength(1)

    await service.submitPostAssessment(room.roomId, player.playerId, 'owner-1', VALID_POST_RESPONSES)
    await service.submitReflection(room.roomId, player.playerId, 'owner-1', VALID_REFLECTION)

    // Still exactly the one PRE record - POST/Reflection must never be
    // miscounted as PRE completion on the teacher's roster.
    const roster = currentAssessments(service, room.roomId)
    expect(roster).toHaveLength(1)
    expect(roster[0]?.playerId).toBe(player.playerId)
  })
})

describe('cycle-aware answers, rounds, and scoring', () => {
  it('does not let a question N answer disable question N+1', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    const player = currentPlayers(service, roomId)[0]
    if (!player?.roleId) throw new Error('missing role')
    const question1 = snapshot.trustedQuestions.find((item) => item.roleId === player.roleId && item.questionNumber === 1)
    const question2 = snapshot.trustedQuestions.find((item) => item.roleId === player.roleId && item.questionNumber === 2)
    if (!question1 || !question2) throw new Error('missing question')

    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question1.questionId, question1.integrityChoiceId)
    await service.closeQuestion(roomId, teacherUid, snapshot)
    await service.openNextQuestion(roomId, teacherUid)
    await expect(service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question1.questionId, question1.integrityChoiceId)).rejects.toThrow('ปิดแล้ว')
    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 2, question2.questionId, question2.integrityChoiceId)

    expect(currentAnswers(service, roomId).filter(isQuestionAnswerRecord).map((answer) => answer.questionNumber)).toEqual([1, 2])
  })

  it('keeps authoritatively open normal and crisis decisions answerable despite a skewed client clock', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1, 1)
    const player = currentPlayers(service, roomId)[0]
    if (!player?.roleId) throw new Error('missing role')
    const question = snapshot.trustedQuestions.find((item) => item.roleId === player.roleId && item.questionNumber === 1)
    if (!question) throw new Error('missing question')
    setRoomFieldsForTests(roomId, { questionDeadlineAt: Date.now() - 60_000 })
    await service.submitAnswer(roomId, player.playerId, player.ownerUid, 1, question.questionId, question.integrityChoiceId)

    for (let questionNumber = 1; questionNumber <= 4; questionNumber += 1) {
      await service.closeQuestion(roomId, teacherUid, snapshot)
      if (questionNumber < 4) await service.openNextQuestion(roomId, teacherUid)
    }
    await service.openNextQuestion(roomId, teacherUid)
    await service.beginCrisisEvent(roomId, teacherUid)
    setRoomFieldsForTests(roomId, { questionDeadlineAt: Date.now() - 60_000 })
    await service.submitCrisisAnswer(roomId, player.playerId, player.ownerUid, `construction-audit:${player.roleId}:integrity`)

    expect(currentAnswers(service, roomId).some((answer) => answer.recordType === 'crisis')).toBe(true)
  })

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
    // Building score starts at 500 and moves by locationSummary.scoreAverage (-20 here), landing
    // at 480 which is still within the 400-599 (Level 0) band, unlike the old always-step-one-level
    // behavior. buildingScores are asserted separately below.
    expect(room.buildingLevels).toEqual({
      municipality: 0,
      hospital: 0,
      police: 0,
      construction: 0,
      market: 0,
      school: 0,
      newsAgency: 0,
    })
    expect(room.buildingScores).toEqual({
      municipality: 480,
      hospital: 480,
      police: 480,
      construction: 480,
      market: 480,
      school: 480,
      newsAgency: 480,
    })
    expect(round.locationSummaries.school).toMatchObject({ participantCount: 2, timeoutCount: 2 })
  })

  it('waits at round-result until the teacher opens Next', async () => {
    const { service, roomId, snapshot } = await setupPlaying(1)
    await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'round-result', currentQuestionNumber: 1 })
    await service.openNextQuestion(roomId, teacherUid)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'playing', currentQuestionNumber: 2 })
  })

  it('inserts a real crisis after question 4 and finalizes it exactly once', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    for (let question = 1; question <= 4; question += 1) {
      await service.closeQuestion(roomId, teacherUid, snapshot)
      if (question < 4) await service.openNextQuestion(roomId, teacherUid)
    }
    const intro = await service.openNextQuestion(roomId, teacherUid)
    expect(intro).toMatchObject({ status: 'crisis-intro', currentQuestionNumber: 4, currentCrisisEventIndex: 1, currentCrisisEventId: 'construction-audit' })
    await service.beginCrisisEvent(roomId, teacherUid)
    for (const player of currentPlayers(service, roomId)) {
      if (!player.roleId) throw new Error('missing role')
      await service.submitCrisisAnswer(roomId, player.playerId, player.ownerUid, `construction-audit:${player.roleId}:integrity`)
    }
    const first = await service.closeCrisisEvent(roomId, teacherUid)
    const second = await service.closeCrisisEvent(roomId, teacherUid)
    expect(first).toMatchObject({ integrityCount: 8, eventAverage: 100, previousCityScore: 420, newCityScore: 520 })
    expect(second).toEqual(first)
    expect(currentCrisisResults(service, roomId)).toHaveLength(1)
    // 4 normal rounds of all-timeout (-20 each) bring every buildingScore to 420, then the crisis's
    // doubled integrity impact (+100, already x2 — not doubled again) brings it to 520: still Level 0.
    expect(currentRoom(service, roomId).buildingScores).toEqual({ municipality: 520, hospital: 520, police: 520, construction: 520, market: 520, school: 520, newsAgency: 520 })
    expect(currentRoom(service, roomId).buildingLevels).toEqual({ municipality: 0, hospital: 0, police: 0, construction: 0, market: 0, school: 0, newsAgency: 0 })
    await service.openNextQuestion(roomId, teacherUid)
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'playing', currentQuestionNumber: 5, currentCrisisEventIndex: 0, currentCrisisEventId: null })
  })

  it('restores an in-progress crisis after refresh without changing the normal question number', async () => {
    const { service, roomId, snapshot } = await setupPlaying(2)
    for (let question = 1; question <= 4; question += 1) {
      await service.closeQuestion(roomId, teacherUid, snapshot)
      if (question < 4) await service.openNextQuestion(roomId, teacherUid)
    }
    await service.openNextQuestion(roomId, teacherUid)
    await service.beginCrisisEvent(roomId, teacherUid)
    const refreshed = new DemoClassroomGameService()
    expect(currentRoom(refreshed, roomId)).toMatchObject({ status: 'crisis-playing', currentQuestionNumber: 4, currentCrisisEventIndex: 1 })
    await refreshed.closeCrisisEvent(roomId, teacherUid)
    expect(currentCrisisResults(refreshed, roomId)).toHaveLength(1)
  })

  it('runs 10 normal rounds plus both crisis events before the final result', async () => {
    const { service, roomId, snapshot } = await setupPlaying(3)
    await completeCurrentCycle(service, roomId, snapshot)
    expect(currentRounds(service, roomId)).toHaveLength(10)
    expect(currentCrisisResults(service, roomId).map((result) => result.eventIndex)).toEqual([1, 2])
    expect(currentRoom(service, roomId)).toMatchObject({ status: 'game-result', currentQuestionNumber: 10, completedGameCount: 1 })
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
    expect(continued).toMatchObject({ gameCycle: 1, completedGameCount: 1, status: 'role-draw', currentQuestionNumber: 0, currentCrisisEventIndex: 0, currentCrisisEventId: null })
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
    const newPlayer = await service.joinRoom(joinInput(newRoom.roomId, 'ผู้เล่นใหม่'), 'new-owner')
    expect(newRoom.roomId).not.toBe(roomId)
    expect(newRoom).toMatchObject({ cityScore: 500, gameCycle: 0, completedGameCount: 0, integrityTotal: 0, corruptionTotal: 0, timeoutTotal: 0 })
    expect(newPlayer).toMatchObject({ roleHistory: [], roleOffset: null, roleId: null })
  })

  it('does not restore finished room progress into a replacement room', async () => {
    const service = new DemoClassroomGameService()
    const oldRoom = await service.createRoom(teacherUid, 30)
    setRoomFieldsForTests(oldRoom.roomId, {
      cityScore: 100,
      buildingLevels: { municipality: -2, hospital: -2, police: -2, construction: -2, market: -2, school: -2, newsAgency: -2 },
      buildingScores: { municipality: 100, hospital: 100, police: 100, construction: 100, market: 100, school: 100, newsAgency: 100 },
    })
    await service.endActivity(oldRoom.roomId, teacherUid)

    const reopened = new DemoClassroomGameService()
    const replacement = await reopened.createRoom(teacherUid, 30)
    expect(currentRoom(reopened, oldRoom.roomId).status).toBe('finished')
    expect(replacement.roomId).not.toBe(oldRoom.roomId)
    expect(replacement).toMatchObject({ cityScore: 500, gameCycle: 0, currentQuestionNumber: 0, status: 'lobby' })
    expect(replacement.buildingLevels).toEqual({ municipality: 0, hospital: 0, police: 0, construction: 0, market: 0, school: 0, newsAgency: 0 })
    expect(currentPlayers(reopened, replacement.roomId)).toEqual([])
    expect(currentRounds(reopened, replacement.roomId)).toEqual([])
  })

  it('preserves buildingScores across continueCityProgress into the next cycle', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    await completeCurrentCycle(service, roomId, snapshot)
    const beforeScores = currentRoom(service, roomId).buildingScores
    const continued = await service.continueCityProgress(roomId, teacherUid)
    expect(continued.buildingScores).toEqual(beforeScores)
    expect(currentRoom(service, roomId).buildingScores).toEqual(beforeScores)
  })
})

describe('persistent building scores', () => {
  it('cityScore and buildingScores move independently from the same round', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    const round = await service.closeQuestion(roomId, teacherUid, snapshot)
    const room = currentRoom(service, roomId)
    // Same round, two independent tallies: cityScore uses roundAverage over all players,
    // buildingScores use each location's own scoreAverage. Both happen to be -20 here because
    // every player timed out uniformly, but they are computed and stored separately.
    expect(round.roundAverage).toBe(-20)
    expect(room.cityScore).toBe(480)
    expect(room.buildingScores?.hospital).toBe(480)
  })

  it('averages teacher and student outcomes together under the shared school building score', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    const players = currentPlayers(service, roomId)
    const teacher = players.find((player) => player.roleId === 'teacher')
    const student = players.find((player) => player.roleId === 'student')
    if (!teacher || !student) throw new Error('missing teacher/student')
    const teacherQuestion = snapshot.trustedQuestions.find((question) => question.roleId === 'teacher' && question.questionNumber === 1)
    if (!teacherQuestion) throw new Error('missing question')
    // Teacher answers with integrity (+50); student leaves it as a timeout (-20).
    await service.submitAnswer(roomId, teacher.playerId, teacher.ownerUid, 1, teacherQuestion.questionId, teacherQuestion.integrityChoiceId)
    const round = await service.closeQuestion(roomId, teacherUid, snapshot)
    expect(round.locationSummaries.school).toMatchObject({ participantCount: 2, integrityCount: 1, timeoutCount: 1, scoreAverage: 15 })
    const room = currentRoom(service, roomId)
    expect(room.buildingScores?.school).toBe(515)
    // Every other building only had a single timeout participant, so its score differs from school's.
    expect(room.buildingScores?.hospital).toBe(480)
  })

  it('applies the crisis impact to buildingScores exactly once (already x2, never doubled again)', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    for (let question = 1; question <= 4; question += 1) {
      await service.closeQuestion(roomId, teacherUid, snapshot)
      if (question < 4) await service.openNextQuestion(roomId, teacherUid)
    }
    const beforeCrisis = currentRoom(service, roomId).buildingScores
    await service.openNextQuestion(roomId, teacherUid)
    await service.beginCrisisEvent(roomId, teacherUid)
    for (const player of currentPlayers(service, roomId)) {
      if (!player.roleId) throw new Error('missing role')
      await service.submitCrisisAnswer(roomId, player.playerId, player.ownerUid, `construction-audit:${player.roleId}:integrity`)
    }
    const result = await service.closeCrisisEvent(roomId, teacherUid)
    // CRISIS_SCORE_POLICY.integrity is already SCORE_POLICY.integrity * 2 (100); this must be
    // applied to buildingScores as-is, not multiplied by 2 again.
    expect(result.locationSummaries.hospital.scoreAverage).toBe(100)
    const after = currentRoom(service, roomId).buildingScores
    expect(after?.hospital).toBe((beforeCrisis?.hospital ?? 0) + 100)
  })
})

describe('backward compatibility with rooms created before buildingScores existed', () => {
  it('derives buildingScores from a legacy buildingLevels-only room the first time it is scored', async () => {
    const { service, roomId, snapshot } = await setupPlaying(8)
    // Simulate a room persisted before buildingScores existed: only buildingLevels is present,
    // as if the old level-stepping system had already nudged every building up once.
    const legacyLevels: BuildingLevels = { municipality: 1, hospital: 1, police: 1, construction: 1, market: 1, school: 1, newsAgency: 1 }
    setRoomFieldsForTests(roomId, { buildingLevels: legacyLevels, buildingScores: undefined })

    expect(currentRoom(service, roomId).buildingScores).toBeUndefined()

    await service.closeQuestion(roomId, teacherUid, snapshot)
    const room = currentRoom(service, roomId)
    // Legacy Level 1 derives an initial score of 700; this round's uniform timeout (-20) brings
    // it to 680, which is still within the Level 1 band (600-799).
    expect(room.buildingScores).toEqual({
      municipality: 680, hospital: 680, police: 680, construction: 680, market: 680, school: 680, newsAgency: 680,
    })
    expect(room.buildingLevels).toEqual({
      municipality: 1, hospital: 1, police: 1, construction: 1, market: 1, school: 1, newsAgency: 1,
    })
  })
})
