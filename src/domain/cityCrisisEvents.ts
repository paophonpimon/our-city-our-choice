import type { LocationId, LocationSummary, LockedPlayer } from './cityScoring'
import { LOCATION_BY_ROLE, SCORE_POLICY, clampCityScore, getCityLevel } from './cityScoring'
import { stableCoinFlip } from './deterministicOrder'
import { ROLE_IDS, type CityLevel, type RoleId } from './ourCity'

export const CRISIS_EVENT_IDS = ['construction-audit', 'public-emergency'] as const
export type CrisisEventId = (typeof CRISIS_EVENT_IDS)[number]
export type CrisisEventIndex = 1 | 2

export interface CrisisEventChoice { id: string; text: string }
export interface CrisisRoleDilemma {
  roleId: RoleId
  prompt: string
  choices: readonly [CrisisEventChoice, CrisisEventChoice]
  integrityChoiceId: string
}
export interface CityCrisisEvent {
  id: CrisisEventId
  index: CrisisEventIndex
  title: string
  subtitle: string
  situation: string
  dilemmas: Readonly<Record<RoleId, CrisisRoleDilemma>>
}

const dilemma = (
  eventId: CrisisEventId,
  roleId: RoleId,
  prompt: string,
  integrityText: string,
  corruptionText: string,
): CrisisRoleDilemma => {
  const integrityChoiceId = `${eventId}:${roleId}:integrity`
  return {
    roleId,
    prompt,
    choices: [
      { id: integrityChoiceId, text: integrityText },
      { id: `${eventId}:${roleId}:corruption`, text: corruptionText },
    ],
    integrityChoiceId,
  }
}

const eventOne = 'construction-audit' as const
const eventTwo = 'public-emergency' as const

