#!/usr/bin/env node
// Requirement 9: "Continue City" keeps the same city's score/buildings and
// rotates roles correctly. Plays one small, fast full cycle for real, then
// clicks "เล่นต่อเพื่อพัฒนาเมือง" and verifies cycle 2's role-draw + Q1 state.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { Recorder } from './lib/evidence.mjs'
import { TeacherActor, StudentActor } from './lib/actors.mjs'
import { playFullCycle } from './lib/cycle.mjs'
import { assertProductionNeverAllowed, resolveBaseUrl } from './lib/target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const STUDENT_COUNT = Number(arg('students', 3))
const BASE_URL = resolveBaseUrl(process.argv)
// A full 10-question + 2-crisis cycle plus a second role-draw is a
// stress/full-QA scenario, not a smoke check — no --smoke bypass;
// production is refused unconditionally. Use --target staging for this.
assertProductionNeverAllowed({ baseUrl: BASE_URL, context: 'continue-city-flow (full-cycle role-rotation scenario)' })
const QUESTION_SECONDS = Number(arg('question-seconds', 5))
const LABEL = arg('label', 'continue-city')
const CLASS_SECTIONS = ['1/1', '1/2', '1/3']

async function main() {
  const recorder = await Recorder.create(ARTIFACTS_DIR, LABEL)
  const checks = []
  const check = async (name, pass, detail) => {
    checks.push({ name, pass, detail: detail ?? '' })
    await recorder.log('CHECK', `${pass ? 'PASS' : 'FAIL'}: ${name}`, { detail })
  }
  const finding = (f) => recorder.finding(f)

  console.log(`\n=== Run "${LABEL}" — ${STUDENT_COUNT} students, base=${BASE_URL} ===`)
  console.log(`Evidence dir: ${recorder.runDir}\n`)

  const browser = await chromium.launch()
  const teacher = new TeacherActor(recorder, 'teacher')
  const students = Array.from({ length: STUDENT_COUNT }, (_, i) => new StudentActor(recorder, `student-${i + 1}`))
  let roomId = null

  try {
    await teacher.init(browser, { baseUrl: BASE_URL })
    await teacher.open()
    await teacher.waitQuestionsReady()
    roomId = await teacher.createRoom(QUESTION_SECONDS)
    console.log(`Room created: ${roomId}`)

    for (const [index, student] of students.entries()) {
      await student.init(browser, { baseUrl: BASE_URL })
      await student.join(roomId, {
        nickname: `เมืองต่อเนื่อง ${String(index + 1).padStart(2, '0')}`,
        classSection: CLASS_SECTIONS[index % CLASS_SECTIONS.length],
        studentNumber: index + 1,
      })
    }
    await teacher.waitForRosterCount(students.length, 15_000)

    await teacher.startGame()
    await teacher.waitForRoleDraw()
    await Promise.all(students.map((s) => s.waitForRoleDrawNavigation(20_000)))
    const cycle1Roles = {}
    for (const student of students) cycle1Roles[student.label] = await student.waitForRoleReveal(15_000)
    await recorder.log('FLOW', 'cycle 1 roles', cycle1Roles)
    await teacher.beginQuestionsFromRoleDraw()
    await Promise.all(students.map((s) => s.waitForGamePage(20_000)))

    const tally = Object.fromEntries(students.map((s) => [s.label, { answered: 0, missed: 0 }]))
    await playFullCycle({ teacher, students, recorder, check, finding, tally })

    await teacher.waitForResultPage()
    await Promise.all(students.map((s) => s.waitForResultPage(30_000)))
    await teacher.snap('teacher-cycle1-result')
    const cycle1Score = await teacher.resultCityScore()
    await check('cycle 1 finished with a valid score', Number.isFinite(cycle1Score) && cycle1Score >= 0 && cycle1Score <= 1000, `score=${cycle1Score}`)
    console.log(`Cycle 1 final score: ${cycle1Score}`)

    // ---- Continue City ----
    await teacher.continueCity()
    await teacher.waitForRoleDraw()
    await Promise.all(students.map((s) => s.waitForRoleDrawNavigation(20_000).catch(async (error) => {
      await finding({
        severity: 'major',
        step: 'continue city -> students transition to cycle 2 role-draw (requirement 9)',
        affected: [s.label],
        expected: 'Student navigates to /role-draw/:roomCode for the new cycle',
        actual: `Never transitioned: ${error.message}`,
        evidence: [await s.snap('continue-city-role-draw-missed')],
      })
    })))
    const cycle2Roles = {}
    for (const student of students) {
      cycle2Roles[student.label] = await student.waitForRoleReveal(15_000).catch(() => null)
    }
    await teacher.snap('teacher-cycle2-role-draw')
    await recorder.log('FLOW', 'cycle 2 roles', cycle2Roles)

    const rotationFailures = students.filter((s) => cycle2Roles[s.label] && cycle2Roles[s.label] === cycle1Roles[s.label])
    await check('roles rotate between cycle 1 and cycle 2 (requirement 9)', rotationFailures.length === 0, JSON.stringify({ cycle1Roles, cycle2Roles }))
    if (rotationFailures.length > 0) {
      await finding({
        severity: 'major',
        step: 'role rotation on continue city (requirement 9)',
        affected: rotationFailures.map((s) => s.label),
        expected: 'Every student receives a different role in cycle 2 than cycle 1 (balanced rotation)',
        actual: `${rotationFailures.length} student(s) kept the same role: ${JSON.stringify(rotationFailures.map((s) => [s.label, cycle1Roles[s.label]]))}`,
        evidence: [await teacher.snap('role-rotation-failure')],
      })
    }

    await teacher.beginQuestionsFromRoleDraw()
    await Promise.all(students.map((s) => s.waitForGamePage(20_000)))
    const cycle2StartScoreText = await teacher.cityScoreDisplay()
    const cycle2StartScore = Number(cycle2StartScoreText)
    const scorePersisted = Number.isFinite(cycle2StartScore) && cycle2StartScore === Math.round(cycle1Score)
    await check('city score carries over into cycle 2 (requirement 9)', scorePersisted, `cycle1Final=${cycle1Score} cycle2Start=${cycle2StartScoreText}`)
    if (!scorePersisted) {
      await finding({
        severity: 'critical',
        step: 'continue city preserves city score into the next cycle (requirement 9)',
        affected: ['teacher'],
        expected: `Cycle 2 Q1 city score reads ${Math.round(cycle1Score)} (same as cycle 1's final score)`,
        actual: `Cycle 2 Q1 city score read "${cycle2StartScoreText}"`,
        likelyCause: 'continueCityProgress() may be resetting cityScore/buildingLevels instead of carrying them forward',
        evidence: [await teacher.snap('continue-city-score-mismatch')],
      })
    }
    await teacher.snap('teacher-cycle2-q1')

    console.log('\n=== Run complete ===')
  } finally {
    await teacher.close()
    await Promise.all(students.map((s) => s.close()))
    await browser.close()
    const { runDir } = await recorder.finish({ checks, roomId })
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
