import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClassroomAssessmentRecord, ClassroomRoom } from '../types/classroomGame'
import { TeacherCompetitionEvidenceDashboard } from './TeacherCompetitionEvidenceDashboard'

const room: ClassroomRoom = {
  roomId: 'JUDGE1',
  teacherSessionId: 'private-teacher-session',
  status: 'finished',
  gameCycle: 0,
  completedGameCount: 1,
  currentQuestionNumber: 10,
  currentCrisisEventIndex: 2,
  currentCrisisEventId: null,
  questionDurationSec: 45,
  questionStartedAt: null,
  questionDeadlineAt: null,
  lockedPlayerCount: 3,
  cityScore: 640,
  cityLevel: 'improving',
  buildingLevels: { school: 1, construction: -1, market: 2, hospital: 0, police: 1, municipality: -2, newsAgency: 2 },
  buildingScores: { school: 720, construction: 320, market: 920, hospital: 540, police: 760, municipality: 80, newsAgency: 880 },
  integrityTotal: 20,
  corruptionTotal: 10,
  timeoutTotal: 6,
  roleRotation: ['student', 'teacher', 'journalist', 'police', 'merchant', 'doctor', 'municipal', 'contractor'],
  preAssessmentOpened: true,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_100_000,
}

const assessment = (
  recordType: 'pre' | 'post',
  playerId: string,
  responses: number[],
): ClassroomAssessmentRecord => ({
  schemaVersion: 1,
  recordType,
  roomId: room.roomId,
  playerId,
  ownerUid: `private-owner-${playerId}`,
  responses,
  submittedAt: 1,
})

const records: ClassroomAssessmentRecord[] = [
  assessment('pre', 'student-secret-a', Array(10).fill(2)),
  assessment('post', 'student-secret-a', Array(10).fill(4)),
  assessment('pre', 'student-secret-b', Array(10).fill(3)),
  assessment('post', 'student-secret-b', Array(10).fill(3)),
  assessment('pre', 'student-secret-c', Array(10).fill(5)),
  assessment('post', 'student-secret-c', Array(10).fill(4)),
  { schemaVersion: 1, recordType: 'reflection', roomId: room.roomId, playerId: 'student-secret-a', ownerUid: 'private-owner-a', r1: 'RAW SECRET R1', r2: 'RAW SECRET R2', r3: 'RAW SECRET R3', submittedAt: 2 },
  { schemaVersion: 1, recordType: 'observation', roomId: room.roomId, teacherSessionId: room.teacherSessionId, o1: 2, o2: 3, o3: 4, o4: 3, notes: 'บันทึกภาพรวมชั้นเรียน', submittedAt: 3 },
]

