import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createClassroomJoinUrl, LOCATION_POSITIONS, normalizeJoinRoomId } from './classroomUi'

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('classroom UI contracts', () => {
  it('builds the local QR and copy-link URL without an external QR service', () => {
    expect(createClassroomJoinUrl('https://class.example/', ' ab12cd ')).toBe(
      'https://class.example/join?room=AB12CD',
    )
    expect(readSource('./JoinQrCode.tsx')).toContain('QRCodeSVG')
    expect(readSource('../pages/TeacherPage.tsx')).toContain('navigator.clipboard.writeText(joinLink)')
  })

  it('normalizes roomId from the QR query parameter and hides the editable field for that path', () => {
    expect(normalizeJoinRoomId(' room01 ')).toBe('ROOM01')
    expect(normalizeJoinRoomId(null)).toBe('')
    const joinPage = readSource('../pages/JoinPage.tsx')
    expect(joinPage).toContain("searchParams.get('room')")
    expect(joinPage).toContain('roomFromUrl ?')
    expect(joinPage).toContain('รหัสห้องจาก QR')
  })

  it('keeps seven adjustable percentage positions, including one combined school overlay', () => {
    expect(Object.keys(LOCATION_POSITIONS)).toEqual([
      'hospital',
      'municipal-office',
      'police-station',
      'school',
      'market',
      'construction',
      'news-office',
    ])
    for (const position of Object.values(LOCATION_POSITIONS)) {
      expect(position.x).toBeGreaterThan(0)
      expect(position.x).toBeLessThan(100)
      expect(position.y).toBeGreaterThan(0)
      expect(position.y).toBeLessThan(100)
    }
  })

  it('shows location overlays only for a closed question and keeps Next teacher-controlled', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    expect(teacherPage).toContain("room.status === 'question-closed' && currentRound")
    expect(teacherPage).toContain("room.currentQuestionNumber === 10 ? 'ดูผลเมือง' : 'ข้อถัดไป'")
    expect(teacherPage).toContain('service.openNextQuestion')
  })

  it('has no winner route or legacy branding in visible runtime entry points', () => {
    const runtime = [
      '../../index.html',
      '../App.tsx',
      './Layout.tsx',
      '../pages/HomePage.tsx',
      '../pages/JoinPage.tsx',
      '../pages/LobbyPage.tsx',
      '../pages/GamePage.tsx',
      '../pages/TeacherPage.tsx',
      '../pages/ResultPage.tsx',
      '../pages/ClosedPage.tsx',
      '../pages/NotFoundPage.tsx',
    ].map(readSource).join('\n')

    expect(runtime).not.toMatch(/มัทนา|คำสาป|congratulations|leaderboard|ทีมผู้ชนะ|คะแนนส่วนตัว/i)
    expect(runtime).toContain('เมืองนี้อยู่ที่เรา')
    expect(runtime).toContain('Our City, Our Choice')
  })

  it('keeps polished classroom components fluid instead of using fixed pixel-width utilities', () => {
    const responsiveSources = [
      './CityStage.tsx',
      './LocationResults.tsx',
      './JoinQrCode.tsx',
      '../pages/JoinPage.tsx',
      '../pages/GamePage.tsx',
      '../pages/TeacherPage.tsx',
      '../pages/ResultPage.tsx',
    ].map(readSource).join('\n')
    expect(responsiveSources).not.toMatch(/w-\[\d+px\]|min-w-\[\d+px\]|max-w-\[\d+px\]/)
  })

  it('keeps the final city result collective and includes all five reflection messages', () => {
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(resultPage).toContain('CITY_REFLECTIONS')
    expect(resultPage).toContain('สุจริตรวม')
    expect(resultPage).toContain('ทุจริตรวม')
    expect(resultPage).toContain('ไม่ตอบรวม')
    expect(resultPage).not.toMatch(/winner|leaderboard|อันดับ/i)
  })
})
