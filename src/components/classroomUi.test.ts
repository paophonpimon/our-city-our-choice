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
    expect(teacherPage).toContain('finalizedRound = await withActionTiming(\'closeQuestion\'')
    expect(teacherPage).toContain('service.closeQuestion')
    expect(teacherPage).toContain('service.openNextQuestion')
    expect(teacherPage).toContain('service.finishGame')
  })

  it('keeps a valid finished teacher session attached and routes /teacher back to Result evidence', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(teacherPage).toContain("room?.status === 'game-result' || room?.status === 'finished'")
    const restoreStart = teacherPage.indexOf("if (!roomId || roomState.identityKey !== roomId || roomState.loading) return")
    const restoreEnd = teacherPage.indexOf('const closeCurrentQuestion', restoreStart)
    const restoreEffect = teacherPage.slice(restoreStart, restoreEnd)
    expect(restoreEffect).toContain('room.teacherSessionId !== uid')
    expect(restoreEffect).not.toContain("room.status === 'finished'")
    expect(resultPage).toContain('<TeacherEvidenceSummarySection')
    expect(resultPage).toContain('<TeacherObservationSection')
  })

  it('starts assessment-complete finished only from ResultPage, never active question or crisis controls', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(teacherPage).not.toContain('setIsEndActivityDialogOpen')
    expect(teacherPage).not.toContain('city-stage__action-button--end')
    expect(resultPage).toContain("if (room.status === 'game-result') await service.endActivity(roomId, uid)")
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

  it('hard-locks the student answer buttons and handlers the instant the countdown reaches zero', () => {
    const gamePage = readSource('../pages/GamePage.tsx')
    // UI disable: both the normal-question and crisis choice buttons must
    // stop accepting clicks at remaining <= 0, not just when an answer already exists.
    expect(gamePage).toContain("disabled={Boolean(existingAnswer) || Boolean(savingChoiceId) || roomState.data?.status !== 'playing' || remaining <= 0}")
    expect(gamePage).toContain('disabled={!active || Boolean(existingCrisisAnswer) || Boolean(savingChoiceId) || remaining <= 0}')
    // Defense in depth: the submit handlers reject locally too, independent of the disabled button.
    expect(gamePage).toContain("if (!roomState.data || roomState.data.status !== 'playing' || !question || existingAnswer || remaining <= 0) return")
    expect(gamePage).toContain("if (!roomState.data || roomState.data.status !== 'crisis-playing' || !crisisDilemma || existingCrisisAnswer || remaining <= 0) return")
    // Polished, non-dismissible overlay — no native alert/confirm anywhere in the flow.
    expect(gamePage).toContain('หมดเวลาสำหรับข้อนี้')
    expect(gamePage).toContain('ระบบปิดรับคำตอบแล้ว')
    expect(gamePage).toContain('รอครูเข้าสู่ข้อถัดไป')
    expect(gamePage).not.toContain('window.alert')
    expect(gamePage).not.toContain('window.confirm')
  })

  it('never shows a native confirm/alert anywhere in the active teacher classroom flow', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    expect(teacherPage).not.toContain('window.confirm')
    expect(teacherPage).not.toContain('window.alert')
    expect(teacherPage).toContain('<ConfirmDialog')
  })

  it('shows all lobby guide sections together on landscape tablet/desktop, and only the active one on mobile/portrait', () => {
    const lobbyPage = readSource('../pages/LobbyPage.tsx')
    const styles = readSource('../styles.css')
    // All four sections must always be in the DOM — CSS decides visibility
    // per breakpoint, not a JS conditional that only ever renders one.
    expect(lobbyPage).not.toMatch(/activeTab === '\w+' \? <section/)
    expect(lobbyPage).toContain("className={`student-wait-how${activeTab === 'how' ? ' is-active' : ''}`}")
    expect(lobbyPage).toContain("className={`student-wait-roles${activeTab === 'roles' ? ' is-active' : ''}`}")
    expect(lobbyPage).toContain("className={`student-wait-impact${activeTab === 'impact' ? ' is-active' : ''}`}")
    expect(lobbyPage).toContain("className={`student-wait-checklist${activeTab === 'checklist' ? ' is-active' : ''}`}")
    // Desktop-first base rule lays every section out in one grid, not a
    // single-child container with three empty columns.
    expect(styles).toContain('.student-wait-guide__content { display: grid; grid-template-columns: 1.08fr 1.16fr 1fr 1fr;')
    // Only inside the mobile/portrait-scoped query does a non-active section disappear.
    expect(styles).toContain('@media (max-width: 767px), (orientation: portrait) {')
    const mobileQueryBody = styles.slice(styles.indexOf('@media (max-width: 767px), (orientation: portrait) {'))
    expect(mobileQueryBody).toContain('.student-wait-guide__content > section { display: none;')
    expect(mobileQueryBody).toContain('.student-wait-guide__content > section.is-active { display: block;')
    // Breakpoint is viewport-based (width/orientation), never device sniffing.
    expect(lobbyPage).not.toMatch(/navigator\.(userAgent|platform)/)
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
    const cityLayoutOverrides = readSource('../domain/cityLayoutOverrides.ts')
    expect(cityStage).toContain("get('layout') === '1'")
    expect(cityStage).toContain('navigator.clipboard.writeText')
    expect(cityStage).toContain('buildingPlacementOverrides={displayedPlacementOverrides}')
    expect(cityScene).toContain('resolveEffectivePlacement(buildingPlacementOverrides, sceneProfile.id, buildingId, levels[buildingId])')
    expect(cityLayoutOverrides).toContain('our_city_scene_layout_overrides_v2')
    expect(cityLayoutOverrides).toContain('our_city_scene_layout_overrides_v1')
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

  it('positions embedded teacher audio beside the menu with reserved tablet and portrait space', () => {
    const styles = readSource('../styles.css')
    expect(styles).toContain('left: clamp(4.55rem, 5.8vw, 6.25rem)')
    expect(styles).toContain('position: static !important')
    expect(styles).toContain('.city-stage:has(.city-stage__utility-controls) .city-stage__topbar')
    expect(styles).toContain('padding-left: clamp(16.8rem, 23vw, 20rem)')
    expect(styles).toContain('padding: 4.8rem .7rem .7rem')
  })

  it('renders honest light and corrupt gloom from real latest building averages', () => {
    const cityStage = readSource('./CityStage.tsx')
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const styles = readSource('../styles.css')
    expect(cityStage).toContain('summary.participantCount === 0 || summary.scoreAverage === 0')
    expect(cityStage).toContain("summary.scoreAverage > 0 ? 'is-integrity' : 'is-corruption'")
    expect(cityStage).toContain('city-stage__building-effects')
    expect(teacherPage).toContain("locationImpacts={room.status === 'round-result' ? currentRound?.locationSummaries ?? null : null}")
    expect(teacherPage).not.toContain('locationImpacts={latestRound?.locationSummaries')
    const degradedIntegrityStart = styles.indexOf('.city-scene.is-scene-degraded .city-scene__building-aura.is-integrity')
    const degradedCorruptionStart = styles.indexOf('.city-scene.is-scene-degraded .city-scene__building-aura.is-corruption')
    const degradedIntegrityCss = styles.slice(degradedIntegrityStart, degradedCorruptionStart)
    expect(degradedIntegrityCss).toContain('mix-blend-mode: screen')
    expect(degradedIntegrityCss).toContain('brightness(1.55)')
    expect(degradedIntegrityCss).not.toContain('soft-light')
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
    expect(resultPage).toContain('สุจริตรอบล่าสุด')
    expect(resultPage).toContain('สุจริตสะสม')
    expect(resultPage).toContain('เล่นต่อเพื่อพัฒนาเมือง')
    expect(resultPage).toContain('เริ่มห้องใหม่')
    expect(resultPage).not.toMatch(/winner|leaderboard|อันดับ/i)
  })
})

