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

describe('firebaseClassroomService.terminateActivity — explicit emergency lifecycle', () => {
  const source = readSource('./firebaseClassroomService.ts')
  const start = source.indexOf('async terminateActivity(')
  const terminateSource = source.slice(start)

  it('authorizes the teacher, accepts only active states, clears timing, and leaves normal endActivity untouched', () => {
    expect(start).toBeGreaterThan(-1)
    expect(terminateSource).toContain('assertTeacher(room, teacherSessionId)')
    expect(terminateSource).toContain("if (room.status === 'finished') return")
    expect(terminateSource).toContain('if (!canEmergencyTerminate(room.status)) throw new Error')
    expect(terminateSource).toContain("status: 'finished', questionStartedAt: null, questionDeadlineAt: null")

    const normalStart = source.indexOf('async endActivity(')
    const normalEnd = source.indexOf('async terminateActivity(', normalStart)
    const normalSource = source.slice(normalStart, normalEnd)
    expect(normalSource).toContain("if (room.status !== 'game-result') throw new Error")
  })
})

describe('firebaseClassroomService — central city layout persistence', () => {
  const source = readSource('./firebaseClassroomService.ts')

  it('loads normal gameplay layout from one current document, never 105 listeners or Draft', () => {
    const start = source.indexOf('subscribePublishedCityLayout(')
    const end = source.indexOf('subscribeCityLayoutDraft(', start)
    const subscription = source.slice(start, end)
    expect(subscription).toContain("doc(db, 'cityLayoutPublished/current')")
    expect(subscription).toContain('parseCityLayoutPublishedSnapshot(snapshot.data())')
    expect(subscription).not.toContain("collection(db, 'cityLayoutDraft')")
  })

  it('validates all placements before atomically writing immutable version plus current pointer', () => {
    const start = source.indexOf('async publishCityLayout(')
    const end = source.indexOf('async rollbackCityLayout(', start)
    const publish = source.slice(start, end)
    expect(publish).toContain('if (!isCompleteCityLayout(placements))')
    expect(publish).toContain('batch.set(doc(db, `cityLayoutVersions/${versionId}`), writeValue)')
    expect(publish).toContain("batch.set(doc(db, 'cityLayoutPublished/current'), writeValue)")
    expect(publish).toContain('await batch.commit()')
  })

  it('rolls current back from an existing immutable version without writing the historical document', () => {
    const start = source.indexOf('async rollbackCityLayout(')
    const end = source.indexOf('async createRoom(', start)
    const rollback = source.slice(start, end)
    expect(rollback).toContain('getDoc(doc(db, `cityLayoutVersions/${versionId}`))')
    expect(rollback).toContain("setDoc(doc(db, 'cityLayoutPublished/current')")
    expect(rollback).toContain('storedVersion?.schemaVersion === 1 ? 1 : CITY_LAYOUT_SCHEMA_VERSION')
    expect(rollback).toContain('storedSchemaVersion === 1 ? storedVersion?.placements : version.placements')
    expect(rollback).not.toContain('cityLayoutVersions/${versionId}`), {')
  })
})

describe('firebaseClassroomService.publishLearningEvidence — safe lifecycle aggregate', () => {
  const source = readSource('./firebaseClassroomService.ts')
  const start = source.indexOf('async publishLearningEvidence(')
  const end = source.indexOf('subscribeAssessments(', start)
  const publishSource = source.slice(start, end)

  it('requires teacher ownership and writes only the whitelist aggregate field at any classroom stage', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(publishSource).toContain('const room = await requireRoom(roomId)')
    expect(publishSource).toContain('assertTeacher(room, teacherSessionId)')
    expect(publishSource).not.toContain("room.status !== 'finished'")
    expect(publishSource).toContain('{ publicLearningEvidence: evidence }')
    expect(publishSource).not.toMatch(/assessments|responses|reflection|notes|playerId|ownerUid/)
  })
})
