import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore'
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

describe('POST assessment and Reflection — Phase B1, same rule shape as PRE', () => {
  const setUpRoomAndPlayer = async (roomId: string, status = 'finished'): Promise<void> => {
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

  const validPostDoc = () => ({
    schemaVersion: 1,
    recordType: 'post',
    roomId: 'POST1',
    playerId: STUDENT_UID,
    ownerUid: STUDENT_UID,
    responses: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
    submittedAt: serverTimestamp(),
  })

  const validReflectionDoc = () => ({
    schemaVersion: 1,
    recordType: 'reflection',
    roomId: 'POST1',
    playerId: STUDENT_UID,
    ownerUid: STUDENT_UID,
    r1: 'สถานการณ์ที่ยากที่สุดคือตอนเลือกงบประมาณ',
    r2: 'เข้าใจว่าไม่ใช่แค่ผลประโยชน์ของตัวเอง',
    r3: 'เคยเห็นเพื่อนแจ้งเรื่องทุจริตในโรงเรียน',
    submittedAt: serverTimestamp(),
  })

  it('accepts a valid POST submission from the owning student while the room is finished', async () => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(setDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), validPostDoc()))
  })

  it('accepts a valid Reflection submission from the owning student while the room is finished', async () => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(setDoc(doc(studentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`), validReflectionDoc()))
  })

  it('succeeds even before the room reaches finished (no room-status dependency, same as PRE)', async () => {
    await setUpRoomAndPlayer('POST1', 'lobby')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(setDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), validPostDoc()))
  })

  it('rejects a POST/Reflection submission from the wrong owner while the room is finished', async () => {
    await setUpRoomAndPlayer('POST1')
    const otherUid = 'someone-else'
    const otherDb = testEnv.authenticatedContext(otherUid).firestore()
    await assertFails(setDoc(doc(otherDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), { ...validPostDoc(), ownerUid: otherUid }))
    await assertFails(setDoc(doc(otherDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`), { ...validReflectionDoc(), ownerUid: otherUid }))
  })

  it.each([
    ['too few responses', [1, 2, 3]],
    ['too many responses', [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1]],
    ['an out-of-range value', [0, 2, 3, 4, 5, 1, 2, 3, 4, 5]],
    ['a non-integer value', [1.5, 2, 3, 4, 5, 1, 2, 3, 4, 5]],
  ])('rejects an invalid POST response count/value: %s', async (_label, responses) => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), { ...validPostDoc(), responses }))
  })

  it.each([
    ['empty r1', (base: ReturnType<typeof validReflectionDoc>) => ({ ...base, r1: '' })],
    ['whitespace-only r2', (base: ReturnType<typeof validReflectionDoc>) => ({ ...base, r2: '   ' })],
    ['missing r3 entirely', (base: ReturnType<typeof validReflectionDoc>) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'r3'))],
    ['non-string r1', (base: ReturnType<typeof validReflectionDoc>) => ({ ...base, r1: 123 })],
  ])('rejects a malformed reflection: %s', async (_label, transform) => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`), transform(validReflectionDoc())))
  })

  it('rejects a document carrying extra fields such as postTotal/gain/nickname', async () => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), { ...validPostDoc(), postTotal: 35 }))
    await assertFails(setDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`), { ...validPostDoc(), gain: 5 }))
    await assertFails(setDoc(doc(studentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`), { ...validReflectionDoc(), nickname: 'leaked nickname' }))
  })

  it('keeps finished-room POST and Reflection immutable and preserves the original content', async () => {
    await setUpRoomAndPlayer('POST1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    const postRef = doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`)
    const reflectionRef = doc(studentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`)
    await assertSucceeds(setDoc(postRef, validPostDoc()))
    await assertSucceeds(setDoc(reflectionRef, validReflectionDoc()))
    await assertFails(setDoc(postRef, { ...validPostDoc(), responses: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }))
    await assertFails(setDoc(reflectionRef, { ...validReflectionDoc(), r1: 'คำตอบใหม่ที่ไม่ควรบันทึกทับ' }))

    let storedPostResponses: unknown
    let storedR1: unknown
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const privilegedDb = context.firestore()
      storedPostResponses = (await getDoc(doc(privilegedDb, `rooms/POST1/assessments/post::${STUDENT_UID}`))).data()?.responses
      storedR1 = (await getDoc(doc(privilegedDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`))).data()?.r1
    })
    expect(storedPostResponses).toEqual(validPostDoc().responses)
    expect(storedR1).toBe(validReflectionDoc().r1)
  })

  it('lets the owning student read their own POST/Reflection record, but cross-player read fails for another student', async () => {
    await setUpRoomAndPlayer('POST1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/POST1/assessments/post::${STUDENT_UID}`), validPostDoc())
      await setDoc(doc(context.firestore(), `rooms/POST1/assessments/reflection::${STUDENT_UID}`), validReflectionDoc())
    })
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertSucceeds(getDoc(doc(studentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`)))
    await assertSucceeds(getDoc(doc(studentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`)))

    const otherStudentDb = testEnv.authenticatedContext('other-student').firestore()
    await assertFails(getDoc(doc(otherStudentDb, `rooms/POST1/assessments/post::${STUDENT_UID}`)))
    await assertFails(getDoc(doc(otherStudentDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`)))
  })

  it('lets the teacher read a student\'s POST/Reflection evidence in their own (owned) room', async () => {
    await setUpRoomAndPlayer('POST1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/POST1/assessments/post::${STUDENT_UID}`), validPostDoc())
      await setDoc(doc(context.firestore(), `rooms/POST1/assessments/reflection::${STUDENT_UID}`), validReflectionDoc())
    })
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(getDoc(doc(teacherDb, `rooms/POST1/assessments/post::${STUDENT_UID}`)))
    await assertSucceeds(getDoc(doc(teacherDb, `rooms/POST1/assessments/reflection::${STUDENT_UID}`)))
  })

  it('rejects a read from a teacher of an unrelated room (not this room\'s teacher)', async () => {
    await setUpRoomAndPlayer('POST1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/POST1/assessments/post::${STUDENT_UID}`), validPostDoc())
    })
    const otherTeacherDb = testEnv.authenticatedContext('other-teacher').firestore()
    await assertFails(getDoc(doc(otherTeacherDb, `rooms/POST1/assessments/post::${STUDENT_UID}`)))
  })
})