describe('PRE submission never gets stuck indefinitely on "กำลังส่งคำตอบ..."', () => {
  it('filters out unconfirmed local writes before ever reporting a PRE submission as complete', () => {
    const service = readSource('../services/firebaseClassroomService.ts')
    const start = service.indexOf('subscribePreAssessment(')
    const end = service.indexOf('subscribeQuestions(', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const subscribeBlock = service.slice(start, end)
    expect(subscribeBlock).toContain('includeMetadataChanges: true')
    expect(subscribeBlock).toContain('snapshot.metadata.hasPendingWrites')
  })

  it('bounds the submit spinner with a watchdog that always recovers to a Thai error, never leaving it stuck forever', () => {
    const page = readSource('../pages/PreAssessmentPage.tsx')
    expect(page).toContain('SUBMIT_CONFIRMATION_TIMEOUT_MS')
    // The watchdog effect must actually clear `submitting` and surface a
    // recoverable message - not merely fire a side effect that leaves the
    // button disabled forever - and must clear its own timeout on cleanup
    // (submitting turning false, or unmount from the redirect firing), or it
    // would fire a stale error after a submission that already succeeded.
    const start = page.indexOf('if (!submitting) return')
    const end = page.indexOf('}, [submitting])', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const watchdogEffect = page.slice(start, end)
    expect(watchdogEffect).toContain('window.setTimeout(() => {')
    expect(watchdogEffect).toContain('setSubmitting(false)')
    expect(watchdogEffect).toContain('setError(')
    expect(watchdogEffect).toContain('window.clearTimeout(timeoutId)')
  })

  it('never resets `submitting` to false on the success path - only the watchdog or an outright rejection may do that', () => {
    const page = readSource('../pages/PreAssessmentPage.tsx')
    const submitStart = page.indexOf('const submit = async')
    const submitEnd = page.indexOf('return (\n    <main', submitStart)
    expect(submitStart).toBeGreaterThan(-1)
    expect(submitEnd).toBeGreaterThan(submitStart)
    const submitFn = page.slice(submitStart, submitEnd)
    const catchStart = submitFn.indexOf('} catch')
    expect(catchStart).toBeGreaterThan(-1)
    expect(submitFn.slice(0, catchStart)).not.toContain('setSubmitting(false)')
    expect(submitFn.slice(catchStart)).toContain('setSubmitting(false)')
  })

  it('never navigates optimistically before PRE is confirmed - routing only happens from the live, server-confirmed assessment subscription', () => {
    const page = readSource('../pages/PreAssessmentPage.tsx')
    const submitStart = page.indexOf('const submit = async')
    const submitEnd = page.indexOf('return (\n    <main', submitStart)
    expect(page.slice(submitStart, submitEnd)).not.toMatch(/navigate\(/)
  })

  it('never traps a student without completed PRE in a finished room, but leaves an in-flight submission alone', () => {
    const page = readSource('../pages/PreAssessmentPage.tsx')
    expect(page).toContain("roomState.data?.status === 'finished' && !submitting")
  })
})
