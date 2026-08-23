import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { computeChoiceOrderByQuestion, createRoomQuestionSnapshot } from '../src/domain/classroomQuestions'
import { createBalancedRoleOffsets, createRoleRotation } from '../src/domain/ourCity'
import { createTrustedQuestions } from '../src/test/classroomFixtures'

const PROJECT_ID = 'our-city-our-choice'
const TEACHER_UID = 'teacher-1'
const STUDENT_UID = 'student-1'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

const minimalRoomDoc = (roomId: string, overrides: Record<string, unknown> = {}) => ({
  roomId,
  teacherSessionId: TEACHER_UID,
  status: 'lobby',
  gameCycle: 0,
  completedGameCount: 0,
  currentQuestionNumber: 0,
  currentCrisisEventIndex: 0,
  currentCrisisEventId: null,
  questionDurationSec: 30,
  questionStartedAt: null,
  questionDeadlineAt: null,
  lockedPlayerCount: 0,
  cityScore: 500,
  cityLevel: 'neutral',
  buildingLevels: { municipality: 0, hospital: 0, police: 0, construction: 0, market: 0, school: 0, newsAgency: 0 },
  integrityTotal: 0,
  corruptionTotal: 0,
  timeoutTotal: 0,
  roleRotation: [],
  updatedAt: serverTimestamp(),
  ...overrides,
})

// Builds the exact question document shape startGame() writes for one real
// question, using the actual production domain functions (not a hand-rolled
// approximation) — including a real, non-empty choiceOrder.
const buildRealQuestionDocs = () => {
  const snapshot = createRoomQuestionSnapshot('TEST', createTrustedQuestions(), 100)
  const players = [
    { playerId: STUDENT_UID, roleId: null, roleHistory: [], roleOffset: null },
  ]
  const roleRotation = createRoleRotation()
  const offsets = createBalancedRoleOffsets(players.map((player) => player.playerId))
  const choiceOrderByQuestion = computeChoiceOrderByQuestion(snapshot.trustedQuestions, players, roleRotation, offsets, 'TEST')
  const docs = snapshot.publicQuestions.map((question) => ({
    questionId: question.questionId,
    roleId: question.roleId,
    questionNumber: question.questionNumber,
    prompt: question.prompt,
    choices: question.choices,
    choiceOrder: choiceOrderByQuestion[question.questionId] ?? {},
    imageUrl: question.imageUrl,
  }))
  return { snapshot, docs, roleRotation }
}

describe('question document shape accepted/rejected by rules', () => {
  it('accepts the exact document shape startGame() writes, including a real non-empty choiceOrder', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/TEST'), minimalRoomDoc('TEST'))
    })
    const { docs } = buildRealQuestionDocs()
    const question = docs[0]
    if (!question) throw new Error('no question built')
    expect(Object.keys(question.choiceOrder).length).toBeGreaterThan(0)

    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(setDoc(doc(teacherDb, `rooms/TEST/questions/${question.questionId}`), question))
  })

  it('rejects a question document carrying integrityChoiceId', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/TEST'), minimalRoomDoc('TEST'))
    })
    const { docs } = buildRealQuestionDocs()
    const question = docs[0]
    if (!question) throw new Error('no question built')

    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertFails(
      setDoc(doc(teacherDb, `rooms/TEST/questions/${question.questionId}`), {
        ...question,
        integrityChoiceId: `${question.questionId}-c1`,
      }),
    )
  })

  it('rejects a question document carrying corruptionChoiceId', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/TEST'), minimalRoomDoc('TEST'))
    })
    const { docs } = buildRealQuestionDocs()
    const question = docs[0]
    if (!question) throw new Error('no question built')

    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertFails(
      setDoc(doc(teacherDb, `rooms/TEST/questions/${question.questionId}`), {
        ...question,
        corruptionChoiceId: `${question.questionId}-c2`,
      }),
    )
  })
})