describe('Teacher Observation — Phase B2a, room-level teacher evidence', () => {
  const setUpObservationRoom = async (roomId = 'OBS1') => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `rooms/${roomId}`), minimalRoomDoc(roomId))
    })
  }

  const validObservationDoc = (roomId = 'OBS1') => ({
    schemaVersion: 1,
    recordType: 'observation',
    roomId,
    teacherSessionId: TEACHER_UID,
    o1: 3,
    o2: 4,
    o3: 3,
    o4: 2,
    notes: 'นักเรียนให้ความร่วมมือและอภิปรายอย่างสร้างสรรค์',
    submittedAt: serverTimestamp(),
  })

  it('accepts a valid Observation submission from the owning teacher', async () => {
    await setUpObservationRoom('OBS1')
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(setDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation'), validObservationDoc('OBS1')))
  })

  it('accepts an Observation submission with empty notes', async () => {
    await setUpObservationRoom('OBS1')
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(setDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation'), {
      ...validObservationDoc('OBS1'),
      notes: '',
    }))
  })

  it('rejects an Observation submission from a student', async () => {
    await setUpObservationRoom('OBS1')
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(setDoc(doc(studentDb, 'rooms/OBS1/assessments/observation'), {
      ...validObservationDoc('OBS1'),
      teacherSessionId: STUDENT_UID,
    }))
  })

  it('rejects an Observation submission from a teacher of a different room', async () => {
    await setUpObservationRoom('OBS1')
    const otherTeacherDb = testEnv.authenticatedContext('other-teacher').firestore()
    await assertFails(setDoc(doc(otherTeacherDb, 'rooms/OBS1/assessments/observation'), {
      ...validObservationDoc('OBS1'),
      teacherSessionId: 'other-teacher',
    }))
  })

  it.each([
    ['score 0 below range', { o1: 0 }],
    ['score 5 above range', { o2: 5 }],
    ['non-integer score 2.5', { o3: 2.5 }],
    ['string score "3"', { o4: '3' }],
    ['missing o4 dimension', { o4: undefined }],
  ])('rejects an invalid observation dimension score: %s', async (_label, override) => {
    await setUpObservationRoom('OBS1')
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    const docData = { ...validObservationDoc('OBS1'), ...override }
    if (docData.o4 === undefined) delete (docData as Record<string, unknown>).o4
    await assertFails(setDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation'), docData))
  })

  it('rejects an Observation document carrying extra arbitrary fields', async () => {
    await setUpObservationRoom('OBS1')
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertFails(setDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation'), {
      ...validObservationDoc('OBS1'),
      averageScore: 3.0,
    }))
    await assertFails(setDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation'), {
      ...validObservationDoc('OBS1'),
      studentRanking: ['p1', 'p2'],
    }))
  })

  it('is immutable: overwrite/update is rejected and original observation survives', async () => {
    await setUpObservationRoom('OBS1')
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    const observationRef = doc(teacherDb, 'rooms/OBS1/assessments/observation')

    await assertSucceeds(setDoc(observationRef, validObservationDoc('OBS1')))
    await assertFails(setDoc(observationRef, {
      ...validObservationDoc('OBS1'),
      o1: 1,
      notes: 'พยายามแก้ไขข้อมูลเดิม',
    }))

    let storedNotes: unknown
    let storedO1: unknown
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const privilegedDb = context.firestore()
      const snapshot = await getDoc(doc(privilegedDb, 'rooms/OBS1/assessments/observation'))
      storedNotes = snapshot.data()?.notes
      storedO1 = snapshot.data()?.o1
    })
    expect(storedO1).toBe(3)
    expect(storedNotes).toBe(validObservationDoc('OBS1').notes)
  })

  it('lets the owning teacher read the observation record', async () => {
    await setUpObservationRoom('OBS1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/OBS1/assessments/observation'), validObservationDoc('OBS1'))
    })
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(getDoc(doc(teacherDb, 'rooms/OBS1/assessments/observation')))
  })

  it('denies a student reading the observation record', async () => {
    await setUpObservationRoom('OBS1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/OBS1/assessments/observation'), validObservationDoc('OBS1'))
    })
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(getDoc(doc(studentDb, 'rooms/OBS1/assessments/observation')))
  })

  it('denies a teacher of an unrelated room reading the observation record', async () => {
    await setUpObservationRoom('OBS1')
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/OBS1/assessments/observation'), validObservationDoc('OBS1'))
    })
    const otherTeacherDb = testEnv.authenticatedContext('other-teacher').firestore()
    await assertFails(getDoc(doc(otherTeacherDb, 'rooms/OBS1/assessments/observation')))
  })
})


describe('preAssessmentOpened — teacher-controlled room field', () => {
  it('lets the teacher set preAssessmentOpened while lobby', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/PREOPEN'), minimalRoomDoc('PREOPEN'))
    })
    const teacherDb = testEnv.authenticatedContext(TEACHER_UID).firestore()
    await assertSucceeds(updateDoc(doc(teacherDb, 'rooms/PREOPEN'), {
      preAssessmentOpened: true,
      updatedAt: serverTimestamp(),
    }))
  })

  it('rejects a student trying to set preAssessmentOpened themselves', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'rooms/PREOPEN2'), minimalRoomDoc('PREOPEN2'))
    })
    const studentDb = testEnv.authenticatedContext(STUDENT_UID).firestore()
    await assertFails(updateDoc(doc(studentDb, 'rooms/PREOPEN2'), {
      preAssessmentOpened: true,
      updatedAt: serverTimestamp(),
    }))
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
