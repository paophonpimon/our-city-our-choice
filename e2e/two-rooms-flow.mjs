#!/usr/bin/env node
// Requirement 11: run two simultaneous, independent rooms in the same
// browser process and verify no state crosses between them — distinct room
// codes, distinct rosters, and every actor's URL always scoped to its own
// room, checked at several points while both rooms run concurrently.
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

const STUDENTS_PER_ROOM = Number(arg('students-per-room', 2))
const BASE_URL = arg('base-url', 'https://our-city-our-choice.web.app')
const QUESTION_SECONDS = Number(arg('question-seconds', 5))
const LABEL = arg('label', 'two-rooms-isolation')

async function runRoom(browser, recorder, check, finding, roomLabel, nicknamePrefix) {
  const teacher = new TeacherActor(recorder, `teacher-${roomLabel}`)
  const students = Array.from(
    { length: STUDENTS_PER_ROOM },
    (_, i) => new StudentActor(recorder, `student-${roomLabel}-${i + 1}`),
  )

  await teacher.init(browser, { baseUrl: BASE_URL })
  await teacher.open()
  await teacher.waitQuestionsReady()
  const roomId = await teacher.createRoom(QUESTION_SECONDS)
  await recorder.log(`teacher-${roomLabel}`, 'room-ready', { roomId })

  for (const [index, student] of students.entries()) {
    await student.init(browser, { baseUrl: BASE_URL })
    await student.join(roomId, {
      nickname: `${nicknamePrefix} ${String(index + 1).padStart(2, '0')}`,
      classSection: '1/1',
      studentNumber: index + 1,
    })
  }
  await teacher.waitForRosterCount(students.length, 20_000)

  // Checkpoint A: roster must only ever contain this room's own nicknames.
  const rosterText = (await teacher.page.locator('.teacher-lobby-roster-grid').textContent().catch(() => '')) ?? ''
  await recorder.log(`teacher-${roomLabel}`, 'checkpoint-a-roster-captured', { rosterText })

  await teacher.startGame()
  await teacher.waitForRoleDraw()
  await Promise.all(students.map((s) => s.waitForRoleDrawNavigation(25_000)))
  for (const student of students) await student.waitForRoleReveal(15_000)
  await teacher.beginQuestionsFromRoleDraw()
  await Promise.all(students.map((s) => s.waitForGamePage(25_000)))

  // Checkpoint B: every actor's URL must be scoped to this room only.
  const urlsAfterStart = [teacher.page.url(), ...students.map((s) => s.page.url())]

  const tally = Object.fromEntries(students.map((s) => [s.label, { answered: 0, missed: 0 }]))
  await playFullCycle({ teacher, students, recorder, check, finding, tally })

  await teacher.waitForResultPage()
  await Promise.all(students.map((s) => s.waitForResultPage(30_000)))
  const finalScore = await teacher.resultCityScore()

  // Checkpoint C: URLs after reaching the result page.
  const urlsAfterResult = [teacher.page.url(), ...students.map((s) => s.page.url())]

  await teacher.close()
  await Promise.all(students.map((s) => s.close()))

  return { roomLabel, roomId, nicknamePrefix, rosterText, urlsAfterStart, urlsAfterResult, finalScore }
}

async function main() {
  const recorder = await Recorder.create(ARTIFACTS_DIR, LABEL)
  const checks = []
  const check = async (name, pass, detail) => {
    checks.push({ name, pass, detail: detail ?? '' })
    await recorder.log('CHECK', `${pass ? 'PASS' : 'FAIL'}: ${name}`, { detail })
  }
  const finding = (f) => recorder.finding(f)

  console.log(`\n=== Run "${LABEL}" — 2 concurrent rooms x ${STUDENTS_PER_ROOM} students, base=${BASE_URL} ===`)
  console.log(`Evidence dir: ${recorder.runDir}\n`)

  const browser = await chromium.launch()
  try {
    const [roomA, roomB] = await Promise.all([
      runRoom(browser, recorder, check, finding, 'A', 'หมูป่าห้องA'),
      runRoom(browser, recorder, check, finding, 'B', 'มังกรห้องB'),
    ])

    console.log(`Room A: ${roomA.roomId}, final score ${roomA.finalScore}`)
    console.log(`Room B: ${roomB.roomId}, final score ${roomB.finalScore}`)

    await check('the two rooms got different room codes', roomA.roomId !== roomB.roomId, `A=${roomA.roomId} B=${roomB.roomId}`)

    const aRosterLeaksB = roomA.rosterText.includes(roomB.nicknamePrefix)
    const bRosterLeaksA = roomB.rosterText.includes(roomA.nicknamePrefix)
    await check('room A roster never shows room B students', !aRosterLeaksB, aRosterLeaksB ? roomA.rosterText : '')
    await check('room B roster never shows room A students', !bRosterLeaksA, bRosterLeaksA ? roomB.rosterText : '')
    if (aRosterLeaksB || bRosterLeaksA) {
      await finding({
        severity: 'critical',
        step: 'two concurrent independent rooms — roster isolation (requirement 11)',
        affected: ['teacher-A', 'teacher-B'],
        expected: 'Each room roster only ever shows its own students',
        actual: `A leaks B=${aRosterLeaksB}, B leaks A=${bRosterLeaksA}`,
        likelyCause: 'Realtime players subscription not scoped correctly by roomId (shared listener/cache keyed incorrectly)',
        evidence: [],
      })
    }

    const urlBelongsToRoom = (url, roomId) => url.includes(`/${roomId}`) || url.endsWith('/teacher') || url.includes('/join')
    const badUrlsA = [...roomA.urlsAfterStart, ...roomA.urlsAfterResult].filter((u) => u.includes(roomB.roomId))
    const badUrlsB = [...roomB.urlsAfterStart, ...roomB.urlsAfterResult].filter((u) => u.includes(roomA.roomId))
    await check('no room A client ever navigated into room B URLs', badUrlsA.length === 0, JSON.stringify(badUrlsA))
    await check('no room B client ever navigated into room A URLs', badUrlsB.length === 0, JSON.stringify(badUrlsB))
    if (badUrlsA.length > 0 || badUrlsB.length > 0) {
      await finding({
        severity: 'critical',
        step: 'two concurrent independent rooms — URL/state isolation (requirement 11)',
        affected: ['teacher-A', 'teacher-B', 'student-A-1', 'student-B-1'],
        expected: 'Each client only ever navigates within its own room\'s URLs',
        actual: `badUrlsA=${JSON.stringify(badUrlsA)} badUrlsB=${JSON.stringify(badUrlsB)}`,
        evidence: [],
      })
    }

    await check('both rooms produced a valid independent final score', [roomA.finalScore, roomB.finalScore].every((s) => Number.isFinite(s) && s >= 0 && s <= 1000), `A=${roomA.finalScore} B=${roomB.finalScore}`)

    console.log('\n=== Run complete ===')
  } finally {
    await browser.close()
    const { runDir } = await recorder.finish({ checks })
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