describe('answer submission still works against the new question shape', () => {
  it('accepts a normal, on-time, on-choice answer submission', async () => {
    const { docs } = buildRealQuestionDocs()
    const question = docs.find((candidate) => candidate.roleId != null)
    if (!question) throw new Error('no question built')

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'rooms/TEST'), minimalRoomDoc('TEST', {
        status: 'playing',
        currentQuestionNumber: question.questionNumber,
        questionDeadlineAt: Timestamp.fromMillis(Date.now() + 60_000),
      }))
      await setDoc(doc(db, `rooms/TEST/questions/${question.questionId}`), question)
      await setDoc(doc(db, `rooms/TEST/players/${STUDENT_UID}`), {
        playerId: STUDENT_UID,
        nickname: 'Test Student',
        nicknameKey: 'test student',
        classSection: '1/1',
        studentNumber: 1,
        ownerUid: STUDENT_UID,
        roleId: question.roleId,
        roleHistory: [question.roleId],
        roleOffset: 0,
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      })
    })

    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const answerId = `0::${STUDENT_UID}::${question.questionId}`
    await assertSucceeds(
      setDoc(doc(studentDb, `rooms/TEST/answers/${answerId}`), {
        answerId,
        roomId: 'TEST',
        playerId: STUDENT_UID,
        ownerUid: STUDENT_UID,
        gameCycle: 0,
        questionNumber: question.questionNumber,
        questionId: question.questionId,
        choiceId: question.choices[0].id,
        submittedAt: serverTimestamp(),
      }),
    )
  })
})

describe('hard timeout lock is enforced server-side, not just by the client UI', () => {
  it('rejects an answer submitted after questionDeadlineAt has passed, even with a correct choice and role', async () => {
    const { docs } = buildRealQuestionDocs()
    const question = docs.find((candidate) => candidate.roleId != null)
    if (!question) throw new Error('no question built')

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'rooms/TEST'), minimalRoomDoc('TEST', {
        status: 'playing',
        currentQuestionNumber: question.questionNumber,
        // The deadline is already in the past — this is the exact case a
        // late client (clock skew, slow network, queued click) must never
        // be able to bypass no matter what the disabled UI button did.
        questionDeadlineAt: Timestamp.fromMillis(Date.now() - 1_000),
      }))
      await setDoc(doc(db, `rooms/TEST/questions/${question.questionId}`), question)
      await setDoc(doc(db, `rooms/TEST/players/${STUDENT_UID}`), {
        playerId: STUDENT_UID,
        nickname: 'Test Student',
        nicknameKey: 'test student',
        classSection: '1/1',
        studentNumber: 1,
        ownerUid: STUDENT_UID,
        roleId: question.roleId,
        roleHistory: [question.roleId],
        roleOffset: 0,
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      })
    })

    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const answerId = `0::${STUDENT_UID}::${question.questionId}`
    await assertFails(
      setDoc(doc(studentDb, `rooms/TEST/answers/${answerId}`), {
        answerId,
        roomId: 'TEST',
        playerId: STUDENT_UID,
        ownerUid: STUDENT_UID,
        gameCycle: 0,
        questionNumber: question.questionNumber,
        questionId: question.questionId,
        choiceId: question.choices[0].id,
        submittedAt: serverTimestamp(),
      }),
    )
  })
})

