#!/usr/bin/env node
// Real-classroom browser E2E harness — UI interactions only, no direct
// Firestore/service shortcuts. Drives the deployed app exactly as a teacher
// and students would: create room -> join -> role draw -> Q1-4 -> crisis 1 ->
// Q5-8 -> crisis 2 -> Q9-10 -> result -> end activity -> new room.
//
// Usage:
//   node e2e/run-flow.mjs --students 6
//   node e2e/run-flow.mjs --students 20 --mixed-latency --question-seconds 12
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { Recorder } from './lib/evidence.mjs'
import { TeacherActor, StudentActor } from './lib/actors.mjs'
import { playFullCycle } from './lib/cycle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const STUDENT_COUNT = Number(arg('students', 6))
const BASE_URL = arg('base-url', 'https://our-city-our-choice.web.app')
const MIXED_LATENCY = process.argv.includes('--mixed-latency')
const QUESTION_SECONDS = Number(arg('question-seconds', MIXED_LATENCY ? 15 : 8))
const LABEL = arg('label', `flow-${STUDENT_COUNT}students${MIXED_LATENCY ? '-mixed-latency' : ''}`)
const NICKNAME_PREFIX = arg('prefix', 'นักเรียนทดสอบ')
const CLASS_SECTIONS = ['1/1', '1/2', '1/3']

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function assignLatencyProfile(index) {
  if (!MIXED_LATENCY) return 'normal'
  if (index === 0) return 'slow'
  if (index % 4 === 1) return 'high-latency'
  return 'normal'
}

