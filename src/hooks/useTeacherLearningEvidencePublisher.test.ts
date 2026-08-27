import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { DemoClassroomGameService, resetDemoClassroomStateForTests, setRoomFieldsForTests } from '../services/demoClassroomService'
import type { ClassroomAssessmentRecord, ClassroomRoom } from '../types/classroomGame'
import { publishTeacherLearningEvidenceSnapshot } from './useTeacherLearningEvidencePublisher'

const teacherUid = 'teacher-lifecycle'
const responses = (score: number): number[] => Array(10).fill(score)

const readRoom = (service: DemoClassroomGameService, roomId: string): ClassroomRoom => {
  let current: ClassroomRoom | null = null
  const unsubscribe = service.subscribeRoom(roomId, (room) => { current = room }, () => undefined)
  unsubscribe()
  if (!current) throw new Error('room not found')
  return current
}

beforeEach(() => resetDemoClassroomStateForTests())

describe('teacher learning-evidence publication before ResultPage', () => {
  it('persists PRE/POST/Reflection before finish and remains publicly readable after the teacher session disappears', async () => {
    const service = new DemoClassroomGameService()
    const room = await service.createRoom(teacherUid, 30)
    const player = await service.joinRoom({
      roomId: room.roomId,
      nickname: 'ผู้เรียน',
      classSection: '1/1',
      studentNumber: 1,
    }, 'student-owner')
    setRoomFieldsForTests(room.roomId, { lockedPlayerCount: 1 })

    const publishCurrentSnapshot = async (): Promise<void> => {
      let records: ClassroomAssessmentRecord[] = []
      const unsubscribe = service.subscribeAssessmentEvidence(
        room.roomId,
        (nextRecords) => { records = nextRecords },
        () => undefined,
      )
      unsubscribe()
      await publishTeacherLearningEvidenceSnapshot(
        readRoom(service, room.roomId),
        records,
        (evidence) => service.publishLearningEvidence(room.roomId, teacherUid, evidence),
      )
    }

    await service.submitPreAssessment(room.roomId, player.playerId, 'student-owner', responses(2))
    await publishCurrentSnapshot()
    await service.submitPostAssessment(room.roomId, player.playerId, 'student-owner', responses(4))
    await publishCurrentSnapshot()
    await service.submitReflection(room.roomId, player.playerId, 'student-owner', {
      r1: 'คำตอบสะท้อนหนึ่ง',
      r2: 'คำตอบสะท้อนสอง',
      r3: 'คำตอบสะท้อนสาม',
    })
    await publishCurrentSnapshot()

    const beforeResultMount = readRoom(service, room.roomId).publicLearningEvidence
    expect(beforeResultMount).toMatchObject({
      participantCount: 1,
      preCompleteCount: 1,
      postCompleteCount: 1,
      matchedCount: 1,
      preMean: 2,
      postMean: 4,
      meanGainFivePoint: 2,
      reflectionCompleteCount: 1,
      observation: null,
    })

    setRoomFieldsForTests(room.roomId, { status: 'game-result' })
    await service.endActivity(room.roomId, teacherUid)
    const teacherSession: string | null = null
    expect(teacherSession).toBeNull()

    const publicRoom = readRoom(service, room.roomId)
    expect(publicRoom.status).toBe('finished')
    expect(publicRoom.publicLearningEvidence).toEqual(beforeResultMount)
    expect(JSON.stringify(publicRoom.publicLearningEvidence)).not.toMatch(/ผู้เรียน|student-owner|คำตอบสะท้อน/)
  })

  it('is mounted in TeacherPage and does not require ResultPage to perform the first publication', () => {
    const teacherPage = readFileSync(new URL('../pages/TeacherPage.tsx', import.meta.url), 'utf8')
    const resultPage = readFileSync(new URL('../pages/ResultPage.tsx', import.meta.url), 'utf8')

    expect(teacherPage).toContain('useTeacherLearningEvidencePublisher(')
    expect(teacherPage).not.toContain("room?.status === 'finished' && isTeacher")
    expect(resultPage).not.toContain('service.publishLearningEvidence(')
  })
})