describe('PRE assessment — isolated collection, immutable, no room-status dependency', () => {
  const setUpRoomAndPlayer = async (roomId: string, status = 'lobby'): Promise<void> => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `rooms/${roomId}`), minimalRoomDoc(roomId, { status }))
      await setDoc(doc(db, `rooms/${roomId}/players/${STUDENT_UID}`), {
        playerId: STUDENT_UID,
        nickname: 'Test Student',
        nicknameKey: 'test student',
        classSection: '1/1',
        studentNumber: 1,
        ownerUid: STUDENT_UID,
        roleId: null,
        roleHistory: [],
        roleOffset: null,
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      })
    })
  }

  const validPreDoc = () => ({
    schemaVersion: 1,
    recordType: 'pre',
    roomId: 'PRE1',
    playerId: STUDENT_UID,
    ownerUid: STUDENT_UID,
    responses: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    submittedAt: serverTimestamp(),
  })

  // P0 regression: the student's own realtime listener is established BEFORE
  // they submit, watching a document that does not exist yet. The old rule
  // (`resource.data.ownerUid == request.auth.uid` with no !exists() guard)
  // threw evaluating `resource.data` on a null resource, which Firestore
  // treats as a permission denial - killing that listener before the
  // student ever clicked submit. The write itself always succeeded; only
  // the pre-established listener that was supposed to notice it died, which
  // is exactly why "กำลังส่งคำตอบ..." never resolved but an F5 (a brand-new
  // listener, created after the document already existed) worked instantly.
  it('lets a student open a live read on their own not-yet-created PRE path without a permission error', async () => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const ref = doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)

    const beforeSubmit = await assertSucceeds(getDoc(ref))
    expect(beforeSubmit.exists()).toBe(false)

    await assertSucceeds(setDoc(ref, validPreDoc()))

    // The same read path (what a still-open listener re-evaluates against)
    // must keep succeeding once the document exists, proving both halves of
    // the student's session - before and after their own write - stay readable.
    const afterSubmit = await assertSucceeds(getDoc(ref))
    expect(afterSubmit.exists()).toBe(true)
    expect(afterSubmit.data()?.responses).toEqual(validPreDoc().responses)
  })

  it('lets a fresh read (what an F5 reload performs) see an existing PRE record - proving refresh never showed PRE again even before this fix', async () => {
    await setUpRoomAndPlayer('PRE1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc())
    })
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const fresh = await assertSucceeds(getDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)))
    expect(fresh.exists()).toBe(true)
  })

  it('accepts a valid PRE submission from the owning student', async () => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc()))
  })

  it('succeeds even when the room has already moved past lobby (no room-status dependency, unlike answers)', async () => {
    await setUpRoomAndPlayer('PRE1', 'playing')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc()))
  })

  it('rejects a submission where the document id does not match pre::{playerId}', async () => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::someone-else`), validPreDoc()))
  })

  it('rejects a submission for a player the caller does not own', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'rooms/PRE1'), minimalRoomDoc('PRE1'))
      await setDoc(doc(db, `rooms/PRE1/players/${STUDENT_UID}`), {
        playerId: STUDENT_UID, nickname: 'Test Student', nicknameKey: 'test student',
        classSection: '1/1', studentNumber: 1, ownerUid: STUDENT_UID,
        roleId: null, roleHistory: [], roleOffset: null,
        joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
      })
    })
    const otherUid = 'someone-else'
    const otherDb = testEnv.authenticatedContext(otherUid).firestore()
    await assertFails(setDoc(doc(otherDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), {
      ...validPreDoc(),
      ownerUid: otherUid,
    }))
  })

  it.each([
    ['too few responses', [1, 2, 3]],
    ['too many responses', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1]],
    ['an out-of-range value', [0, 2, 3, 4, 5, 1, 2, 3, 4, 5]],
    ['a non-integer value', [1.5, 2, 3, 4, 5, 1, 2, 3, 4, 5]],
  ])('rejects %s', async (_label, responses) => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), { ...validPreDoc(), responses }))
  })

  it('rejects a document carrying extra fields such as preTotal/preMean/nickname', async () => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), {
      ...validPreDoc(),
      preTotal: 35,
    }))
    await assertFails(setDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`), {
      ...validPreDoc(),
      nickname: 'leaked nickname',
    }))
  })

  it('is immutable: a second write to the same document is rejected, and the original responses survive', async () => {
    await setUpRoomAndPlayer('PRE1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const ref = doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)
    await assertSucceeds(setDoc(ref, validPreDoc()))
    await assertFails(setDoc(ref, { ...validPreDoc(), responses: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }))

    let storedResponses: unknown
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const stored = await getDoc(doc(context.firestore(), `rooms/PRE1/assessments/pre::${STUDENT_UID}`))
      storedResponses = stored.data()?.responses
    })
    expect(storedResponses).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
  })

  it('lets the owning student read their own PRE record, but not another student\'s', async () => {
    await setUpRoomAndPlayer('PRE1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc())
    })
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(getDoc(doc(studentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)))

    const otherStudentDb = testEnv.authenticatedContext('other-student').firestore()
    await assertFails(getDoc(doc(otherStudentDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)))
  })

  it('lets the teacher read a student\'s PRE record in their own room', async () => {
    await setUpRoomAndPlayer('PRE1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc())
    })
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(getDoc(doc(teacherDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)))
  })

  it('rejects a read from a teacher of a different room (not this room\'s teacher)', async () => {
    await setUpRoomAndPlayer('PRE1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/PRE1/assessments/pre::${STUDENT_UID}`), validPreDoc())
    })
    const otherTeacherDb = testEnv.authenticatedContext('other-teacher').firestore()
    await assertFails(getDoc(doc(otherTeacherDb, `rooms/PRE1/assessments/pre::${STUDENT_UID}`)))
  })
})