export const CITY_CRISIS_EVENTS: readonly [CityCrisisEvent, CityCrisisEvent] = [
  {
    id: eventOne,
    index: 1,
    title: 'เงื่อนงำในโครงการก่อสร้างเมือง',
    subtitle: 'หลักฐานการลดสเปกและผลประโยชน์ทับซ้อนเริ่มปรากฏ',
    situation: 'โครงการสาธารณะใกล้เปิดใช้งาน แต่พบเอกสารงบประมาณผิดปกติ ทุกอาชีพต้องตัดสินใจภายใต้แรงกดดันของเมือง',
    dilemmas: {
      doctor: dilemma(eventOne, 'doctor', 'อาคารบริการสุขภาพใหม่ยังไม่ผ่านการตรวจความปลอดภัย แต่มีคำสั่งให้เปิดใช้ทันที', 'ยืนยันให้ตรวจมาตรฐานและแจ้งความเสี่ยงต่อประชาชน', 'รับรองเอกสารเพื่อให้อาคารเปิดตามกำหนด'),
      municipal: dilemma(eventOne, 'municipal', 'ผู้รับเหมาขอให้อนุมัติงวดสุดท้ายทั้งที่รายการวัสดุไม่ตรงสัญญา', 'ระงับการจ่ายและเปิดการตรวจสอบอย่างโปร่งใส', 'อนุมัติแลกกับการเร่งโครงการและผลตอบแทนพิเศษ'),
      police: dilemma(eventOne, 'police', 'มีพยานร้องเรียนว่าถูกข่มขู่หลังให้ข้อมูลโครงการ', 'คุ้มครองพยานและสืบสวนโดยไม่เลือกปฏิบัติ', 'แนะนำให้พยานเงียบเพื่อไม่ให้ผู้มีอำนาจเดือดร้อน'),
      teacher: dilemma(eventOne, 'teacher', 'โรงเรียนได้รับอุปกรณ์ราคาสูงกว่าปกติและถูกขอให้เซ็นรับทั้งหมด', 'ตรวจนับและรายงานสิ่งที่ไม่ตรงตามสัญญา', 'เซ็นรับเพื่อไม่ให้โรงเรียนเสียโอกาสรับงบรอบหน้า'),
      merchant: dilemma(eventOne, 'merchant', 'มีคนเสนอพื้นที่ขายดีแลกกับค่าตอบแทนนอกระบบ', 'ปฏิเสธและขอให้จัดสรรพื้นที่ด้วยเกณฑ์เดียวกัน', 'จ่ายเพื่อให้ร้านได้ตำแหน่งที่ได้เปรียบ'),
      contractor: dilemma(eventOne, 'contractor', 'งบเหลือน้อยและผู้ควบคุมงานเปิดทางให้ลดสเปกวัสดุ', 'ใช้วัสดุตามมาตรฐานและแจ้งปัญหางบตามจริง', 'ลดสเปกแล้วแบ่งเงินส่วนต่างกัน'),
      student: dilemma(eventOne, 'student', 'คุณเห็นภาพการขนวัสดุออกจากไซต์ตอนกลางคืน แต่เพื่อนเตือนว่าอย่ายุ่ง', 'ส่งหลักฐานผ่านช่องทางปลอดภัยและขอผู้ใหญ่ตรวจสอบ', 'ลบภาพเพื่อหลีกเลี่ยงปัญหา'),
      journalist: dilemma(eventOne, 'journalist', 'มีหลักฐานสำคัญแต่เจ้าของโครงการเสนอเงินให้ชะลอข่าว', 'ตรวจสอบหลักฐานเพิ่มและรายงานเพื่อประโยชน์สาธารณะ', 'รับข้อเสนอและทำข่าวให้ดูเป็นความเข้าใจผิด'),
    },
  },
  {
    id: eventTwo,
    index: 2,
    title: 'เมืองเผชิญเหตุฉุกเฉิน',
    subtitle: 'ผลของการใช้งบและการดูแลโครงสร้างกำลังย้อนกลับมาหาประชาชน',
    situation: 'ฝนหนักทำให้โครงสร้างบางส่วนเสียหายและบริการสาธารณะติดขัด ทรัพยากรมีจำกัดและทุกการตัดสินใจส่งผลต่อผู้คนทันที',
    dilemmas: {
      doctor: dilemma(eventTwo, 'doctor', 'เวชภัณฑ์มีจำกัด ขณะที่ผู้มีอำนาจขอให้กันของไว้ให้คนใกล้ชิด', 'จัดสรรตามความเร่งด่วนทางการแพทย์อย่างโปร่งใส', 'กันเวชภัณฑ์ให้ผู้มีอำนาจเพื่อแลกการสนับสนุน'),
      municipal: dilemma(eventTwo, 'municipal', 'งบฉุกเฉินต้องใช้ทันที แต่มีบริษัทพวกพ้องเสนอราคาแพงโดยไม่เปิดแข่งขัน', 'ประกาศเกณฑ์ ตรวจราคา และเปิดเผยการจัดซื้อฉุกเฉิน', 'มอบงานให้บริษัทพวกพ้องโดยอ้างว่าต้องรีบ'),
      police: dilemma(eventTwo, 'police', 'รถช่วยเหลือถูกขอให้เปลี่ยนเส้นทางไปรับคนสำคัญก่อนชุมชนที่เดือดร้อน', 'จัดลำดับตามความเสี่ยงและช่วยพื้นที่วิกฤตก่อน', 'เปลี่ยนเส้นทางตามคำสั่งเพื่อรักษาความสัมพันธ์'),
      teacher: dilemma(eventTwo, 'teacher', 'โรงเรียนเป็นศูนย์พักพิง แต่มีคำขอให้กันห้องดีไว้เฉพาะครอบครัวบางกลุ่ม', 'จัดพื้นที่ตามความจำเป็นและดูแลทุกครอบครัวเท่าเทียม', 'กันพื้นที่ให้ผู้ฝากฝังแล้วให้คนอื่นรอ'),
      merchant: dilemma(eventTwo, 'merchant', 'ของจำเป็นขาดตลาดและคุณสามารถขึ้นราคาได้หลายเท่า', 'ขายราคายุติธรรม จำกัดจำนวน และแสดงราคาชัดเจน', 'กักสินค้าแล้วขึ้นราคาเพื่อทำกำไรสูงสุด'),
      contractor: dilemma(eventTwo, 'contractor', 'สะพานชั่วคราวต้องรีบซ่อม แต่การข้ามขั้นตอนจะเสี่ยงต่อประชาชน', 'ปิดพื้นที่ ตรวจโครงสร้าง และซ่อมตามมาตรฐานฉุกเฉิน', 'เปิดใช้ก่อนเพื่อรับเงินแล้วค่อยแก้ภายหลัง'),
      student: dilemma(eventTwo, 'student', 'มีข่าวลือเรื่องเขื่อนแตกแพร่ในกลุ่มและทุกคนกำลังตื่นตระหนก', 'ตรวจแหล่งข่าวและแชร์เฉพาะประกาศทางการ', 'ส่งต่อทันทีเพื่อให้ตนเองเป็นคนแจ้งก่อน'),
      journalist: dilemma(eventTwo, 'journalist', 'เจ้าหน้าที่ขอให้ปกปิดพื้นที่เสียหายเพื่อไม่ให้ถูกตรวจสอบ', 'รายงานข้อเท็จจริงพร้อมข้อมูลช่วยเหลือที่ตรวจสอบแล้ว', 'ตัดภาพความเสียหายออกตามคำขอแลกข้อมูลพิเศษ'),
    },
  },
]

export const getCrisisEvent = (indexOrId: CrisisEventIndex | CrisisEventId): CityCrisisEvent => {
  const event = CITY_CRISIS_EVENTS.find((candidate) => candidate.index === indexOrId || candidate.id === indexOrId)
  if (!event) throw new Error(`Unknown crisis event: ${indexOrId}`)
  return event
}

