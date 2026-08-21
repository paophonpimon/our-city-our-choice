import { stableBalancedPattern } from './deterministicOrder'
import {
  assignRolesForCycle,
  MAX_GAME_CYCLES,
  QUESTIONS_PER_PLAYER,
  ROLE_IDS,
  isRoleId,
  type QuestionNumber,
  type RoleId,
  type RotatingRolePlayer,
} from './ourCity'

export const QUESTION_SHEET_HEADERS = [
  'active',
  'role_id',
  'question_id',
  'sort_order',
  'question',
  'choice_1',
  'choice_2',
  'integrity_choice',
  'image_url',
] as const

export interface StableChoice {
  id: string
  text: string
}

export interface TrustedQuestion {
  active: boolean
  sourceRow: number
  roleId: RoleId
  questionId: string
  sortOrder: number
  prompt: string
  choices: readonly [StableChoice, StableChoice]
  integrityChoiceId: string
  corruptionChoiceId: string
  imageUrl: string | null
}

export interface RoomTrustedQuestion extends TrustedQuestion {
  questionNumber: QuestionNumber
}

export interface PublicRoomQuestion {
  questionId: string
  roleId: RoleId
  questionNumber: QuestionNumber
  prompt: string
  choices: readonly [StableChoice, StableChoice]
  // Purely positional and non-semantic: which choices[] index (0 or 1) to
  // render first for a given playerId. Never reveals which choice is
  // integrity — see computeChoiceOrderByQuestion, which is the only place
  // integrityChoiceId is consulted (server/trusted-side, never published).
  choiceOrder: Readonly<Record<string, 0 | 1>>
  imageUrl: string | null
}

export interface RoomQuestionSnapshot {
  schemaVersion: 1
  roomId: string
  createdAt: number
  trustedQuestions: readonly RoomTrustedQuestion[]
  publicQuestions: readonly PublicRoomQuestion[]
}

export interface SheetValidationError {
  row: number
  column: string
  message: string
}

export interface ParsedQuestionSheet {
  valid: boolean
  errors: SheetValidationError[]
  questions: TrustedQuestion[]
  totalRows: number
  activeQuestions: number
  activeByRole: Record<RoleId, number>
}

const text = (value: unknown): string => (value == null ? '' : String(value).trim())
const isBlankRow = (row: readonly unknown[]): boolean => row.every((value) => text(value) === '')
const emptyRoleCounts = (): Record<RoleId, number> =>
  Object.fromEntries(ROLE_IDS.map((roleId) => [roleId, 0])) as Record<RoleId, number>