describe('room code creation race (collision safety)', () => {
  const raceRoomId = 'RACE'

  const attemptClaim = (db: Firestore, roomId: string, teacherUid: string): Promise<string> =>
    runTransaction(db, async (transaction) => {
      const roomRef = doc(db, 'rooms', roomId)
      const existing = await transaction.get(roomRef)
      if (existing.exists()) throw new Error('COLLISION')
      transaction.set(roomRef, minimalRoomDoc(roomId, { teacherSessionId: teacherUid }))
      return teacherUid
    })

  it('when two teachers race on the same candidate code, exactly one wins and the other never overwrites it', async () => {
    const teacherA = 'teacher-A'
    const teacherB = 'teacher-B'
    // @firebase/rules-unit-testing declares .firestore() via its own legacy
    // type path even though it wraps the same @firebase/firestore runtime
    // instance the modular SDK uses — safe, well-known cast.
    const dbA = testEnv.authenticatedContext(teacherA).firestore() as unknown as Firestore
    const dbB = testEnv.authenticatedContext(teacherB).firestore() as unknown as Firestore

    const [resultA, resultB] = await Promise.allSettled([
      attemptClaim(dbA, raceRoomId, teacherA),
      attemptClaim(dbB, raceRoomId, teacherB),
    ])

    const fulfilled = [resultA, resultB].filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
    const rejected = [resultA, resultB].filter((result): result is PromiseRejectedResult => result.status === 'rejected')

    // Both attempts targeted the identical candidate code — Firestore's
    // transaction semantics must let exactly one through.
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(String(rejected[0].reason)).toContain('COLLISION')

    const winnerUid = fulfilled[0].value
    const stored = await getDoc(doc(dbA, 'rooms', raceRoomId))
    expect(stored.exists()).toBe(true)
    // The room was never overwritten by the loser: it still belongs to
    // whichever teacher's transaction actually committed first.
    expect(stored.data()?.teacherSessionId).toBe(winnerUid)

    // The real createRoom() retry loop reacts to RoomIdCollisionError by
    // picking a new candidate — prove that path succeeds with a different
    // valid code, as the loser would actually do next.
    const loserUid = winnerUid === teacherA ? teacherB : teacherA
    const loserDb = winnerUid === teacherA ? dbB : dbA
    const retryRoomId = 'RACY'
    expect(retryRoomId).not.toBe(raceRoomId)
    await assertSucceeds(attemptClaim(loserDb, retryRoomId, loserUid))

    const retryStored = await getDoc(doc(dbA, 'rooms', retryRoomId))
    expect(retryStored.exists()).toBe(true)
    expect(retryStored.data()?.teacherSessionId).toBe(loserUid)

    // The original room is still untouched by any of this.
    const originalStillIntact = await getDoc(doc(dbA, 'rooms', raceRoomId))
    expect(originalStillIntact.data()?.teacherSessionId).toBe(winnerUid)
  })
})
