export const QUESTIONS_PER_PLAYER = 10 as const

export const QUESTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export type QuestionNumber = (typeof QUESTION_NUMBERS)[number]

export const ROLE_IDS = [
  'mayor',
  'municipal',
  'police',
  'teacher',
  'merchant',
  'contractor',
  'student',
  'journalist',
] as const

export type RoleId = (typeof ROLE_IDS)[number]

export interface RoleDefinition {
  id: RoleId
  label: string
  order: number
}

export const ROLES = [
  { id: 'mayor', label: 'นายกเทศมนตรี', order: 1 },
  { id: 'municipal', label: 'เจ้าหน้าที่เทศบาล', order: 2 },
  { id: 'police', label: 'ตำรวจ', order: 3 },
  { id: 'teacher', label: 'ครู', order: 4 },
  { id: 'merchant', label: 'พ่อค้าแม่ค้า', order: 5 },
  { id: 'contractor', label: 'ผู้รับเหมา', order: 6 },
  { id: 'student', label: 'นักเรียน', order: 7 },
  { id: 'journalist', label: 'นักข่าว', order: 8 },
] as const satisfies readonly RoleDefinition[]

export const CITY_LEVELS = ['critical', 'declining', 'neutral', 'improving', 'prosperous'] as const

export type CityLevel = (typeof CITY_LEVELS)[number]

export const GAME_STATUSES = ['lobby', 'role-reveal', 'question', 'question-closed', 'finished'] as const

export type GameStatus = (typeof GAME_STATUSES)[number]

export type DomainTimestamp = number

export interface RoomSettings {
  questionDurationSec: number
  questionsPerPlayer: typeof QUESTIONS_PER_PLAYER
}

export interface PlayerState {
  playerId: string
  nickname: string
  roleId: RoleId | null
  currentQuestionIndex: number
  completedQuestionIds: string[]
  isFinished: boolean
  joinedAt: DomainTimestamp
  lastSeenAt: DomainTimestamp
}

export interface RoomState {
  roomId: string
  status: GameStatus
  settings: RoomSettings
  totalPlayers: number
  totalAnswers: number
  completedPlayers: number
  cityScore: number
  cityLevel: CityLevel
  createdAt: DomainTimestamp
  updatedAt: DomainTimestamp
}

export interface QuestionChoice {
  id: string
  text: string
}

/** UI-safe question data. Impact values intentionally live in a separate service-side definition. */
export interface QuestionDefinition {
  id: string
  roleId: RoleId
  questionNumber: QuestionNumber
  situation: string
  choices: readonly [QuestionChoice, QuestionChoice]
  topic: string
}

/** Trusted evaluation data; clients submit a choiceId and never submit these impact values. */
export interface QuestionImpactDefinition {
  questionId: string
  impactByChoiceId: Readonly<Record<string, number>>
  feedbackByChoiceId: Readonly<Record<string, string>>
}

export interface AnswerRecord {
  answerKey: string
  roomId: string
  playerId: string
  questionId: string
  choiceId: string
  submittedAt: DomainTimestamp
  impactApplied: boolean
}

export interface SessionReference {
  roomId: string
  playerId: string
  sessionVersion: number
}

/** A timer window can be attached to a room or a player after the pacing decision is made. */
export interface QuestionTimerWindow {
  startedAt: DomainTimestamp
  endsAt: DomainTimestamp
}

/** Phase 2 defines the contract only; no score thresholds are selected. */
export interface CityLevelPolicy {
  resolveLevel(cityScore: number): CityLevel
}

export interface RoleAssignablePlayer {
  playerId: string
  roleId: RoleId | null
}

export type RoomSettingsValidationError =
  | 'question-duration-must-be-positive-integer'
  | 'questions-per-player-must-be-10'

export interface RoomSettingsValidationResult {
  valid: boolean
  errors: RoomSettingsValidationError[]
}

const ROLE_ID_SET: ReadonlySet<string> = new Set(ROLE_IDS)

export const isRoleId = (value: unknown): value is RoleId => typeof value === 'string' && ROLE_ID_SET.has(value)

export const formatQuestionProgressLabel = (currentQuestionIndex: number): string => {
  if (!Number.isInteger(currentQuestionIndex) || currentQuestionIndex < 0 || currentQuestionIndex >= QUESTIONS_PER_PLAYER) {
    throw new RangeError(`currentQuestionIndex must be an integer from 0 to ${QUESTIONS_PER_PLAYER - 1}`)
  }

  return `คำถามข้อที่ ${currentQuestionIndex + 1}/${QUESTIONS_PER_PLAYER}`
}

export const createAnswerKey = (playerId: string, questionId: string): string => {
  if (!playerId.trim() || !questionId.trim()) {
    throw new Error('playerId and questionId are required to create an answer key')
  }

  return `${encodeURIComponent(playerId)}::${encodeURIComponent(questionId)}`
}

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

export const validateRoomSettings = (settings: unknown): RoomSettingsValidationResult => {
  const value = typeof settings === 'object' && settings !== null ? (settings as Record<string, unknown>) : {}
  const errors: RoomSettingsValidationError[] = []

  if (!isPositiveInteger(value.questionDurationSec)) {
    errors.push('question-duration-must-be-positive-integer')
  }
  if (value.questionsPerPlayer !== QUESTIONS_PER_PLAYER) {
    errors.push('questions-per-player-must-be-10')
  }

  return { valid: errors.length === 0, errors }
}

const validateRoleOrder = (roleOrder: readonly RoleId[]): void => {
  if (
    roleOrder.length !== ROLE_IDS.length ||
    new Set(roleOrder).size !== ROLE_IDS.length ||
    roleOrder.some((roleId) => !isRoleId(roleId))
  ) {
    throw new Error('roleOrder must contain each confirmed role exactly once')
  }
}

export const assignBalancedRoles = <T extends RoleAssignablePlayer>(
  players: readonly T[],
  roleOrder: readonly RoleId[] = ROLE_IDS,
): Array<T & { roleId: RoleId }> => {
  validateRoleOrder(roleOrder)

  const roleCounts = Object.fromEntries(ROLE_IDS.map((roleId) => [roleId, 0])) as Record<RoleId, number>
  for (const player of players) {
    if (player.roleId !== null) roleCounts[player.roleId] += 1
  }

  const assignments = players.map((player) => {
    if (player.roleId !== null) return { ...player, roleId: player.roleId }

    const roleId = roleOrder.reduce((leastUsedRole, candidateRole) =>
      roleCounts[candidateRole] < roleCounts[leastUsedRole] ? candidateRole : leastUsedRole,
    )
    roleCounts[roleId] += 1
    return { ...player, roleId }
  })

  const counts = Object.values(roleCounts)
  if (counts.length > 0 && Math.max(...counts) - Math.min(...counts) > 1) {
    throw new Error('locked role assignments make a balanced result impossible')
  }

  return assignments
}

export const assignRolesToUnassignedPlayers = assignBalancedRoles
