import type { RoomQuestionSnapshot } from './classroomQuestions'
import { getCrisisEvent, type CityCrisisEvent } from './cityCrisisEvents'
import type { CityLevel, RoleId } from './ourCity'
import type {
  ClassroomCrisisAnswerRecord,
  ClassroomPersonalDecisionResult,
  ClassroomQuestionAnswerRecord,
  PersonalDecisionOutcome,
} from '../types/classroomGame'
import { createPersonalDecisionId } from '../services/classroomFirestore'

interface ResolvedPlayer {
  playerId: string
  ownerUid: string
  roleId: RoleId
}

export const countPersonalDecisionOutcomes = (results: readonly ClassroomPersonalDecisionResult[]) => results.reduce(
  (totals, result) => ({ ...totals, [result.outcome]: totals[result.outcome] + 1 }),
  { integrity: 0, corruption: 0, timeout: 0 } satisfies Record<PersonalDecisionOutcome, number>,
)

export type PersonalImpactNarrativeKind = 'integrity-majority' | 'corruption-majority' | 'balanced' | 'high-timeout'

export interface PersonalImpactNarrative {
  kind: PersonalImpactNarrativeKind
  decisionMessage: string
  cityMessage: string
}

const CITY_IMPACT_MESSAGES: Record<CityLevel, string> = {
  critical: 'เมืองจำลองอยู่ในภาวะที่ต้องเร่งฟื้นฟูร่วมกัน',
  declining: 'เมืองจำลองกำลังถดถอยและต้องอาศัยการตัดสินใจร่วมกันเพื่อฟื้นตัว',
  neutral: 'เมืองจำลองยังทรงตัว และการตัดสินใจในรอบต่อไปยังเปลี่ยนทิศทางได้',
  improving: 'ผลสะสมของทั้งห้องทำให้เมืองจำลองมีแนวโน้มพัฒนาดีขึ้น',
  prosperous: 'ผลสะสมของทั้งห้องช่วยให้เมืองจำลองพัฒนาอย่างมั่นคงในรอบนี้',
}

/** Presentation-only interpretation of already-finalized private counts. */
export const derivePersonalImpactNarrative = (
  totals: Readonly<Record<PersonalDecisionOutcome, number>>,
  cityLevel: CityLevel,
): PersonalImpactNarrative => {
  const answered = totals.integrity + totals.corruption
  const total = answered + totals.timeout
  const highTimeout = total > 0 && totals.timeout >= Math.max(totals.integrity, totals.corruption)

  const kind: PersonalImpactNarrativeKind = highTimeout
    ? 'high-timeout'
    : totals.integrity > totals.corruption
      ? 'integrity-majority'
      : totals.corruption > totals.integrity
        ? 'corruption-majority'
        : 'balanced'

  const decisionMessage: Record<PersonalImpactNarrativeKind, string> = {
    'integrity-majority': 'รอบนี้คุณเลือกทางสุจริตมากกว่า ตัวเลือกเหล่านี้มีส่วนช่วยลดผลกระทบด้านลบต่อเมืองจำลอง',
    'corruption-majority': 'รอบนี้คุณเลือกทางทุจริตมากกว่า ตัวเลือกเหล่านี้มีส่วนเพิ่มแรงกดดันต่อบริการและอาคารของเมืองจำลอง',
    balanced: answered === 0
      ? 'รอบนี้ยังไม่มีคำตอบที่สรุปผลได้ จึงยังไม่เห็นแนวโน้มจากการตัดสินใจของคุณ'
      : 'รอบนี้การเลือกสองแนวทางมีจำนวนเท่ากัน จึงสะท้อนผลกระทบต่อเมืองจำลองที่ผสมกัน',
    'high-timeout': 'การไม่ตอบหลายข้อในรอบนี้มีส่วนทำให้เมืองจำลองเสียโอกาสจากการมีส่วนร่วม และมีข้อมูลอธิบายแนวโน้มน้อยลง',
  }

  return { kind, decisionMessage: decisionMessage[kind], cityMessage: CITY_IMPACT_MESSAGES[cityLevel] }
}

export const assertPersonalOutcomeTotals = (
  results: readonly ClassroomPersonalDecisionResult[],
  expected: { integrityCount: number; corruptionCount: number; timeoutCount: number },
): void => {
  const totals = countPersonalDecisionOutcomes(results)
  if (totals.integrity !== expected.integrityCount || totals.corruption !== expected.corruptionCount || totals.timeout !== expected.timeoutCount) {
    throw new Error('trusted personal outcome totals do not match aggregate result')
  }
}

export const resolveQuestionPersonalResults = (
  roomId: string,
  gameCycle: number,
  questionNumber: number,
  players: readonly ResolvedPlayer[],
  snapshot: RoomQuestionSnapshot,
  submittedAnswers: readonly ClassroomQuestionAnswerRecord[],
  resolvedAt: number,
): ClassroomPersonalDecisionResult[] => {
  const questionsByRole = new Map(
    snapshot.trustedQuestions
      .filter((question) => question.questionNumber === questionNumber)
      .map((question) => [question.roleId, question]),
  )
  const firstAnswerByKey = new Map<string, ClassroomQuestionAnswerRecord>()
  for (const answer of submittedAnswers) {
    const key = `${answer.playerId}\u0000${answer.questionId}`
    if (!firstAnswerByKey.has(key)) firstAnswerByKey.set(key, answer)
  }
  return players.map((player) => {
    const question = questionsByRole.get(player.roleId)
    if (!question) throw new Error(`missing trusted question ${questionNumber} for ${player.roleId}`)
    const answer = firstAnswerByKey.get(`${player.playerId}\u0000${question.questionId}`)
    const valid = Boolean(answer && question.choices.some((choice) => choice.id === answer.choiceId))
    const outcome: PersonalDecisionOutcome = !valid
      ? 'timeout'
      : answer?.choiceId === question.integrityChoiceId ? 'integrity' : 'corruption'
    const decisionId = createPersonalDecisionId(gameCycle, 'question', questionNumber, player.playerId)
    return { decisionId, roomId, playerId: player.playerId, ownerUid: player.ownerUid, gameCycle, roleId: player.roleId, source: 'question', sequenceNumber: questionNumber, outcome, resolvedAt }
  })
}

export const resolveCrisisPersonalResults = (
  roomId: string,
  gameCycle: number,
  event: CityCrisisEvent | ReturnType<typeof getCrisisEvent>,
  players: readonly ResolvedPlayer[],
  submittedAnswers: readonly ClassroomCrisisAnswerRecord[],
  resolvedAt: number,
): ClassroomPersonalDecisionResult[] => {
  const firstAnswerByPlayer = new Map<string, ClassroomCrisisAnswerRecord>()
  for (const answer of submittedAnswers) if (answer.eventId === event.id && !firstAnswerByPlayer.has(answer.playerId)) firstAnswerByPlayer.set(answer.playerId, answer)
  return players.map((player) => {
    const dilemma = event.dilemmas[player.roleId]
    const answer = firstAnswerByPlayer.get(player.playerId)
    const valid = Boolean(answer && dilemma.choices.some((choice) => choice.id === answer.choiceId))
    const outcome: PersonalDecisionOutcome = !valid
      ? 'timeout'
      : answer?.choiceId === dilemma.integrityChoiceId ? 'integrity' : 'corruption'
    const decisionId = createPersonalDecisionId(gameCycle, 'crisis', event.index, player.playerId)
    return { decisionId, roomId, playerId: player.playerId, ownerUid: player.ownerUid, gameCycle, roleId: player.roleId, source: 'crisis', sequenceNumber: event.index, outcome, resolvedAt }
  })
}