describe('TeacherCompetitionEvidenceDashboard', () => {
  it('shows the latest city scene with city score plus every building score and level before assessment evidence', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={records} room={room} />)
    const latestCityIndex = markup.indexOf('ผลเมืองและภาพเมืองล่าสุด')
    const assessmentIndex = markup.indexOf('ผลการประเมินก่อน–หลัง (PRE–POST)')

    expect(latestCityIndex).toBeGreaterThan(-1)
    expect(latestCityIndex).toBeLessThan(assessmentIndex)
    expect(markup).toContain('คะแนนเมืองล่าสุด')
    expect(markup).toContain('640')
    expect(markup).toContain('data-city-level="improving"')
    expect(markup).toContain('คะแนนและระดับอาคารล่าสุด')
    expect(markup).toContain('720')
    expect(markup).toContain('ระดับ +1')
    expect(markup).toContain('80')
    expect(markup).toContain('ระดับ -2')
  })

  it('omits report-derived curriculum, creativity, and improvement filler from the live evidence dashboard', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={records} room={room} />)

    expect(markup).not.toContain('ความสอดคล้องกับหลักสูตรต้านทุจริตศึกษา')
    expect(markup).not.toContain('องค์ประกอบความคิดสร้างสรรค์')
    expect(markup).not.toContain('ปัญหาและแนวทางปรับปรุงจากรายงาน')
    expect(markup).not.toContain('REPORT-DERIVED IMPLEMENTATION LEARNING')
  })

  it('renders complete matched evidence, five-point gain, all change groups, and calculation trace', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={records} room={room} />)
    expect(markup).toContain('ผลการประเมินก่อน–หลัง (PRE–POST)')
    expect(markup).toContain('3 / 3')
    expect(markup).toContain('3.33')
    expect(markup).toContain('3.67')
    expect(markup).toContain('+0.33')
    expect(markup).toContain('Improved')
    expect(markup).toContain('Unchanged')
    expect(markup).toContain('Decreased')
    expect(markup).toContain('33.3% ของผู้ที่จับคู่ได้ N=3')
    expect(markup).toContain('วิธีคำนวณผลการประเมิน')
    expect(markup).toContain('แบบประเมินก่อนกิจกรรม (PRE) และหลังกิจกรรม (POST) มีชุดละ 10 ข้อ ระดับ 1–5')
    expect(markup).toContain('ก่อนกิจกรรม (PRE) เฉลี่ย</dt><dd>3.33 / 5')
    expect(markup).toContain('หลังกิจกรรม (POST) เฉลี่ย</dt><dd>3.67 / 5')
    expect(markup).not.toContain('คะแนนรวมเฉลี่ยที่เพิ่มขึ้น')
    expect(markup).not.toContain('จากคะแนนรวม 50')
    expect(markup).not.toContain('10–50')
  })

  it('renders current Observation scale and Reflection completion without raw Reflection text', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={records} room={room} />)
    expect(markup).toContain('แบบสังเกตของครู (Teacher Observation) O1–O4')
    expect(markup).toContain('3.00 / 4')
    expect(markup).toContain('แสดงพฤติกรรมได้ชัดเจนและสม่ำเสมอ')
    expect(markup).toContain('1 / 3')
    expect(markup).toContain('หลักฐานเชิงคุณภาพ ไม่ให้คะแนน')
    expect(markup).not.toContain('RAW SECRET R1')
    expect(markup).not.toContain('student-secret-a')
    expect(markup).not.toContain('private-owner')
    expect(markup).not.toContain('private-teacher-session')
  })

  it('shows missing matched and Observation evidence as unavailable rather than measured zero', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={[]} room={room} />)
    expect(markup).toContain('ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบก่อน–หลัง (PRE–POST)')
    expect(markup).toContain('ยังไม่มีหลักฐานการสังเกตของครู')
    expect(markup).not.toContain('0.00 <small>/ 5</small>')
    expect(markup).not.toContain('0.00 / 4')
  })

  it('separates assessment, qualitative, Observation, and simulation evidence and reconciles 12 decisions', () => {
    const markup = renderToStaticMarkup(<TeacherCompetitionEvidenceDashboard records={records} room={room} />)
    expect(markup).toContain('ก่อนกิจกรรม (PRE) 10 ข้อ')
    expect(markup).toContain('สถานการณ์ 10 + วิกฤต (Crisis) 2')
    expect(markup).toContain('สะท้อนคิด (Reflection) 3 ข้อ')
    expect(markup).toContain('หลักฐานการตัดสินใจระหว่างสถานการณ์จำลอง')
    expect(markup).toContain('คาด 36')
    expect(markup).toContain('ระบบบันทึกจริง 36')
    expect(markup).toContain('✓ ตรงกัน')
    expect(markup).toContain('ไม่ใช้แทนคะแนนประเมินก่อน–หลัง')
  })

  it('is a read-only teacher route and leaves public, teacher Result, and student Result branches in place', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../pages/TeacherEvidencePage.tsx', import.meta.url), 'utf8')
    const resultPage = readFileSync(new URL('../pages/ResultPage.tsx', import.meta.url), 'utf8')

    expect(app).toContain('path="/teacher/evidence/:roomCode"')
    expect(page).toContain('teacherSession?.roomId === roomId')
    expect(page).toContain("isTeacher && roomState.data?.status === 'finished'")
    expect(page).toContain("roomState.data.status !== 'finished'")
    expect(page).toContain('useTeacherLearningEvidencePublisher(')
    expect(page).not.toMatch(/submit|updateDoc|setDoc|continueCity|endActivity|clearClassroom/i)
    expect(resultPage).toContain('หลักฐานการเรียนรู้และพัฒนา')
    expect(resultPage).toContain('if (isPublicFinishedResult)')
    expect(resultPage).toContain('if (!isTeacher && hasStudentSession)')
    expect(resultPage).toContain("['learning', 'ผลการเรียนรู้']")
  })
})
