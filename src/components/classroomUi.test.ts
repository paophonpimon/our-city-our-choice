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
    expect(teacherPage).toContain('disabled={busy || missingTrusted || !canAdvanceQuestion}')
    expect(teacherPage).not.toContain('{canAdvanceQuestion ? (')
    expect(teacherPage).toContain("await withActionTiming('closeQuestion', room.roomId")
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

  it('keeps normal completion on Result while exposing a separate confirmed emergency control in active teacher screens', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const roleDrawPage = readSource('../pages/RoleDrawPage.tsx')
    const emergencyControl = readSource('./TeacherEmergencyEndControl.tsx')
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(teacherPage).toContain('<TeacherEmergencyEndControl')
    expect(roleDrawPage).toContain('<TeacherEmergencyEndControl')
    expect(emergencyControl).toContain('await service.terminateActivity(roomId, uid)')
    expect(emergencyControl).toContain('confirmLabel="ยุติกิจกรรมทันที"')
    expect(emergencyControl).not.toContain('clearClassroomTeacherSession')
    expect(resultPage).toContain("if (room.status === 'game-result') await service.endActivity(roomId, uid)")
  })

  it('keeps unanswered normal choices neutral and limits hover styling to real hover devices', () => {
    const gamePage = readSource('../pages/GamePage.tsx')
    const styles = readSource('../styles.css')
    expect(gamePage).toContain("? 'is-selected'")
    expect(gamePage).toContain(": 'is-unanswered'")
    expect(styles).toContain('@media (hover: hover) and (pointer: fine) {')
    expect(styles).toContain('.game-play-choice.is-unanswered:focus-visible')
    expect(styles).toContain('.game-play-choice.is-selected:disabled')
    expect(styles).toContain('.city-stage__action-button--next:disabled')
  })

  it('keeps assessment rendering and server-confirmed submission behavior while sharing the light civic shell', () => {
    const prePage = readSource('../pages/PreAssessmentPage.tsx')
    const postPage = readSource('../pages/PostAssessmentPage.tsx')
    const styles = readSource('../styles.css')
    expect(prePage).toContain('PRE_ASSESSMENT_ITEMS.map((statement, index) => (')
    expect(postPage).toContain('ASSESSMENT_ITEMS.map((statement, index) => (')
    expect(postPage).toContain('REFLECTION_PROMPTS.map((prompt, index) => {')
    expect(prePage).toContain('const SUBMIT_CONFIRMATION_TIMEOUT_MS = 15_000')
    expect(postPage).toContain('const SUBMIT_CONFIRMATION_TIMEOUT_MS = 15_000')
    expect(prePage).toContain('await service.submitPreAssessment(roomId, session.playerId, uid, orderedResponses)')
    expect(postPage).toContain('await service.submitPostAssessment(roomId, session.playerId, uid, orderedResponses)')
    expect(postPage).toContain('await service.submitReflection(roomId, session.playerId, uid, reflectionInput)')
    expect(prePage).toContain('if (assessmentState.data) {')
    expect(prePage).toContain("roomState.data?.status === 'lobby'")
    expect(prePage).toContain('<PreAssessmentWaitingState roomId={roomId} />')
    expect(postPage).toContain('postWriteAcknowledged,')
    expect(postPage).toContain('reflectionWriteAcknowledged,')
    expect(postPage).toContain('setPostWriteAcknowledged(true)')
    expect(postPage).toContain('setReflectionWriteAcknowledged(true)')
    expect(prePage).toContain('our-city-page assessment-page')
    expect(postPage).toContain('our-city-page assessment-page')
    expect(prePage).not.toContain("from-[#050b14]")
    expect(postPage).not.toContain("from-[#050b14]")
    expect(styles).toContain('.our-city-page.assessment-page {')
    expect(styles).toContain('.assessment-choice.is-selected {')
    expect(styles).toContain('.assessment-submit {')
    expect(styles).toContain('body:has(.assessment-page)')
    expect(styles).toContain('background-color: #edf6fd !important')
    for (const weight of [400, 500, 600, 700]) {
      expect(styles).toContain(`@import "@fontsource/chakra-petch/${weight}.css"`)
    }
    expect(styles).toContain('font-family: "Chakra Petch", sans-serif')
    expect(styles).not.toMatch(/Mitr|Noto Sans Thai Looped|Leelawadee|Kanit|Th Sarabun/)
    expect(styles).toContain('.assessment-scale__item > span {')
    expect(styles).toContain('text-wrap: balance')
    expect(styles).toContain('.assessment-item__prompt {\n  display: flex;')
    expect(postPage).toContain('ตอบสั้น ๆ ตามความคิดของคุณได้ ข้อละ 1–2 ประโยคก็เพียงพอ')
  })

  it('keeps Teacher Lobby controls and gives the create-room card the full top-aligned control width', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const styles = readSource('../styles.css')
    expect(teacherPage).toContain('className="teacher-lobby-duration-field"')
    expect(teacherPage).toContain('onClick={() => void createRoom()}')
    expect(teacherPage).toContain('onClick={() => void openPreAssessment()}')
    expect(teacherPage).toContain('className="teacher-lobby-more-options"')
    expect(teacherPage).toContain('<TeacherSoundtrack mode={teacherSoundtrackMode} ref={teacherSoundtrackRef} />')
    expect(teacherPage).toContain('className="teacher-lobby-home"')
    expect(styles).toContain('.teacher-lobby-create-card { display: grid; width: 100%; max-width: none; align-self: flex-start; margin: 0;')
    expect(styles).toMatch(/\.teacher-lobby-create-card,\r?\n\s+\.teacher-lobby-summary,/)
    expect(styles).toContain('.teacher-lobby-create-card { align-self: start; }')
    expect(styles).toContain('.teacher-lobby-control { min-height: 0; }')
  })

  it('finishes the grouped city reveal before ordinary progression or a manual Q4/Q8/Q10 checkpoint', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const flowStart = teacherPage.indexOf('const nextOrFinish = async')
    const flowEnd = teacherPage.indexOf('const hardRecoverStaleRoom', flowStart)
    const nextFlow = teacherPage.slice(flowStart, flowEnd)
    const revealSettledIndex = nextFlow.indexOf('setBuildingChangeStories([])')
    expect(teacherPage).toContain('cityYear: room.gameCycle * 10 + room.currentQuestionNumber')
    expect(teacherPage).toContain('<p className="teacher-year-cutscene__eyebrow">1 ปีต่อมา...</p>')
    expect(teacherPage).toContain('<h2>ปีที่ {yearCutscene.cityYear}</h2>')
    expect(teacherPage).toContain('เมืองก้าวเข้าสู่ช่วงเวลาใหม่')
    expect(nextFlow).toContain('await waitForPresentation(timing.settle)')
    expect(nextFlow).not.toContain('Promise.all([')
    expect(revealSettledIndex).toBeGreaterThan(0)
    expect(nextFlow).toContain("resolvePostPresentationAction(questionAtStart) === 'open-next-question'")
    expect(nextFlow.indexOf('setRoundCheckpointReadyKey(checkpointKey)')).toBeGreaterThan(revealSettledIndex)
    expect(nextFlow).toContain("progressionAction === 'enter-crisis'")
    expect(nextFlow).toContain("progressionAction === 'finish-game'")
    expect(nextFlow).toContain('service.finishGame(roomAtStart, uid)')
    expect(nextFlow).toContain('service.openNextQuestion(roomAtStart, uid)')
    expect(teacherPage).toContain("? 'เข้าสู่เหตุการณ์วิกฤต'")
    expect(teacherPage).toContain("? 'ดูผลรอบนี้'")
  })

  it('keeps live impacts readable for 2.5 seconds without changing their trusted score', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const liveImpacts = readSource('./LiveAnswerImpacts.tsx')
    const styles = readSource('../styles.css')
    expect(teacherPage).toContain('resolveLiveAnswerImpact(answer, trustedSnapshot)')
    const presentation = readSource('../domain/cityPresentation.ts')
    expect(teacherPage).toContain('LIVE_ANSWER_IMPACT_DURATION_MS')
    expect(presentation).toContain('export const LIVE_ANSWER_IMPACT_DURATION_MS = 2_500')
    expect(teacherPage).toContain('<LiveAnswerImpacts impacts={liveAnswerImpacts} />')
    expect(liveImpacts).toContain('{signedLocationScore(impact.score)}')
    expect(styles).toContain('animation: live-answer-impact-pop 2.5s')
    expect(teacherPage).not.toContain('<LocationResults summaries=')
  })

  it('keeps Crisis continuation teacher-controlled until the visual result reveal settles', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const continueStart = teacherPage.indexOf('const continueAfterEvent = async')
    const crisisRenderEnd = teacherPage.indexOf("if (room && (room.status === 'playing'", continueStart)
    const crisisFlow = teacherPage.slice(continueStart, crisisRenderEnd)
    expect(teacherPage).toContain("setCrisisRevealPhase('holding')")
    expect(teacherPage).toContain("setCrisisRevealPhase('resolving')")
    expect(teacherPage).toContain("setCrisisRevealPhase('revealing')")
    expect(teacherPage).toContain("setCrisisRevealPhase('revealed')")
    expect(crisisFlow).toContain('onClick={() => void continueAfterEvent()}')
    expect(crisisFlow).toContain("crisisRevealPhase !== 'revealed'")
    expect(crisisFlow).toContain('service.openNextQuestion(room.roomId, uid)')
    expect(crisisFlow.match(/void continueAfterEvent\(\)/g)).toHaveLength(1)
  })

  it('uses current Crisis identity and validated Crisis timing for auto-close while keeping manual close', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const gamePage = readSource('../pages/GamePage.tsx')
    expect(teacherPage).toContain('countCrisisAnswersForEvent(answersState.data, room.gameCycle, room.currentCrisisEventId)')
    expect(teacherPage).toContain('shouldAutoCloseCrisis(')
    expect(teacherPage).toContain('room.questionStartedAt,')
    expect(teacherPage).toContain('onClick={() => void closeCurrentCrisis()}')
    expect(gamePage).toContain('answer.playerId === activePlayerId')
  })

  it('clears all temporary presentation state and timers at room boundaries', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const resetStart = teacherPage.indexOf('const resetRoomTransientState = useCallback')
    const resetEnd = teacherPage.indexOf('// Calibration mode', resetStart)
    const resetFlow = teacherPage.slice(resetStart, resetEnd)
    expect(resetFlow).toContain('roomBoundaryRef.current += 1')
    expect(resetFlow).toContain('cancelPresentationTimers()')
    expect(resetFlow).toContain('setVisualCityLevel(null)')
    expect(resetFlow).toContain('setVisualBuildingLevels(null)')
    expect(resetFlow).toContain('setBuildingTransitions({})')
    expect(resetFlow).toContain('setBuildingChangeStories([])')
    expect(resetFlow).toContain('setCrisisRevealPhase(null)')
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
    expect(cityStage).toContain('buildingTransitions={buildingTransitions}')
    expect(cityStage).toContain('cityLevel={displayedCityLevel}')
    expect(cityScene).toContain('resolveCitySceneProfile')
    expect(cityScene).toContain('city-scene__building')
    expect(cityScene).toContain('city-scene__building-transition-aura')
    expect(cityScene).toContain('is-transition-${transitionDirection}')
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
    expect(styles).toContain('font-family: "Chakra Petch", sans-serif')
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

  it('uses a summary-first teacher Result with exclusive city and evidence panels plus persistent actions', () => {
    const resultPage = readSource('../pages/ResultPage.tsx')
    const styles = readSource('../styles.css')
    expect(resultPage).toContain("useState<TeacherResultTab>('summary')")
    expect(resultPage).toContain("['summary', 'สรุป']")
    expect(resultPage).toContain("['city', 'รายละเอียดเมือง']")
    expect(resultPage).toContain("['evidence', 'หลักฐานครู']")
    expect(resultPage).toContain("activeTeacherTab === 'summary' ?")
    expect(resultPage).toContain("activeTeacherTab === 'city' ?")
    expect(resultPage).toContain("activeTeacherTab === 'evidence' ?")
    expect(resultPage.indexOf('className="teacher-result-actions"')).toBeGreaterThan(resultPage.indexOf('className="teacher-result-panels"'))
    expect(styles).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(styles).toContain('.teacher-result-panels { min-height: 0; overflow: auto;')
    expect(resultPage).toContain('<TeacherEvidenceSummarySection')
    expect(resultPage).toContain('<TeacherObservationSection')
  })

  it('renders personal result numbers only from loaded records with explicit empty and read-error states', () => {
    const resultPage = readSource('../pages/ResultPage.tsx')
    const firebaseService = readSource('../services/firebaseClassroomService.ts')
    expect(firebaseService).toContain("where('ownerUid', '==', ownerUid)")
    expect(firebaseService).toContain("where('playerId', '==', playerId)")
    expect(resultPage).toContain('<strong>{currentTotals.integrity}</strong>')
    expect(resultPage).toContain('ยังไม่มีข้อมูลผลส่วนตัวสำหรับรอบนี้')
    expect(resultPage).toContain('ไม่สามารถโหลดผลการตัดสินใจส่วนตัวได้ กรุณาลองใหม่')
    expect(resultPage).not.toContain("hasPrivateResults ? currentTotals.integrity : '—'")
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

describe('POST and Reflection active submit acknowledgements', () => {
  it('uses each resolved write as acknowledgement and leaves the watchdog only around an unresolved promise', () => {
    const page = readSource('../pages/PostAssessmentPage.tsx')
    const postWrite = page.indexOf('await service.submitPostAssessment(')
    const postAck = page.indexOf('setPostWriteAcknowledged(true)', postWrite)
    const reflectionWrite = page.indexOf('await service.submitReflection(')
    const reflectionAck = page.indexOf('setReflectionWriteAcknowledged(true)', reflectionWrite)
    expect(postAck).toBeGreaterThan(postWrite)
    expect(reflectionAck).toBeGreaterThan(reflectionWrite)
    expect(page.indexOf('setSubmitting(false)', postWrite)).toBeGreaterThan(postAck)
    expect(page.indexOf('setSubmitting(false)', reflectionWrite)).toBeGreaterThan(reflectionAck)
    expect(page).toContain('if (!submitting) return')
  })

  it('keeps rejected writes on the real error path and preserves server-derived refresh/resume inputs', () => {
    const page = readSource('../pages/PostAssessmentPage.tsx')
    expect(page.match(/catch \(reason\)/g)).toHaveLength(2)
    expect(page).toContain('setError(classroomFriendlyError(reason))')
    expect(page).toContain('Boolean(postAssessmentState.data),')
    expect(page).toContain('Boolean(reflectionState.data),')
  })

  it('places scale numbers and meanings inside each choice button on PRE and POST assessments without a separate top scale legend', () => {
    const prePage = readSource('../pages/PreAssessmentPage.tsx')
    const postPage = readSource('../pages/PostAssessmentPage.tsx')
    const styles = readSource('../styles.css')
    // Top scale legend is removed from markup
    expect(prePage).not.toContain('<div className="assessment-scale"')
    expect(postPage).not.toContain('<div className="assessment-scale"')
    // Number and description are rendered directly inside .assessment-choice
    expect(prePage).toContain('<strong>{option.value}</strong>')
    expect(prePage).toContain('<span>{option.label}</span>')
    expect(postPage).toContain('<strong>{option.value}</strong>')
    expect(postPage).toContain('<span>{option.label}</span>')
    // Assessment scale text
    const assessmentDomain = readSource('../domain/assessment.ts')
    expect(prePage).toContain('ASSESSMENT_SCALE.map((option) =>')
    expect(postPage).toContain('ASSESSMENT_SCALE.map((option) =>')
    expect(assessmentDomain).toContain('ไม่เห็นด้วยเลย')
    expect(assessmentDomain).toContain('ไม่ค่อยเห็นด้วย')
    expect(assessmentDomain).toContain('ไม่แน่ใจ / เห็นด้วยปานกลาง')
    expect(assessmentDomain).toContain('เห็นด้วย')
    expect(assessmentDomain).toContain('เห็นด้วยมากที่สุด')
    // Styles
    expect(styles).toContain('.assessment-choice strong {')
    expect(styles).toContain('.assessment-choice span {')
    expect(styles).toContain('.assessment-choice.is-selected strong {')
  })

  it('scrolls to top on mount for assessment pages and result page without repeating on every render', () => {
    const prePage = readSource('../pages/PreAssessmentPage.tsx')
    const postPage = readSource('../pages/PostAssessmentPage.tsx')
    const resultPage = readSource('../pages/ResultPage.tsx')
    expect(prePage).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })")
    expect(postPage).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })")
    expect(resultPage).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })")
  })

  it('keeps teacher lobby CTA unconfused with single primary action and collapses 8 professions guide', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    // Collapsed 8 professions guide
    expect(teacherPage).toContain('<details className="teacher-lobby-role-guide">')
    expect(teacherPage).toContain('<summary className="teacher-lobby-card-heading">')
    expect(teacherPage).toContain('8 อาชีพในเมือง')
    expect(teacherPage).toContain('ระบบจะสุ่มและกระจายบทบาทให้สมดุล (แตะเพื่อดู)')
    // Single primary CTA
    expect(teacherPage).toContain('เริ่มแบบประเมินก่อนกิจกรรม')
    expect(teacherPage).toContain('เริ่มกิจกรรม')
    // When preAssessmentOpened is false, only openPreAssessment is shown, not a competing disabled start button
    const preNotOpenedBranch = teacherPage.slice(
      teacherPage.indexOf('{room?.preAssessmentOpened ? ('),
      teacherPage.indexOf('</details>', teacherPage.indexOf('{room?.preAssessmentOpened ? (')),
    )
    expect(preNotOpenedBranch).toContain('เริ่มแบบประเมินก่อนกิจกรรม')
  })

  it('offers an explicit projector QR view while reusing the exact join URL and room code', () => {
    const qr = readSource('./JoinQrCode.tsx')
    const styles = readSource('../styles.css')
    expect(qr).toContain('ขยาย QR สำหรับนักเรียน')
    expect(qr).toContain('เข้าร่วมห้องเรียน')
    expect(qr).toContain('สแกน QR หรือกรอกรหัสห้อง')
    expect(qr.match(/value=\{joinUrl\}/g)).toHaveLength(2)
    expect(qr.match(/\{roomId\}/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
    expect(qr).toContain("event.key === 'Escape'")
    expect(qr).toContain('event.target === event.currentTarget')
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) 9.5rem')
    expect(styles).toContain('width: min(28.75rem')
  })

  it('keeps Crisis presentation teacher-owned through pre/post cutscenes without starting Q5/Q9 behind them', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const gamePage = readSource('../pages/GamePage.tsx')
    const timing = readSource('../domain/cityPresentation.ts')
    expect(teacherPage).toContain('สถานการณ์วิกฤต • เหตุการณ์')
    expect(teacherPage).toContain('ผลกระทบ ×2')
    expect(teacherPage).toContain("room.status === 'crisis-intro'")
    expect(teacherPage).toContain("room.status === 'crisis-result'")
    expect(teacherPage).toContain("crisisRevealPhase !== 'revealed'")
    expect(gamePage).toContain('สถานการณ์วิกฤต')
    expect(gamePage).toContain('ผลกระทบ ×2')
    expect(timing).toContain('title: 2_750')
    expect(timing).toContain('settle: 3_000')
  })

  it('provides full-screen civic create-room layout and bird ambience on home and create-room', () => {
    const homePage = readSource('../pages/HomePage.tsx')
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const styles = readSource('../styles.css')
    expect(homePage).toContain('<div className="game-home-birds"><CityBirdsAnimation /></div>')
    expect(teacherPage).toContain('!roomId || room?.status === \'lobby\' ? (')
    expect(teacherPage).toContain('<div className="teacher-lobby-birds"><CityBirdsAnimation /></div>')
    expect(teacherPage).toContain('teacher-lobby-page--create')
    expect(teacherPage).toContain('teacher-lobby-layout--create')
    expect(teacherPage).toContain('teacher-lobby-create-hero')
    expect(styles).toContain('.game-home-birds {')
    expect(styles).toContain('.teacher-lobby-page--create {')
    expect(styles).toContain('.teacher-lobby-create-hero {')
  })

  it('attempts fullscreen on create-room gesture and exposes fallback control in lobby header', () => {
    const teacherPage = readSource('../pages/TeacherPage.tsx')
    const styles = readSource('../styles.css')
    // createRoom immediately calls enterFullscreenSafely from user gesture
    expect(teacherPage).toContain('void enterFullscreenSafely()')
    expect(teacherPage).toContain("import { enterFullscreenSafely } from '../hooks/useFullscreen'")
    // Lobby header contains fallback FullscreenToggle
    expect(teacherPage).toContain('{roomId ? <FullscreenToggle className="teacher-lobby-fullscreen" /> : null}')
    expect(styles).toContain('.teacher-lobby-fullscreen.fullscreen-toggle-button {')
  })

  it('makes teacher lobby room code the visual hero and provides secondary Home exit on ResultPage', () => {
    const resultPage = readSource('../pages/ResultPage.tsx')
    const styles = readSource('../styles.css')

    // Room code expanded hero layout with vertical and horizontal centering
    expect(styles).toContain('.teacher-lobby-page .teacher-join-card__details {')
    expect(styles).toContain('text-align: center')
    expect(styles).toContain('clamp(4rem, 7vw, 6rem)')

    // Result page secondary Home action alongside primary actions
    expect(resultPage).toContain('className="teacher-result-home-button"')
    expect(resultPage).toContain('กลับหน้าหลัก')
    expect(resultPage).toContain('เริ่มห้องใหม่')
    expect(resultPage).toContain('onClick={goHome}')
    expect(styles).toContain('.teacher-result-home-button {')
  })
})
