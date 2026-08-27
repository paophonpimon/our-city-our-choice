import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ClassroomPlayer,
  ClassroomPostAssessment,
  ClassroomPreAssessment,
  ClassroomReflection,
  ClassroomTeacherObservation,
} from '../types/classroomGame'
import {
  shouldShowTeacherObservationSection,
  TeacherEvidenceSummarySection,
} from './TeacherEvidenceSummarySection'

const player: ClassroomPlayer = {
  playerId: 'student-1',
  nickname: 'มะลิ',
  nicknameKey: 'มะลิ',
  classSection: '1/2',
  studentNumber: 7,
  ownerUid: 'owner-1',
  roleId: null,
  roleHistory: [],
  roleOffset: null,
  joinedAt: 1,
  lastSeenAt: 1,
}

const pre = (responses: number[]): ClassroomPreAssessment => ({
  schemaVersion: 1,
  recordType: 'pre',
  roomId: 'ROOM01',
  playerId: player.playerId,
  ownerUid: player.ownerUid,
  responses,
  submittedAt: 1,
})

const post = (responses: number[]): ClassroomPostAssessment => ({
  schemaVersion: 1,
  recordType: 'post',
  roomId: 'ROOM01',
  playerId: player.playerId,
  ownerUid: player.ownerUid,
  responses,
  submittedAt: 2,
})

const observation: ClassroomTeacherObservation = {
  schemaVersion: 1,
  recordType: 'observation',
  roomId: 'ROOM01',
  teacherSessionId: 'teacher-1',
  o1: 1,
  o2: 2,
  o3: 3,
  o4: 4,
  notes: 'นักเรียนอภิปรายโดยรับฟังเหตุผลของเพื่อน',
  submittedAt: 3,
}

describe('TeacherEvidenceSummarySection', () => {
  it('renders the normal matched PRE–POST summary using 1–5 means and total-score gain', () => {
    const markup = renderToStaticMarkup(
      <TeacherEvidenceSummarySection
        players={[player]}
        records={[pre(Array(10).fill(2)), post(Array(10).fill(4))]}
      />,
    )

    expect(markup).toContain('1 คน')
    expect(markup).toContain('ค่าเฉลี่ย PRE (1–5)')
    expect(markup).toContain('>2.00<')
    expect(markup).toContain('ค่าเฉลี่ย POST (1–5)')
    expect(markup).toContain('>4.00<')
    expect(markup).toContain('ค่าเฉลี่ยการเปลี่ยนแปลงคะแนนรวม (10–50)')
    expect(markup).toContain('>+20.00<')
    expect(markup).toContain('>100%<')
    expect(markup).toContain('ผลการประเมินสะท้อนการเปลี่ยนแปลงระยะสั้นด้านความตระหนักและแนวโน้มการตัดสินใจหลังเข้าร่วมกิจกรรม')
  })

  it('shows a clear zero-matched state without misleading decimal means', () => {
    const markup = renderToStaticMarkup(
      <TeacherEvidenceSummarySection players={[player]} records={[pre(Array(10).fill(3))]} />,
    )

    expect(markup).toContain('ยังไม่มีข้อมูล PRE–POST ที่จับคู่ได้')
    expect(markup).toContain('>—<')
    expect(markup).not.toContain('0.00')
  })

  it('shows that Observation is missing and points to the recording form', () => {
    const markup = renderToStaticMarkup(<TeacherEvidenceSummarySection players={[]} records={[]} />)
    expect(markup).toContain('ยังไม่ได้บันทึก')
    expect(markup).toContain('ครูสามารถบันทึกได้ในแบบฟอร์มด้านล่าง')
  })

  it('renders completed O1–O4 and notes as the single Observation evidence summary', () => {
    const markup = renderToStaticMarkup(
      <TeacherEvidenceSummarySection players={[]} records={[observation]} />,
    )

    expect(markup).toContain('O1')
    expect(markup).toContain('1 / 4')
    expect(markup).toContain('O4')
    expect(markup).toContain('4 / 4')
    expect(markup).toContain(observation.notes)
  })

  it('renders each original qualitative Reflection response with the existing student label', () => {
    const reflection: ClassroomReflection = {
      schemaVersion: 1,
      recordType: 'reflection',
      roomId: 'ROOM01',
      playerId: player.playerId,
      ownerUid: player.ownerUid,
      r1: 'คำตอบต้นฉบับข้อหนึ่ง',
      r2: 'คำตอบต้นฉบับข้อสอง',
      r3: 'คำตอบต้นฉบับข้อสาม',
      submittedAt: 4,
    }
    const markup = renderToStaticMarkup(
      <TeacherEvidenceSummarySection players={[player]} records={[reflection]} />,
    )

    expect(markup).toContain('มะลิ • ชั้น 1/2 • เลขที่ 7')
    expect(markup).toContain(reflection.r1)
    expect(markup).toContain(reflection.r2)
    expect(markup).toContain(reflection.r3)
    expect(markup).toContain('โดยไม่มีการให้คะแนนหรือสรุปอัตโนมัติ')
  })
})

describe('finished ResultPage Observation de-duplication', () => {
  it('keeps the recording workflow available when finished evidence has no Observation', () => {
    expect(shouldShowTeacherObservationSection(true, false, null)).toBe(true)
    expect(shouldShowTeacherObservationSection(true, true, null)).toBe(false)

    const resultPage = readFileSync(new URL('../pages/ResultPage.tsx', import.meta.url), 'utf8')
    expect(resultPage).toContain('<FinishedLearningEvidenceSection')
    expect(resultPage).toContain('<TeacherObservationSection')
    expect(resultPage).toContain('useProvidedObservation={room.status === \'finished\'}')
  })

  it('hides the duplicate completed Observation form while the stored summary remains available', () => {
    expect(shouldShowTeacherObservationSection(true, false, observation)).toBe(false)
    expect(shouldShowTeacherObservationSection(false, false, observation)).toBe(true)

    const summary = renderToStaticMarkup(
      <TeacherEvidenceSummarySection players={[]} records={[observation]} />,
    )
    expect(summary).toContain('หลักฐานการสังเกตของครู')
    expect(summary).toContain(observation.notes)
  })
})

describe('Teacher Observation light ResultPage visual contract', () => {
  it('styles unsaved, selected, saved, focus, and disabled states with the light palette', () => {
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const start = styles.indexOf('/* Teacher Observation (Phase B2a) */')
    const end = styles.indexOf('/* Teacher Evidence Summary (Phase B2c) */', start)
    const observationStyles = styles.slice(start, end)

    expect(observationStyles).toContain('background: #f7fbfe;')
    expect(observationStyles).toContain('color: #173d5d;')
    expect(observationStyles).toContain('.teacher-observation-rating-option:hover')
    expect(observationStyles).toContain('.teacher-observation-rating-option.is-selected')
    expect(observationStyles).toContain('.teacher-observation-rating-option:has(input:focus-visible)')
    expect(observationStyles).toContain('.teacher-observation-summary-item')
    expect(observationStyles).toContain('.teacher-observation-notes-display')
    expect(observationStyles).toContain('.teacher-observation-submit-button:disabled')
    expect(observationStyles).not.toContain('background: rgba(13, 22, 35, 0.85);')
    expect(observationStyles).not.toContain('color: #ffffff;')
  })
})
