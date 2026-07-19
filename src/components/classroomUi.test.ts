import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createClassroomJoinUrl, LOCATION_POSITIONS, normalizeJoinRoomId } from './classroomUi'

const readSource = (relativePath: string): string => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('classroom UI contracts', () => {
  it('builds a local join URL and keeps QR handling inside the app', () => {
    expect(createClassroomJoinUrl('https://class.example/', ' ab12cd ')).toBe('https://class.example/join?room=AB12CD')
    expect(readSource('./JoinQrCode.tsx')).toContain('QRCodeSVG')
    expect(readSource('../pages/TeacherPage.tsx')).toContain('navigator.clipboard.writeText(joinLink)')
  })

  it('normalizes roomId from the QR query parameter', () => {
    expect(normalizeJoinRoomId(' room01 ')).toBe('ROOM01')
    expect(normalizeJoinRoomId(null)).toBe('')
    const joinPage = readSource('../pages/JoinPage.tsx')
    expect(joinPage).toContain("searchParams.get('room')")
    expect(joinPage).toContain('roomFromUrl ?')
  })

  it('keeps seven city overlay locations including the shared school', () => {
    expect(Object.keys(LOCATION_POSITIONS)).toEqual([
      'hospital', 'municipal-office', 'police-station', 'school', 'market', 'construction', 'news-office',
    ])
    for (const position of Object.values(LOCATION_POSITIONS)) {
      expect(position.x).toBeGreaterThan(0)
      expect(position.x).toBeLessThan(100)
      expect(position.y).toBeGreaterThan(0)
      expect(position.y).toBeLessThan(100)
    }
  })

  it('keeps round results and Next teacher-controlled', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    expect(teacherPage).toContain("room.status === 'round-result' && currentRound")
    expect(teacherPage).toContain('service.openNextQuestion')
    expect(teacherPage).toContain('service.finishGame')
  })

  it('provides role draw before questions without student role selection', () => {
    const roleDraw = readSource('../pages/RoleDrawPage.tsx')
    expect(roleDraw).toContain('กำลังสุ่มอาชีพของคุณ')
    expect(roleDraw).toContain('service.beginQuestions')
    expect(roleDraw).not.toContain('เลือกอาชีพ')
    expect(readSource('../App.tsx')).toContain('/role-draw/:roomCode')
  })

  it('has no winner route or legacy leaderboard in visible classroom runtime', () => {
    const runtime = [
      '../App.tsx', './CityStage.tsx', '../pages/HomePage.tsx', '../pages/JoinPage.tsx', '../pages/LobbyPage.tsx',
      '../pages/RoleDrawPage.tsx', '../pages/GamePage.tsx', '../pages/TeacherPage.tsx', '../pages/ResultPage.tsx',
    ].map(readSource).join('\n')
    expect(runtime).not.toMatch(/congratulations|leaderboard|ผู้ชนะ|คะแนนส่วนตัว/i)
    expect(runtime).toContain('Our City, Our Choice')
  })

  it('keeps classroom components fluid', () => {
    const responsiveSources = [
      './CityStage.tsx', './LocationResults.tsx', './JoinQrCode.tsx', '../pages/RoleDrawPage.tsx',
      '../pages/GamePage.tsx', '../pages/TeacherPage.tsx', '../pages/ResultPage.tsx',
    ].map(readSource).join('\n')
    expect(responsiveSources).not.toMatch(/w-\[\d+px\]|min-w-\[\d+px\]|max-w-\[\d+px\]/)
  })

  it('shows latest and cumulative city progress with continue controls', () => {
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(resultPage).toContain('CITY_REFLECTIONS')
    expect(resultPage).toContain('สุจริตชุดล่าสุด')
    expect(resultPage).toContain('สุจริตสะสม')
    expect(resultPage).toContain('เล่นต่อเพื่อพัฒนาเมือง')
    expect(resultPage).toContain('สร้างห้องใหม่')
    expect(resultPage).not.toMatch(/winner|leaderboard|อันดับ/i)
  })
})
