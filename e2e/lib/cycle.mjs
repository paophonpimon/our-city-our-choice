// Shared "play one full game cycle" driver: Q1-4 -> crisis 1 -> Q5-8 ->
// crisis 2 -> Q9-10. Used by run-flow.mjs, continue-city-flow.mjs, and
// two-rooms-flow.mjs so all three exercise the exact same real UI flow.
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runQuestion({ teacher, students, recorder, check, finding, tally, questionNumber, refreshTarget, disconnectTarget }) {
  await recorder.log('FLOW', `--- Question ${questionNumber} ---`)
  await teacher.snap(`teacher-q${questionNumber}-start`)

  if (disconnectTarget) await disconnectTarget.goOffline()

  const results = await Promise.all(students.map(async (student, index) => {
    if (student === refreshTarget) await student.reload()
    if (student === disconnectTarget) {
      await pause(2500)
      await student.goOnline()
    }
    const result = await student.answerQuestionIfOpen({ choiceIndex: index % 2 })
    return { student: student.label, ...result }
  }))
  for (const r of results) tally[r.student][r.submitted ? 'answered' : 'missed'] += 1

  const failedSubmits = results.filter((r) => !r.submitted)
  await check(`Q${questionNumber}: every active student can submit (requirement 4)`, failedSubmits.length === 0, JSON.stringify(results))
  if (failedSubmits.length > 0) {
    await finding({
      severity: 'major',
      step: `Question ${questionNumber}: student submits an answer`,
      affected: failedSubmits.map((f) => f.student),
      expected: 'Every active student can click a choice and see the "ส่งคำตอบแล้ว" confirmation',
      actual: `${failedSubmits.length} student(s) could not submit: ${JSON.stringify(failedSubmits)}`,
      evidence: [await teacher.snap(`teacher-q${questionNumber}-submit-failures`)],
    })
  }

  const progressLabel = await teacher.answerProgressLabel()
  await recorder.log('teacher', `Q${questionNumber} progress label (requirement 5)`, { progressLabel })

  const advanceLabel = await teacher.waitAndAdvanceQuestion(90_000)

  const nextExpected = questionNumber + 1
  await pause(1500)
  for (const student of students) {
    if (await student.isStuckOnQuestion(nextExpected)) {
      await finding({
        severity: 'major',
        step: `advance from Q${questionNumber} to Q${nextExpected} (requirement 7)`,
        affected: [student.label],
        expected: `Student sees question number ${nextExpected}`,
        actual: 'Student still shows a different/old question number',
        evidence: [await student.snap(`stuck-after-q${questionNumber}`)],
      })
    }
  }
  return { advanceLabel }
}

export async function runCrisis({ teacher, students, recorder, check, finding, tally, label }) {
  await recorder.log('FLOW', `--- ${label} ---`)
  await teacher.snap(`teacher-${label}-intro`)
  await teacher.beginCrisis()
  await teacher.snap(`teacher-${label}-playing`)

  const results = await Promise.all(students.map(async (student, index) => {
    const result = await student.answerCrisisIfOpen({ choiceIndex: index % 2 })
    return { student: student.label, ...result }
  }))
  for (const r of results) tally[r.student][r.submitted ? 'answered' : 'missed'] += 1

  const failedSubmits = results.filter((r) => !r.submitted)
  await check(`${label}: every active student can submit (requirement 4)`, failedSubmits.length === 0, JSON.stringify(results))
  if (failedSubmits.length > 0) {
    await finding({
      severity: 'major',
      step: `${label}: student submits a crisis decision`,
      affected: failedSubmits.map((f) => f.student),
      expected: 'Every active student can submit a crisis decision',
      actual: `${failedSubmits.length} student(s) could not submit: ${JSON.stringify(failedSubmits)}`,
      evidence: [await teacher.snap(`teacher-${label}-submit-failures`)],
    })
  }

  await teacher.closeCrisisIfAvailable()
  await teacher.waitForCrisisResult(90_000)
  await teacher.snap(`teacher-${label}-result`)
  await teacher.continueAfterCrisis()
}

export async function playFullCycle({
  teacher,
  students,
  recorder,
  check,
  finding,
  tally,
  refreshOnQuestion = null,
  refreshTarget = null,
  disconnectOnQuestion = null,
  disconnectTarget = null,
}) {
  const SEQUENCE = [1, 2, 3, 4, 'crisis-1', 5, 6, 7, 8, 'crisis-2', 9, 10]
  let finalAdvanceLabel = ''
  for (const step of SEQUENCE) {
    if (step === 'crisis-1' || step === 'crisis-2') {
      await runCrisis({ teacher, students, recorder, check, finding, tally, label: step })
    } else {
      const { advanceLabel } = await runQuestion({
        teacher,
        students,
        recorder,
        check,
        finding,
        tally,
        questionNumber: step,
        refreshTarget: step === refreshOnQuestion ? refreshTarget : null,
        disconnectTarget: step === disconnectOnQuestion ? disconnectTarget : null,
      })
      if (step === 10) finalAdvanceLabel = advanceLabel
    }
  }
  return { finalAdvanceLabel }
}