const parseBoolean = (value: unknown): boolean | null => {
  const normalized = text(value).toUpperCase()
  if (value === true || normalized === 'TRUE') return true
  if (value === false || normalized === 'FALSE') return false
  return null
}

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(text(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export const parseQuestionSheetRows = (rows: readonly (readonly unknown[])[]): ParsedQuestionSheet => {
  const errors: SheetValidationError[] = []
  const questions: TrustedQuestion[] = []
  const activeByRole = emptyRoleCounts()
  const header = rows[0]?.map(text) ?? []
  const indexes = new Map(header.map((name, index) => [name, index]))

  for (const requiredHeader of QUESTION_SHEET_HEADERS) {
    if (!indexes.has(requiredHeader)) errors.push({ row: 1, column: requiredHeader, message: 'missing required column' })
  }
  if (errors.length > 0) {
    return { valid: false, errors, questions, totalRows: 0, activeQuestions: 0, activeByRole }
  }

  const valueAt = (row: readonly unknown[], column: (typeof QUESTION_SHEET_HEADERS)[number]): unknown =>
    row[indexes.get(column) ?? -1]
  const seenQuestionIds = new Map<string, number>()
  let totalRows = 0

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const rowNumber = index + 1
    if (isBlankRow(row)) continue
    totalRows += 1

    const active = parseBoolean(valueAt(row, 'active'))
    const roleIdValue = text(valueAt(row, 'role_id'))
    const questionId = text(valueAt(row, 'question_id'))
    const sortOrder = parsePositiveInteger(valueAt(row, 'sort_order'))
    const prompt = text(valueAt(row, 'question'))
    const choice1 = text(valueAt(row, 'choice_1'))
    const choice2 = text(valueAt(row, 'choice_2'))
    const integrityChoice = parsePositiveInteger(valueAt(row, 'integrity_choice'))
    const imageUrl = text(valueAt(row, 'image_url')) || null

    if (active === null) errors.push({ row: rowNumber, column: 'active', message: 'must be TRUE or FALSE' })
    if (!isRoleId(roleIdValue)) errors.push({ row: rowNumber, column: 'role_id', message: 'invalid canonical role' })
    if (!questionId) errors.push({ row: rowNumber, column: 'question_id', message: 'must not be empty' })
    if (questionId && seenQuestionIds.has(questionId)) {
      errors.push({
        row: rowNumber,
        column: 'question_id',
        message: `duplicate question_id; first used on row ${seenQuestionIds.get(questionId)}`,
      })
    } else if (questionId) {
      seenQuestionIds.set(questionId, rowNumber)
    }
    if (isRoleId(roleIdValue) && questionId && !questionId.startsWith(`${roleIdValue}-`)) {
      errors.push({ row: rowNumber, column: 'question_id', message: `must start with ${roleIdValue}-` })
    }
    if (sortOrder === null) errors.push({ row: rowNumber, column: 'sort_order', message: 'must be a positive integer' })
    if (!prompt) errors.push({ row: rowNumber, column: 'question', message: 'must not be empty' })
    if (!choice1) errors.push({ row: rowNumber, column: 'choice_1', message: 'must not be empty' })
    if (!choice2) errors.push({ row: rowNumber, column: 'choice_2', message: 'must not be empty' })
    if (choice1 && choice2 && choice1 === choice2) {
      errors.push({ row: rowNumber, column: 'choice_2', message: 'must differ from choice_1' })
    }
    if (integrityChoice !== 1 && integrityChoice !== 2) {
      errors.push({ row: rowNumber, column: 'integrity_choice', message: 'must be 1 or 2' })
    }

    if (errors.some((error) => error.row === rowNumber)) continue
    if (active === null || !isRoleId(roleIdValue) || sortOrder === null) continue

    const firstChoiceId = `${questionId}-c1`
    const secondChoiceId = `${questionId}-c2`
    questions.push({
      active,
      sourceRow: rowNumber,
      roleId: roleIdValue,
      questionId,
      sortOrder,
      prompt,
      choices: [
        { id: firstChoiceId, text: choice1 },
        { id: secondChoiceId, text: choice2 },
      ],
      integrityChoiceId: integrityChoice === 1 ? firstChoiceId : secondChoiceId,
      corruptionChoiceId: integrityChoice === 1 ? secondChoiceId : firstChoiceId,
      imageUrl,
    })
    if (active) activeByRole[roleIdValue] += 1
  }

  for (const roleId of ROLE_IDS) {
    if (activeByRole[roleId] < QUESTIONS_PER_PLAYER) {
      errors.push({
        row: 1,
        column: 'active',
        message: `${roleId} requires at least ${QUESTIONS_PER_PLAYER} active questions; found ${activeByRole[roleId]}`,
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    questions,
    totalRows,
    activeQuestions: questions.filter((question) => question.active).length,
    activeByRole,
  }
}

const cloneTrustedQuestion = (question: TrustedQuestion, questionNumber: QuestionNumber): RoomTrustedQuestion => ({
  ...question,
  questionNumber,
  choices: question.choices.map((choice) => ({ ...choice })) as [StableChoice, StableChoice],
})

export const toPublicRoomQuestion = (question: RoomTrustedQuestion): PublicRoomQuestion => ({
  questionId: question.questionId,
  roleId: question.roleId,
  questionNumber: question.questionNumber,
  prompt: question.prompt,
  choices: question.choices.map((choice) => ({ ...choice })) as [StableChoice, StableChoice],
  // Populated separately by computeChoiceOrderByQuestion once the roster is
  // known — startGame() is the only caller with both trusted (integrity)
  // data and the full player list at the same time.
  choiceOrder: {},
  imageUrl: question.imageUrl,
})

export const createRoomQuestionSnapshot = (
  roomId: string,
  sourceQuestions: readonly TrustedQuestion[],
  createdAt = Date.now(),
): RoomQuestionSnapshot => {
  if (!roomId.trim()) throw new Error('roomId is required')

  const trustedQuestions = ROLE_IDS.flatMap((roleId) => {
    const selected = sourceQuestions
      .filter((question) => question.active && question.roleId === roleId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.questionId.localeCompare(right.questionId))
      .slice(0, QUESTIONS_PER_PLAYER)
    if (selected.length !== QUESTIONS_PER_PLAYER) {
      throw new Error(`${roleId} requires ${QUESTIONS_PER_PLAYER} active questions; found ${selected.length}`)
    }
    return selected.map((question, index) => cloneTrustedQuestion(question, (index + 1) as QuestionNumber))
  })

  return {
    schemaVersion: 1,
    roomId,
    createdAt,
    trustedQuestions,
    publicQuestions: trustedQuestions.map(toPublicRoomQuestion),
  }
}

/**
 * Orders a question's two choices for display to one player. Purely
 * mechanical: looks up the precomputed positional bit for this player
 * (see computeChoiceOrderByQuestion) and applies it. Never sees, needs, or
 * could derive which choice is integrity — the balance guarantee lives
 * entirely in how choiceOrder was computed, not here.
 */
export const orderChoicesForPlayer = (
  question: PublicRoomQuestion,
  playerId: string,
): readonly [StableChoice, StableChoice] => {
  const firstIndex = question.choiceOrder[playerId] ?? 0
  return firstIndex === 0 ? question.choices : [question.choices[1], question.choices[0]]
}

/**
 * Precomputes a 5/5-balanced, non-semantic display-order bit for every
 * (player, question) pair across all MAX_GAME_CYCLES cycles of role
 * rotation, keyed by questionId then playerId.
 *
 * This must run once, at startGame(): question documents are immutable in
 * Firestore (see firestore.rules) and the roster is frozen the moment the
 * room leaves 'lobby', so no later cycle transition (continueCityProgress)
 * gets another chance to add entries. Role rotation is a pure function of
 * (roleRotation, roleOffset, gameCycle), so every cycle's assignment can be
 * derived up front here even though it plays out one cycle at a time later.
 *
 * integrityChoiceId is read here — the only place it's ever consulted — to
 * decide, per player and question, whether the integrity choice happens to
 * be at index 0 or 1, and therefore which index to record as "show first"
 * to hit exactly 5/10. The output map only ever stores that 0/1 index: a
 * question with choiceOrder[playerId] = 0 means "this player was dealt
 * integrity-first for this question", identically to choiceOrder = 1
 * meaning "integrity-second" — the map alone cannot distinguish which,
 * because it never stores integrityChoiceId or any other content-linked
 * value. See classroomFirestore.test.ts for the regression test on this
 * boundary.
 */
export const computeChoiceOrderByQuestion = (
  trustedQuestions: readonly RoomTrustedQuestion[],
  players: readonly RotatingRolePlayer[],
  roleRotation: readonly RoleId[],
  initialOffsets: Readonly<Record<string, number>>,
  roomId: string,
): Record<string, Record<string, 0 | 1>> => {
  const orderByQuestion: Record<string, Record<string, 0 | 1>> = {}
  for (const question of trustedQuestions) orderByQuestion[question.questionId] = {}

  let cyclePlayers: readonly RotatingRolePlayer[] = players
  for (let gameCycle = 0; gameCycle < MAX_GAME_CYCLES; gameCycle += 1) {
    cyclePlayers = assignRolesForCycle(cyclePlayers, roleRotation, gameCycle, initialOffsets)
    for (const player of cyclePlayers) {
      const seed = [roomId, player.playerId, String(gameCycle)].join(' ')
      const pattern = stableBalancedPattern(seed, 5, QUESTIONS_PER_PLAYER)
      for (const question of trustedQuestions) {
        if (question.roleId !== player.roleId) continue
        const wantIntegrityFirst = pattern[question.questionNumber - 1] ?? true
        const isChoice0Integrity = question.choices[0].id === question.integrityChoiceId
        const order = orderByQuestion[question.questionId]
        if (order) order[player.playerId] = wantIntegrityFirst === isChoice0Integrity ? 0 : 1
      }
    }
  }
  return orderByQuestion
}

export const isRoomQuestionSnapshot = (value: unknown): value is RoomQuestionSnapshot => {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<RoomQuestionSnapshot>
  if (snapshot.schemaVersion !== 1 || typeof snapshot.roomId !== 'string' || !snapshot.roomId.trim()) return false
  if (typeof snapshot.createdAt !== 'number' || !Number.isFinite(snapshot.createdAt)) return false
  if (!Array.isArray(snapshot.trustedQuestions) || !Array.isArray(snapshot.publicQuestions)) return false
  if (snapshot.trustedQuestions.length !== ROLE_IDS.length * QUESTIONS_PER_PLAYER) return false
  if (snapshot.publicQuestions.length !== snapshot.trustedQuestions.length) return false

  return (snapshot.trustedQuestions as readonly unknown[]).every((rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== 'object') return false
    const question = rawQuestion as Record<string, unknown>
    if (!isRoleId(question.roleId) || !Array.isArray(question.choices) || question.choices.length !== 2) {
      return false
    }
    return question.choices.some(
      (choice: unknown) =>
        Boolean(choice) && typeof choice === 'object' && (choice as Record<string, unknown>).id === question.integrityChoiceId,
    )
  })
}
