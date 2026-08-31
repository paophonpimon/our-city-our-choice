import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClassroomPublicLearningEvidence, ClassroomRoom } from '../types/classroomGame'
import { FinishedLearningEvidenceSection } from './FinishedLearningEvidenceSection'

const room: ClassroomRoom = {
  roomId: '8283',
  teacherSessionId: 'private-teacher',
  status: 'finished',
  gameCycle: 0,
  completedGameCount: 1,
  currentQuestionNumber: 10,
  currentCrisisEventIndex: 2,
  currentCrisisEventId: null,
  questionDurationSec: 45,
  questionStartedAt: null,
  questionDeadlineAt: null,
  lockedPlayerCount: 32,
  cityScore: 420,
  cityLevel: 'neutral',
  integrityTotal: 202,
  corruptionTotal: 182,
  timeoutTotal: 0,
  roleRotation: ['student', 'teacher', 'journalist', 'police', 'merchant', 'doctor', 'municipal', 'contractor'],
  preAssessmentOpened: true,
  createdAt: 1,
  updatedAt: 2,
}

const evidence: ClassroomPublicLearningEvidence = {
  schemaVersion: 1,
  participantCount: 32,
  preCompleteCount: 30,
  postCompleteCount: 28,
  matchedCount: 27,
  preMean: 2.88,
  postMean: 3.38,
  meanGainFivePoint: 0.5,
  improvedCount: 20,
  unchangedCount: 4,
  decreasedCount: 3,
  improvedPercent: 20 / 27 * 100,
  unchangedPercent: 4 / 27 * 100,
  decreasedPercent: 3 / 27 * 100,
  reflectionCompleteCount: 26,
  reflectionCompletionPercent: 26 / 32 * 100,
  observation: { o1: 3, o2: 4, o3: 3, o4: 4, mean: 3.5 },
}

describe('FinishedLearningEvidenceSection', () => {
  it('renders matched-only PRE, POST, five-point gain, classifications, and matched denominators', () => {
    const markup = renderToStaticMarkup(<FinishedLearningEvidenceSection evidence={evidence} room={room} />)
    expect(markup).toContain('30 / 32')
    expect(markup).toContain('28 / 32')
    expect(markup).toContain('27 คน')
    expect(markup).toContain('2.88')
    expect(markup).toContain('3.38')
    expect(markup).toContain('+0.50')
    expect(markup).toContain('74.1% ของผู้ที่จับคู่ได้ N=27')
    expect(markup).toContain('14.8% ของผู้ที่จับคู่ได้ N=27')
    expect(markup).toContain('11.1% ของผู้ที่จับคู่ได้ N=27')
    expect(markup).not.toMatch(/\/\s*50|10[–-]50|คะแนนรวมเฉลี่ย/)
  })

  it('renders missing measurements as unavailable rather than fake zero', () => {
    const missing: ClassroomPublicLearningEvidence = {
      ...evidence,
      matchedCount: 0,
      preMean: null,
      postMean: null,
      meanGainFivePoint: null,
      improvedCount: 0,
      unchangedCount: 0,
      decreasedCount: 0,
      improvedPercent: null,
      unchangedPercent: null,
      decreasedPercent: null,
      observation: null,
    }
    const markup = renderToStaticMarkup(<FinishedLearningEvidenceSection evidence={missing} room={room} />)
    expect(markup).toContain('ยังไม่มีข้อมูลเพียงพอ')
    expect(markup).toContain('ยังไม่มีหลักฐานการสังเกตของครู')
    expect(markup).not.toContain('0.00 <small>/ 5</small>')
    expect(markup).not.toContain('0.00 / 4')
  })

  it('renders current Observation 1-4 and qualitative Reflection completion only', () => {
    const markup = renderToStaticMarkup(<FinishedLearningEvidenceSection evidence={evidence} room={room} />)
    expect(markup).toContain('การใช้เหตุผล')
    expect(markup).toContain('การคำนึงถึงประโยชน์ส่วนรวม')
    expect(markup).toContain('การเคารพกติกาและขั้นตอน')
    expect(markup).toContain('การรับฟังและทำงานร่วมกับผู้อื่น')
    expect(markup).toContain('3.50 / 4')
    expect(markup).toContain('26 / 32')
    expect(markup).toContain('81.3%')
    expect(markup).toContain('ไม่แปลงเป็นคะแนน')
  })

  it('reconciles the 12 decision opportunities from room-level values', () => {
    const markup = renderToStaticMarkup(<FinishedLearningEvidenceSection evidence={evidence} room={room} />)
    expect(markup).toContain('32 × 12 × 1 = <strong>384</strong>')
    expect(markup).toContain('202 + 182 + 0 = <strong>384</strong> ✓ ตรงกัน')
    expect(markup).toContain('ข้อมูลเกมแยกจากคะแนนประเมินก่อน–หลัง (PRE–POST)')
  })

  it('renders no identity, raw-response, ownership, or private-note fields', () => {
    const markup = renderToStaticMarkup(<FinishedLearningEvidenceSection evidence={evidence} room={room} />)
    expect(markup).not.toMatch(/nickname|classSection|studentNumber|playerId|ownerUid|teacherSessionId|responses|notes/)
    expect(markup).not.toContain('private-teacher')
  })
})
