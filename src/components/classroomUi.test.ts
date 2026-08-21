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

  it('collects student identity fields and shows the number-sorted teacher roster', () => {
    const joinPage = readSource('../pages/JoinPage.tsx')
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const firebaseService = readSource('../services/firebaseClassroomService.ts')
    expect(joinPage).toContain('ชื่อ–สกุล')
    expect(joinPage).toContain('placeholder="เช่น ม.1/1"')
    expect(joinPage).toContain('studentNumber: Number(studentNumber)')
    expect(teacherPage).toContain("player.studentNumber ?? '–'")
    expect(teacherPage).toContain("player.classSection ?? '–'")
    expect(firebaseService).toContain('.sort(compareClassroomPlayersByStudentNumber)')
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
    expect(teacherPage).toContain('const canAdvanceQuestion = Boolean(')
    expect(teacherPage).toContain('shouldCloseQuestion(answerCount, room.lockedPlayerCount, room.questionDeadlineAt)')
    expect(teacherPage).toContain('{canAdvanceQuestion ? (')
    expect(teacherPage).toContain('finalizedRound = await service.closeQuestion')
    expect(teacherPage).toContain('service.openNextQuestion')
    expect(teacherPage).toContain('service.finishGame')
  })

  it('lets the teacher terminate a lobby before creating a fresh room', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(teacherPage).toContain('ยุติห้องและสร้างห้องใหม่')
    expect(teacherPage).toContain("room.status !== 'finished' && room.teacherSessionId === uid")
    expect(teacherPage).toContain('await service.endActivity(room.roomId, uid)')
    expect(teacherPage).toContain('clearTeacherSnapshot(roomId)')
    expect(teacherPage).toContain('disabled={busy}')
    expect(teacherPage).toContain("setRoomId('')")
    expect(resultPage).toContain("roomState.data?.status !== 'finished'")
    expect(resultPage).toContain('clearClassroomStudentSession()')
  })

  it('shows a one-year teacher cutscene before each next question', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const openNextIndex = teacherPage.indexOf('service.openNextQuestion')
    expect(teacherPage).toContain('cityYear: room.gameCycle * 10 + room.currentQuestionNumber')
    expect(teacherPage).toContain('<p className="teacher-year-cutscene__eyebrow">1 ปีต่อมา...</p>')
    expect(teacherPage).toContain('<h2>ปีที่ {yearCutscene.cityYear}</h2>')
    expect(teacherPage).toContain('เมืองก้าวเข้าสู่ช่วงเวลาใหม่')
    expect(teacherPage).toContain('darken: 600, title: 1_700, textFade: 700, reveal: 700, highlight: 800')
    expect(teacherPage.indexOf("phase: 'holding'")).toBeLessThan(openNextIndex)
    expect(teacherPage).toContain("phase: 'text-leaving'")
    expect(teacherPage).toContain("phase: 'leaving'")
    expect(teacherPage).toContain('setCityRevealLocations(changedLocations)')
    expect(teacherPage).toContain('setVisualBuildingLevels(nextLevels)')
    expect(teacherPage).toContain('setBuildingChangeStory(story)')
  })

  it('shows each trusted answer impact immediately instead of keeping round score labels on buildings', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    expect(teacherPage).toContain('resolveLiveAnswerImpact(answer, trustedSnapshot)')
    expect(teacherPage).toContain('<LiveAnswerImpacts impacts={liveAnswerImpacts} />')
    expect(teacherPage).not.toContain('<LocationResults summaries=')
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

  it('uses the completed layered city in Teacher View without exposing the composer', () => {
    const app = readSource('../App.tsx')
    const cityStage = readSource('./CityStage.tsx')
    const cityScene = readSource('./CityScene.tsx')
    expect(app).not.toContain('city-model-composer')
    expect(cityStage).toContain('buildingEffects={displayedBuildingEffects}')
    expect(cityStage).toContain('buildingLevels={displayedBuildingLevels}')
    expect(cityStage).toContain('cityLevel={displayedCityLevel}')
    expect(cityScene).toContain('resolveCitySceneProfile')
    expect(cityScene).toContain('city-scene__building')
    expect(cityScene).not.toContain('city-map-seven-models-lv3-master.png')
    expect(cityStage).not.toMatch(/Grid|Save Layout|Load Layout|Control Panel/)
  })

  it('lets the teacher zoom the city while keeping a fit-to-screen reset', () => {
    const cityStage = readSource('./CityStage.tsx')
    expect(cityStage).toContain('our_city_teacher_scene_zoom_v1')
    expect(cityStage).toContain('ซูมภาพเมืองออก')
    expect(cityStage).toContain('ซูมภาพเมืองเข้า')
    expect(cityStage).toContain('พอดีจอ')
    expect(cityStage).toContain("'--city-scene-zoom': cityZoom / 100")
  })

  it('provides an opt-in scene calibration tool backed by the real renderer', () => {
    const cityStage = readSource('./CityStage.tsx')
    const cityScene = readSource('./CityScene.tsx')
    expect(cityStage).toContain("get('layout') === '1'")
    expect(cityStage).toContain('our_city_scene_layout_overrides_v1')
    expect(cityStage).toContain('navigator.clipboard.writeText')
    expect(cityStage).toContain('buildingPlacementOverrides={displayedPlacementOverrides}')
    expect(cityScene).toContain('buildingPlacementOverrides?.[buildingId]')
  })

  it('keeps building stories centered above the dock and colors status by city level', () => {
    const styles = readSource('../styles.css')
    expect(styles).toContain('bottom: calc(clamp(5.5rem, 10.5vh, 6.8rem) + .9rem)')
    expect(styles).toContain('.city-stage--critical {')
    expect(styles).toContain('.city-stage--declining {')
    expect(styles).toContain('.city-stage--prosperous {')
    expect(styles).toContain('var(--city-level-color')
  })

  it('uses an accessible collapsible teacher menu without shrinking the city canvas', () => {
    const cityStage = readSource('./CityStage.tsx')
    const styles = readSource('../styles.css')
    expect(cityStage).toContain('isSidebarOpen')
    expect(cityStage).toContain('aria-controls="teacher-dashboard-menu"')
    expect(cityStage).toContain('aria-expanded={isSidebarOpen}')
    expect(styles).toContain('--city-sidebar-width: 0rem')
    expect(styles).toContain('font-family: "Mitr"')
  })

  it('renders honest light and corrupt gloom from real latest building averages', () => {
    const cityStage = readSource('./CityStage.tsx')
    expect(cityStage).toContain('summary.participantCount === 0 || summary.scoreAverage === 0')
    expect(cityStage).toContain("summary.scoreAverage > 0 ? 'is-integrity' : 'is-corruption'")
    expect(cityStage).toContain('city-stage__building-effects')
  })

  it('opens real per-building score history from repositioned map labels', () => {
    const cityStage = readSource('./CityStage.tsx')
    expect(cityStage).toContain('roundHistory?: readonly ClassroomRoundResult[]')
    expect(cityStage).toContain('ดูประวัติคะแนน${building.label}')
    expect(cityStage).toContain('ประวัติคะแนนแต่ละข้อ')
    expect(cityStage).toContain('round.locationSummaries[selectedBuildingId]')
  })

  it('anchors building overlays to the contained city image instead of letterbox bars', () => {
    const cityStage = readSource('./CityStage.tsx')
    expect(cityStage).toContain('CITY_STAGE_WIDTH / CITY_STAGE_HEIGHT')
    expect(cityStage).toContain('const observer = new ResizeObserver(updateContentFrame)')
    expect(cityStage).toContain('className="city-stage__scene-overlays"')
    expect(cityStage).toContain('top: cityContentFrame.top')
  })

  it('toggles a translucent score card beside the selected building label', () => {
    const cityStage = readSource('./CityStage.tsx')
    const styles = readSource('../styles.css')
    expect(cityStage).toContain('current === building.id ? null : building.id')
    expect(cityStage).toContain("selectedBuildingAnchor.y >= canvasHeight * .5 ? ' is-above' : ''")
    expect(cityStage).toContain("'--building-detail-y': `${selectedBuildingAnchor.y}px`")
    expect(cityStage).toContain(') * cityZoom / 100 + cityPan.y')
    expect(styles).toContain('rgb(238 249 255 / 76%)')
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
