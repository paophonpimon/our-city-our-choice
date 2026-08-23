import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// This service talks to real Firestore and has no emulator-backed unit
// harness (unlike DemoClassroomGameService), so - matching this codebase's
// existing convention for verifying source-level invariants without a DOM
// or live backend (see src/components/classroomUi.test.ts) - these are
// readSource assertions pinning the exact ordering guarantees the Q6
// critical-path fix must preserve: reordering two independent reads to run
// concurrently with requireRoom must never let authorization, idempotency,
// personal-result-before-room-transition, or round/room write atomicity
// slip out of order.
const readSource = (relativePath: string): string => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('firebaseClassroomService.closeQuestion — critical-path fix must not weaken existing invariants', () => {
  const source = readSource('./firebaseClassroomService.ts')
  const start = source.indexOf('async closeQuestion(')
  const end = source.indexOf('async openNextQuestion(')
  if (start === -1 || end === -1 || end <= start) throw new Error('could not isolate closeQuestion source for assertions')
  const closeQuestionSource = source.slice(start, end)

  it('fetches players and answers concurrently with requireRoom instead of after it (the fix itself)', () => {
    const promiseAllIndex = closeQuestionSource.indexOf('await Promise.all([')
    const requireRoomIndex = closeQuestionSource.indexOf('requireRoom(roomId),')
    const playersReadIndex = closeQuestionSource.indexOf('getDocs(collection(db, `${classroomPaths.room(roomId)}/players`))')
    const answersReadIndex = closeQuestionSource.indexOf('getDocs(collection(db, `${classroomPaths.room(roomId)}/answers`))')
    expect(promiseAllIndex).toBeGreaterThan(-1)
    expect(requireRoomIndex).toBeGreaterThan(promiseAllIndex)
    expect(playersReadIndex).toBeGreaterThan(promiseAllIndex)
    expect(answersReadIndex).toBeGreaterThan(promiseAllIndex)
  })

  it('still checks authorization before any fetched player/answer data is used for scoring', () => {
    const authIndex = closeQuestionSource.indexOf('assertTeacher(room, teacherSessionId)')
    const scoringIndex = closeQuestionSource.indexOf('scoreClassroomRound(')
    expect(authIndex).toBeGreaterThan(-1)
    expect(scoringIndex).toBeGreaterThan(authIndex)
  })

  it('still short-circuits on an already-finalized round before any write happens (idempotency)', () => {
    const idempotencyIndex = closeQuestionSource.indexOf('if (existing.exists()) return mapRound(existing.data())')
    const firstWriteIndex = closeQuestionSource.indexOf('await writePersonalResults(roomId, personalResults)')
    expect(idempotencyIndex).toBeGreaterThan(-1)
    expect(firstWriteIndex).toBeGreaterThan(idempotencyIndex)
  })

  it('still writes personal results before committing the round/room batch - students must never observe round-result before their personal outcome exists', () => {
    const writePersonalIndex = closeQuestionSource.indexOf('await writePersonalResults(roomId, personalResults)')
    const batchCommitIndex = closeQuestionSource.indexOf('await batch.commit()')
    expect(writePersonalIndex).toBeGreaterThan(-1)
    expect(batchCommitIndex).toBeGreaterThan(writePersonalIndex)
  })

  it('still commits the round result and the room status transition atomically in a single batch, not separate writes', () => {
    expect(closeQuestionSource).toContain('const batch = writeBatch(db)')
    expect(closeQuestionSource).toContain('batch.set(roundRef,')
    expect(closeQuestionSource).toContain("status: 'round-result'")
    expect(closeQuestionSource).toContain('await batch.commit()')
  })

  it('does not parallelize writePersonalResults with the round/room batch commit - that would let the room announce round-result with personal results still missing', () => {
    // A too-aggressive optimization would run these two independent writes
    // together; the codebase's crisis-close path is deliberately left
    // untouched and keeps the same sequential guarantee.
    expect(closeQuestionSource).not.toMatch(/Promise\.all\(\[\s*writePersonalResults/)
  })
})

describe('firebaseClassroomService.endActivity — assessment lifecycle guard', () => {
  const source = readSource('./firebaseClassroomService.ts')
  const start = source.indexOf('async endActivity(')
  const endActivitySource = source.slice(start)

  it('allows only game-result → finished and treats an already-finished room as a safe no-op', () => {
    expect(start).toBeGreaterThan(-1)
    expect(endActivitySource).toContain("if (room.status === 'finished') return")
    expect(endActivitySource).toContain("if (room.status !== 'game-result') throw new Error")
    expect(endActivitySource).toContain('await runTransaction(db, async (transaction) => {')
    expect(endActivitySource).toContain('transaction.update(roomRef, {')
    expect(endActivitySource).toContain("status: 'finished'")
  })
})