export const getCrisisEventAfterQuestion = (questionNumber: number): CityCrisisEvent | null =>
  questionNumber === 4 ? CITY_CRISIS_EVENTS[0] : questionNumber === 8 ? CITY_CRISIS_EVENTS[1] : null

/**
 * Orders a crisis dilemma's two choices for display to one player.
 * `dilemma.choices` always stores the integrity choice first (see the
 * `dilemma()` builder above); this derives a per-(room, player, event, role)
 * deterministic flip so the integrity choice is not always shown in the
 * same position. Refresh/reconnect-safe: pure function of stable inputs.
 */
export const orderCrisisChoicesForPlayer = (
  dilemma: CrisisRoleDilemma,
  roomId: string,
  playerId: string,
  eventId: CrisisEventId,
): readonly [CrisisEventChoice, CrisisEventChoice] =>
  stableCoinFlip([roomId, playerId, eventId, dilemma.roleId].join(' '))
    ? dilemma.choices
    : [dilemma.choices[1], dilemma.choices[0]]

export const CRISIS_SCORE_POLICY = {
  integrity: SCORE_POLICY.integrity * 2,
  corruption: SCORE_POLICY.corruption * 2,
  timeout: SCORE_POLICY.timeout,
} as const

export interface CrisisSubmittedAnswer { playerId: string; eventId: CrisisEventId; choiceId: string }
export interface CrisisEventScoreResult {
  eventIndex: CrisisEventIndex
  eventId: CrisisEventId
  integrityCount: number
  corruptionCount: number
  timeoutCount: number
  eventTotal: number
  eventAverage: number
  previousCityScore: number
  newCityScore: number
  cityLevel: CityLevel
  locationSummaries: Record<LocationId, LocationSummary>
}

const newSummary = (): LocationSummary => ({ integrityCount: 0, corruptionCount: 0, timeoutCount: 0, participantCount: 0, scoreTotal: 0, scoreAverage: 0 })

export const scoreCrisisEvent = (
  previousCityScore: number,
  event: CityCrisisEvent,
  lockedPlayers: readonly LockedPlayer[],
  submittedAnswers: readonly CrisisSubmittedAnswer[],
): CrisisEventScoreResult => {
  if (lockedPlayers.length === 0) throw new Error('lockedPlayerCount must be greater than zero')
  const answers = new Map<string, CrisisSubmittedAnswer>()
  for (const answer of submittedAnswers) if (answer.eventId === event.id && !answers.has(answer.playerId)) answers.set(answer.playerId, answer)
  const locations = new Set<LocationId>(ROLE_IDS.map((roleId) => LOCATION_BY_ROLE[roleId]))
  const locationSummaries = Object.fromEntries([...locations].map((id) => [id, newSummary()])) as Record<LocationId, LocationSummary>
  let integrityCount = 0; let corruptionCount = 0; let timeoutCount = 0; let eventTotal = 0
  for (const player of lockedPlayers) {
    const dilemma = event.dilemmas[player.roleId]
    const answer = answers.get(player.playerId)
    const isValid = Boolean(answer && dilemma.choices.some((choice) => choice.id === answer.choiceId))
    const outcome = !isValid ? 'timeout' : answer?.choiceId === dilemma.integrityChoiceId ? 'integrity' : 'corruption'
    const impact = CRISIS_SCORE_POLICY[outcome]
    if (outcome === 'integrity') integrityCount += 1
    else if (outcome === 'corruption') corruptionCount += 1
    else timeoutCount += 1
    eventTotal += impact
    const summary = locationSummaries[LOCATION_BY_ROLE[player.roleId]]
    summary.participantCount += 1; summary.scoreTotal += impact; summary[`${outcome}Count`] += 1
  }
  for (const summary of Object.values(locationSummaries)) summary.scoreAverage = summary.participantCount ? summary.scoreTotal / summary.participantCount : 0
  const eventAverage = eventTotal / lockedPlayers.length
  const newCityScore = clampCityScore(previousCityScore + eventAverage)
  return { eventIndex: event.index, eventId: event.id, integrityCount, corruptionCount, timeoutCount, eventTotal, eventAverage, previousCityScore, newCityScore, cityLevel: getCityLevel(newCityScore), locationSummaries }
}

export const getCrisisConclusion = (average: number): string =>
  average > 0 ? 'เมืองร่วมมือกันยึดประโยชน์ส่วนรวม ความเชื่อมั่นและบริการสาธารณะจึงฟื้นตัว' : average < 0 ? 'การตัดสินใจที่เอื้อผลประโยชน์ส่วนตัวทำให้ความเสียหายลุกลามและเมืองสูญเสียความเชื่อมั่น' : 'เมืองผ่านวิกฤตไปได้ แต่ยังต้องร่วมมือกันเพื่อสร้างความเปลี่ยนแปลงที่ชัดเจน'
