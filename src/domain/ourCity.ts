export const QUESTIONS_PER_PLAYER = 10 as const
export const MAX_GAME_CYCLES = 8 as const

export const QUESTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export type QuestionNumber = (typeof QUESTION_NUMBERS)[number]

export const ROLE_IDS = [
  'doctor',
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
  { id: 'doctor', label: 'หมอ', order: 1 },
  { id: 'municipal', label: 'เจ้าหน้าที่เทศบาล', order: 2 },
  { id: 'police', label: 'ตำรวจ', order: 3 },
  { id: 'teacher', label: 'ครู', order: 4 },
  { id: 'merchant', label: 'พ่อค้าแม่ค้า', order: 5 },
  { id: 'contractor', label: 'ผู้รับเหมา', order: 6 },
  { id: 'student', label: 'นักเรียน', order: 7 },
  { id: 'journalist', label: 'นักข่าว', order: 8 },
] as const satisfies readonly RoleDefinition[]

export interface RoleCivicGuidance {
  influence: string
  responsibility: string
}

export const ROLE_CIVIC_GUIDANCE: Readonly<Record<RoleId, RoleCivicGuidance>> = {
  doctor: {
    influence: 'มีผลต่อสุขภาพ ความปลอดภัย และคุณภาพชีวิตของประชาชน',
    responsibility: 'รักษาทุกคนอย่างเท่าเทียม ใช้ทรัพยากรทางการแพทย์อย่างโปร่งใส และไม่รับผลประโยชน์เพื่อแซงคิวหรือเอื้อประโยชน์ให้ใคร',
  },
  municipal: {
    influence: 'มีผลต่องบประมาณ บริการสาธารณะ และทิศทางการพัฒนาเมือง',
    responsibility: 'จัดสรรงบประมาณอย่างเป็นธรรม เปิดเผยการทำงาน และยึดประโยชน์ของประชาชนมากกว่าพวกพ้องหรือผลประโยชน์ส่วนตัว',
  },
  police: {
    influence: 'มีผลต่อความปลอดภัย ความยุติธรรม และความเชื่อมั่นในกฎหมาย',
    responsibility: 'บังคับใช้กฎหมายกับทุกคนอย่างเท่าเทียม ปกป้องผู้บริสุทธิ์ และไม่รับสินบนหรือใช้อำนาจช่วยเหลือผู้กระทำผิด',
  },
  teacher: {
    influence: 'มีผลต่อความคิด พฤติกรรม และอนาคตของนักเรียน',
    responsibility: 'เป็นแบบอย่างที่ดี สอนให้นักเรียนซื่อสัตย์ กล้าทำสิ่งที่ถูกต้อง และปฏิบัติต่อนักเรียนทุกคนอย่างยุติธรรม',
  },
  merchant: {
    influence: 'มีผลต่อผู้บริโภค เศรษฐกิจชุมชน และความเป็นธรรมในการค้า',
    responsibility: 'ขายสินค้าอย่างซื่อสัตย์ ไม่โกงราคา น้ำหนัก หรือคุณภาพ เสียภาษีถูกต้อง และไม่ติดสินบนเพื่อเอาเปรียบคู่แข่ง',
  },
  contractor: {
    influence: 'มีผลต่อความปลอดภัยของอาคาร คุณภาพโครงสร้าง และงบประมาณสาธารณะ',
    responsibility: 'ก่อสร้างตามมาตรฐาน ใช้วัสดุที่มีคุณภาพ ตรวจสอบงบได้ และไม่ลดสเปกหรือจ่ายผลประโยชน์เพื่อให้ได้งาน',
  },
  student: {
    influence: 'มีผลต่อบรรยากาศในโรงเรียนและอนาคตของเมืองในฐานะพลเมืองรุ่นใหม่',
    responsibility: 'ซื่อสัตย์ในการเรียน ไม่โกงหรือช่วยปกปิดการโกง กล้าตั้งคำถาม และร่วมดูแลส่วนรวมด้วยการตัดสินใจอย่างรับผิดชอบ',
  },
  journalist: {
    influence: 'มีผลต่อข้อมูลที่ประชาชนได้รับและการตรวจสอบผู้มีอำนาจ',
    responsibility: 'ตรวจสอบข้อเท็จจริง นำเสนออย่างเป็นธรรม เปิดโปงการทุจริตโดยมีหลักฐาน และไม่รับผลประโยชน์เพื่อบิดเบือนหรือปิดข่าว',
  },
}

export const CITY_LEVELS = ['critical', 'declining', 'neutral', 'improving', 'prosperous'] as const

export type CityLevel = (typeof CITY_LEVELS)[number]