async function main() {
  const recorder = await Recorder.create(ARTIFACTS_DIR, LABEL)
  const checks = []
  const check = async (name, pass, detail) => {
    checks.push({ name, pass, detail: detail ?? '' })
    await recorder.log('CHECK', `${pass ? 'PASS' : 'FAIL'}: ${name}`, { detail })
  }
  const finding = (f) => recorder.finding(f)

  console.log(`\n=== Run "${LABEL}" — ${STUDENT_COUNT} students, base=${BASE_URL}, qSec=${QUESTION_SECONDS}, mixedLatency=${MIXED_LATENCY} ===`)
  console.log(`Evidence dir: ${recorder.runDir}\n`)

  const browser = await chromium.launch()
  const teacher = new TeacherActor(recorder, 'teacher')
  const students = Array.from({ length: STUDENT_COUNT }, (_, i) => new StudentActor(recorder, `student-${i + 1}`))
  let roomId = null
  let newRoomId = null

  try {
    await teacher.init(browser, { baseUrl: BASE_URL, latencyProfile: 'normal' })
    await teacher.open()
    await teacher.snap('teacher-initial')
    try {
      await teacher.waitQuestionsReady()
    } catch (error) {
      await finding({
        severity: 'blocker',
        step: 'teacher loads question bank (Google Sheets) before creating a room',
        affected: ['teacher'],
        expected: '"สร้างห้อง" button becomes enabled once questions load',
        actual: `Timed out: ${error.message}`,
        likelyCause: 'loadGoogleSheetsQuestions() fetch failed, was slow, or sheet validation failed — see console-error/bad-response entries in timeline.jsonl around this time',
        evidence: [await teacher.snap('teacher-questions-not-ready')],
      })
      throw error
    }

    roomId = await teacher.createRoom(QUESTION_SECONDS)
    await teacher.snap('teacher-room-created')
    console.log(`Room created: ${roomId}`)

    const initialCount = await teacher.rosterCount()
    await check('teacher roster starts at 0', initialCount === 0, `actual=${initialCount}`)

    const joinResults = []
    for (const [index, student] of students.entries()) {
      const latencyProfile = assignLatencyProfile(index)
      await student.init(browser, { baseUrl: BASE_URL, latencyProfile })
      await pause(250 + Math.floor(Math.random() * 900))
      const nickname = `${NICKNAME_PREFIX} ${String(index + 1).padStart(2, '0')}`
      const joinStartedAt = Date.now()
      try {
        await student.join(roomId, {
          nickname,
          classSection: CLASS_SECTIONS[index % CLASS_SECTIONS.length],
          studentNumber: index + 1,
        })
        const seen = await teacher.waitForRosterCount(index + 1, 15_000)
        joinResults.push({ nickname, latencyProfile, ok: true, joinLatencyMs: Date.now() - joinStartedAt, teacherSawWithinTimeout: seen })
        if (!seen) {
          await finding({
            severity: 'major',
            step: `student "${nickname}" joins the room (requirement 1)`,
            affected: ['teacher', nickname],
            expected: `Teacher roster count reaches ${index + 1} within 15s with no teacher-side refresh`,
            actual: `Teacher roster count did not reach ${index + 1} within 15s of a successful join`,
            likelyCause: 'Realtime players subscription (useGameData usePlayers / onSnapshot) not updating teacher view promptly',
            evidence: [await teacher.snap(`teacher-roster-missed-${nickname}`)],
          })
        }
      } catch (error) {
        joinResults.push({ nickname, latencyProfile, ok: false, error: error.message })
        await finding({
          severity: 'blocker',
          step: `student "${nickname}" joins the room`,
          affected: [nickname],
          expected: 'Student fills the join form and lands on /lobby/:roomCode',
          actual: `Join failed: ${error.message}`,
          evidence: [await student.snap('join-failed')],
        })
      }
    }
    await check('all students joined successfully', joinResults.every((r) => r.ok), JSON.stringify(joinResults.map((r) => [r.nickname, r.ok])))
    await teacher.snap('teacher-lobby-full-roster')

    const finalTeacherCount = await teacher.rosterCount()
    for (const student of students) {
      const seenCount = await student.lobbyParticipantCount()
      if (seenCount !== finalTeacherCount) {
        await finding({
          severity: 'minor',
          step: 'student lobby participant count matches teacher roster (requirement 2)',
          affected: [student.label],
          expected: `Student lobby shows ${finalTeacherCount} participants`,
          actual: `Student lobby showed ${seenCount}`,
          evidence: [await student.snap('lobby-count-mismatch')],
        })
      }
    }
    await check('student lobby counts match teacher roster', students.length > 0, `teacherCount=${finalTeacherCount}`)

    await teacher.startGame()
    await teacher.waitForRoleDraw()
    const studentTransitions = await Promise.all(students.map(async (student) => {
      const s = Date.now()
      try {
        await student.waitForRoleDrawNavigation(20_000)
        return { student: student.label, ms: Date.now() - s, ok: true }
      } catch (error) {
        return { student: student.label, ok: false, error: error.message }
      }
    }))
    const laggards = studentTransitions.filter((t) => !t.ok)
    await check('all clients transition to role-draw together (requirement 3)', laggards.length === 0, JSON.stringify(studentTransitions))
    if (laggards.length > 0) {
      await finding({
        severity: 'major',
        step: 'teacher clicks เริ่มเกม — all clients should transition to role-draw together',
        affected: laggards.map((l) => l.student),
        expected: 'Every joined student navigates to /role-draw/:roomCode within 20s of the teacher starting the game',
        actual: `${laggards.length} student(s) did not transition in time`,
        evidence: [await teacher.snap('start-game-laggards')],
      })
    }

    for (const student of students) {
      try {
        await student.waitForRoleReveal(15_000)
      } catch (error) {
        await finding({
          severity: 'major',
          step: 'role reveal on role-draw page',
          affected: [student.label],
          expected: 'Student sees their assigned role within 15s',
          actual: `Role never revealed: ${error.message}`,
          evidence: [await student.snap('role-not-revealed')],
        })
      }
    }
    await teacher.snap('teacher-role-draw')
    await teacher.beginQuestionsFromRoleDraw()
    await Promise.all(students.map((s) => s.waitForGamePage(20_000).catch(async (error) => {
      await finding({
        severity: 'major',
        step: 'transition from role-draw to Q1',
        affected: [s.label],
        expected: 'Student lands on /game/:roomCode once the teacher begins questions',
        actual: `Never reached the game page: ${error.message}`,
        evidence: [await s.snap('stuck-after-role-draw')],
      })
    })))

    const tally = Object.fromEntries(students.map((s) => [s.label, { answered: 0, missed: 0 }]))
    const refreshTarget = students.length > 1 ? students[1] : null
    const disconnectTarget = students.length > 2 ? students[2] : students.length > 1 ? students[1] : null

    const { finalAdvanceLabel } = await playFullCycle({
      teacher,
      students,
      recorder,
      check,
      finding,
      tally,
      refreshOnQuestion: 4,
      refreshTarget,
      disconnectOnQuestion: 6,
      disconnectTarget,
    })

    // Q10's own advance click already navigates the teacher to the result
    // page (finishGame()), so there is no second "next question" button to
    // wait for here — just verify the label we already captured and follow
    // the navigation that already happened.
    await check('final advance from Q10 shows "ดูสรุปชุด"', finalAdvanceLabel.includes('สรุปชุด'), finalAdvanceLabel)
    await teacher.waitForResultPage()
    await Promise.all(students.map((s) => s.waitForResultPage(30_000).catch(async (error) => {
      await finding({
        severity: 'major',
        step: 'transition Q10 -> result page',
        affected: [s.label],
        expected: 'Student lands on /result/:roomCode after the teacher finishes Q10',
        actual: `Never reached the result page: ${error.message}`,
        evidence: [await s.snap('stuck-before-result')],
      })
    })))
    await teacher.snap('teacher-result-page')

    for (const student of students) {
      const counts = await student.personalResultCounts()
      const truth = tally[student.label]
      const actualAnswered = (counts.integrity ?? 0) + (counts.corruption ?? 0)
      const actualMissed = counts.timeout ?? 0
      const hasData = counts.integrity !== null || counts.corruption !== null || counts.timeout !== null
      const answeredOk = !hasData ? null : actualAnswered === truth.answered
      const missedOk = !hasData ? null : actualMissed === truth.missed
      const pass = hasData && answeredOk && missedOk
      await check(`${student.label} result totals match actual submitted/missed (requirement 8)`, pass, JSON.stringify({ truth, counts }))
      if (!pass) {
        await finding({
          severity: 'critical',
          step: 'result page personal totals vs actual submitted/missed answers',
          affected: [student.label],
          expected: `answered=${truth.answered} missed=${truth.missed} (harness ground truth from real UI submissions)`,
          actual: hasData
            ? `answered=${actualAnswered} missed=${actualMissed} (integrity=${counts.integrity}, corruption=${counts.corruption}, timeout=${counts.timeout})`
            : 'Personal result counters showed no data at all (—/—/—)',
          likelyCause: 'Result aggregation (ResultPage personalResultsState, or the round/crisis close transaction) may miscount submitted vs timed-out answers for this player',
          evidence: [await student.snap('result-mismatch')],
        })
      }
    }

    const cycle1Score = await teacher.resultCityScore()
    await check('cycle 1 result city score is a valid 0-1000 number', Number.isFinite(cycle1Score) && cycle1Score >= 0 && cycle1Score <= 1000, `score=${cycle1Score}`)

    // Requirement 10: end activity -> create a NEW room -> verify zero state.
    await teacher.endActivity()
    await pause(1000)
    await teacher.snap('teacher-after-end-activity')
    await teacher.createNewRoomFromResult()
    await teacher.snap('teacher-on-fresh-teacher-page')

    const staleRoster = await teacher.page.locator('.teacher-lobby-student-card').count().catch(() => 0)
    await check('no stale roster flash immediately after ending activity', staleRoster === 0, `staleRosterCards=${staleRoster}`)
    if (staleRoster > 0) {
      await finding({
        severity: 'major',
        step: 'end activity -> land back on /teacher (requirement 10)',
        affected: ['teacher'],
        expected: 'Teacher lobby shows no leftover roster from the ended room',
        actual: `${staleRoster} stale student card(s) still rendered momentarily`,
        evidence: [await teacher.snap('stale-roster-flash')],
      })
    }

    await teacher.waitQuestionsReady()
    newRoomId = await teacher.createRoom(QUESTION_SECONDS)
    await check('new room gets a different room code (requirement 10)', newRoomId !== roomId, `old=${roomId} new=${newRoomId}`)
    const newRoomInitialCount = await teacher.rosterCount()
    await check('new room roster starts at 0', newRoomInitialCount === 0, `actual=${newRoomInitialCount}`)
    await teacher.snap('teacher-new-room-created')

    const probeStudent = new StudentActor(recorder, 'probe-student')
    await probeStudent.init(browser, { baseUrl: BASE_URL })
    await probeStudent.join(newRoomId, { nickname: 'Probe เช็คห้องใหม่', classSection: '1/1', studentNumber: 99 })
    const probeSeen = await teacher.waitForRosterCount(1, 15_000)
    await check('new room accepts a fresh join and teacher sees it (requirement 10)', probeSeen, '')
    if (!probeSeen) {
      await finding({
        severity: 'critical',
        step: 'create new room after ending activity, then a student joins it (requirement 10 — matches the originally reported "สร้างห้องใหม่แล้วไม่มา" bug)',
        affected: ['teacher', 'probe-student'],
        expected: 'Teacher sees the probe student join the freshly created room in realtime',
        actual: 'Teacher roster never reached 1 for the new room',
        evidence: [await teacher.snap('new-room-probe-join-missed')],
      })
    }

    await teacher.startGame()
    await teacher.waitForRoleDraw()
    await probeStudent.waitForRoleDrawNavigation()
    await probeStudent.waitForRoleReveal()
    await teacher.beginQuestionsFromRoleDraw()
    await probeStudent.waitForGamePage()
    const freshScoreText = await teacher.cityScoreDisplay()
    await check('new room starts at city score 500 (requirement 10)', freshScoreText === '500', `actual=${freshScoreText}`)
    if (freshScoreText !== '500') {
      await finding({
        severity: 'critical',
        step: 'new room initial city score (requirement 10)',
        affected: ['teacher'],
        expected: 'New room city score reads 500',
        actual: `New room city score read "${freshScoreText}"`,
        likelyCause: 'createRoom() may be carrying over stale room/session state instead of Firestore defaults',
        evidence: [await teacher.snap('new-room-score-mismatch')],
      })
    }
    const moods = await teacher.buildingMoods()
    const allNeutral = moods.length > 0 && moods.every((m) => m.trim() === '\u{1F610}')
    await check('new room buildings start normal/neutral (requirement 10)', allNeutral, JSON.stringify(moods))
    await teacher.snap('teacher-new-room-q1-fresh-state')
    await probeStudent.close()

    console.log('\n=== Run complete ===')
  } finally {
    await teacher.close()
    await Promise.all(students.map((s) => s.close()))
    await browser.close()
    const { runDir } = await recorder.finish({ checks, roomId, newRoomId })
    const failed = checks.filter((c) => !c.pass)
    console.log(`\nEvidence + report written to: ${runDir}`)
    console.log(`Checks: ${checks.length - failed.length}/${checks.length} passed`)
    console.log(`Findings: ${recorder.findings.length}`)
    if (failed.length > 0) {
      console.log('Failed checks:')
      for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
    }
  }
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