export const CITY_LEVEL_VALUES = {
  critical: -2,
  declining: -1,
  neutral: 0,
  improving: 1,
  prosperous: 2,
} as const satisfies Record<CityLevel, -2 | -1 | 0 | 1 | 2>

export const CITY_LEVEL_LABELS = {
  critical: 'แย่มาก',
  declining: 'แย่',
  neutral: 'เมืองปกติ',
  improving: 'กำลังพัฒนา',
  prosperous: 'พัฒนา',
} as const satisfies Record<CityLevel, string>

export const formatCityLevel = (level: CityLevel): string =>
  `ระดับ ${CITY_LEVEL_VALUES[level] > 0 ? '+' : ''}${CITY_LEVEL_VALUES[level]} ${CITY_LEVEL_LABELS[level]}`

export const GAME_STATUSES = ['lobby', 'role-draw', 'playing', 'round-result', 'game-result', 'finished'] as const

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
  gameCycle: number
  completedGameCount: number
  currentQuestionNumber: QuestionNumber | 0
  questionDurationSec: number
  questionStartedAt: DomainTimestamp | null
  questionDeadlineAt: DomainTimestamp | null
  lockedPlayerCount: number
  totalPlayers: number
  totalAnswers: number
  completedPlayers: number
  cityScore: number
  cityLevel: CityLevel
  integrityTotal: number
  corruptionTotal: number
  timeoutTotal: number
  roleRotation: RoleId[]
  createdAt: DomainTimestamp
  updatedAt: DomainTimestamp
}

export interface QuestionChoice {
  id: string
  text: string
}

/** UI-safe question data. Impact values intentionally live only in the teacher's trusted snapshot. */
export interface QuestionDefinition {
  id: string
  roleId: RoleId
  questionNumber: QuestionNumber
  situation: string
  choices: readonly [QuestionChoice, QuestionChoice]
  topic: string
}

/** Teacher-trusted evaluation data; student clients submit a choiceId and never submit these impact values. */
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

/** Synchronized timer window controlled by the teacher client. */
export interface QuestionTimerWindow {
  startedAt: DomainTimestamp
  endsAt: DomainTimestamp
}

export interface CityLevelPolicy {
  resolveLevel(cityScore: number): CityLevel
}

export interface RoleAssignablePlayer {
  playerId: string
  roleId: RoleId | null
}

export interface RotatingRolePlayer {
  playerId: string
  roleId: RoleId | null
  roleHistory: readonly RoleId[]
  roleOffset: number | null
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

export const isGameCycle = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_GAME_CYCLES

export const createRoleRotation = (
  random: () => number = Math.random,
): RoleId[] => {
  const rotation = [...ROLE_IDS]
  for (let index = rotation.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1))
    ;[rotation[index], rotation[selected]] = [rotation[selected], rotation[index]]
  }
  validateRoleOrder(rotation)
  return rotation
}

export const createBalancedRoleOffsets = (
  playerIds: readonly string[],
  random: () => number = Math.random,
): Readonly<Record<string, number>> => {
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((playerId) => !playerId.trim())) {
    throw new Error('playerIds must be unique non-empty values')
  }
  const shuffled = [...playerIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]]
  }
  return Object.fromEntries(shuffled.map((playerId, index) => [playerId, index % ROLE_IDS.length]))
}

export const getRoleForCycle = (
  roleRotation: readonly RoleId[],
  roleOffset: number,
  gameCycle: number,
): RoleId => {
  validateRoleOrder(roleRotation)
  if (!Number.isInteger(roleOffset) || roleOffset < 0 || roleOffset >= ROLE_IDS.length) {
    throw new Error('roleOffset must be an integer from 0 to 7')
  }
  if (!isGameCycle(gameCycle)) throw new Error('gameCycle must be an integer from 0 to 7')
  return roleRotation[(roleOffset + gameCycle) % ROLE_IDS.length]
}

export const assignRolesForCycle = <T extends RotatingRolePlayer>(
  players: readonly T[],
  roleRotation: readonly RoleId[],
  gameCycle: number,
  initialOffsets?: Readonly<Record<string, number>>,
): Array<T & { roleId: RoleId; roleHistory: RoleId[]; roleOffset: number }> => {
  if (!isGameCycle(gameCycle)) throw new Error('gameCycle must be an integer from 0 to 7')
  return players.map((player) => {
    const roleOffset = player.roleOffset ?? initialOffsets?.[player.playerId]
    if (roleOffset === undefined || roleOffset === null) throw new Error(`missing roleOffset for ${player.playerId}`)
    const roleId = getRoleForCycle(roleRotation, roleOffset, gameCycle)
    if (player.roleHistory.includes(roleId)) throw new Error(`role ${roleId} was already assigned to ${player.playerId}`)
    return { ...player, roleId, roleOffset, roleHistory: [...player.roleHistory, roleId] }
  })
}
