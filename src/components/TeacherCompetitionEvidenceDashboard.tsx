import {
  OBSERVATION_DIMENSIONS,
  OBSERVATION_SCALE,
  REFLECTION_PROMPTS,
} from '../domain/assessment'
import { normalizeBuildingLevels, type BuildingId, type BuildingLevel } from '../domain/cityBuildings'
import {
  calculateCompetitionAssessmentEvidence,
  calculateCompetitionSimulationEvidence,
} from '../domain/competitionEvidence'
import { formatCityLevel } from '../domain/ourCity'
import type { ClassroomAssessmentRecord, ClassroomRoom } from '../types/classroomGame'

interface TeacherCompetitionEvidenceDashboardProps {
  room: ClassroomRoom
  records: readonly ClassroomAssessmentRecord[]
  loading?: boolean
  error?: string
}

const BUILDINGS: readonly { id: BuildingId; label: string; icon: string }[] = [
  { id: 'school', label: 'โรงเรียน', icon: '🏫' },
  { id: 'construction', label: 'ไซต์ก่อสร้าง', icon: '🏗️' },
  { id: 'market', label: 'ตลาด', icon: '🏪' },
  { id: 'hospital', label: 'โรงพยาบาล', icon: '🏥' },
  { id: 'police', label: 'สถานีตำรวจ', icon: '👮' },
  { id: 'municipality', label: 'สำนักงานเทศบาล', icon: '🏛️' },
  { id: 'newsAgency', label: 'สำนักข่าว', icon: '🛰️' },
] as const

const BUILDING_LEVEL_LABELS: Record<BuildingLevel, string> = {
  [-2]: 'ทรุดโทรมมาก',
  [-1]: 'เริ่มทรุดโทรม',
  0: 'ปกติ',
  1: 'กำลังพัฒนา',
  2: 'พัฒนาเต็มที่',
}

const CRITERIA = [
  ['1', 'Co-Design', '25', 'ใช้หลักฐาน Co-Design จากรายงาน/ภาคผนวก'],
  ['2', 'ความสอดคล้องกับหลักสูตร', '20', 'บริบทที่รายงานรองรับ'],
  ['3', 'การนำไปใช้และผลลัพธ์', '25', 'หลักฐานจากระบบ'],
  ['4', 'ความคิดสร้างสรรค์', '15', 'คุณลักษณะของนวัตกรรม'],
  ['5', 'รายงานและการนำเสนอ', '15', 'ใช้ร่วมกับรายงานและการนำเสนอของทีม'],
] as const

const CURRICULUM_OUTCOMES = [
  'แยกประโยชน์ส่วนตนกับประโยชน์ส่วนรวม',
  'ตระหนักถึงผลกระทบจากการตัดสินใจ',
  'ใช้เหตุผลและรับผิดชอบต่อผลที่เกิดขึ้น',
  'คำนึงถึงความเป็นธรรม ความโปร่งใส และการปฏิเสธการทุจริต',
  'มีส่วนร่วมและเชื่อมโยงบทเรียนกับสถานการณ์จริง',
] as const

const IMPLEMENTATION_ISSUES = [
  'ความพร้อมของอุปกรณ์และอินเทอร์เน็ต',
  'ความแตกต่างด้านการอ่านและการวิเคราะห์',
  'ความเข้าใจบทบาทและบริบทของสถานการณ์',
  'ความซับซ้อนของเนื้อหาให้เหมาะกับวัย',
  'ความยาวสถานการณ์เทียบกับเวลาตอบ',
  'การหลีกเลี่ยงคำตอบที่ชี้นำผู้เรียน',
  'สมดุลระหว่างกลไกเกมกับเป้าหมายการเรียนรู้',
] as const

const IMPROVEMENT_DIRECTIONS = [
  'เตรียมอุปกรณ์และเครือข่ายก่อนเริ่มกิจกรรม',
  'ปรับความซับซ้อนของสถานการณ์ให้เหมาะกับวัย',
  'ทบทวนข้อมูลจากการใช้งานจริง',
  'ปรับเวลาให้สัมพันธ์กับความซับซ้อนของสถานการณ์',
  'ใช้ผลเมืองเป็นจุดเริ่มต้นของการอภิปรายและ Reflection',
  'ปรับปรุงระบบจากข้อเสนอแนะของนักเรียนและครู',
] as const

const formatNumber = (value: number): string => value.toLocaleString('th-TH')
const formatFixed = (value: number): string => value.toFixed(2)
const formatSigned = (value: number): string => `${value > 0 ? '+' : ''}${formatFixed(value)}`
const formatPercent = (value: number | null): string => value === null ? '—' : `${Number(value.toFixed(1))}%`
const formatActivityDate = (timestamp: number): string => timestamp > 0
  ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
  : 'ไม่พบวันเวลาที่เชื่อถือได้'

export const TeacherCompetitionEvidenceDashboard = ({
  room,
  records,
  loading = false,
  error = '',
}: TeacherCompetitionEvidenceDashboardProps) => {
  const assessment = calculateCompetitionAssessmentEvidence(room.lockedPlayerCount, records)
  const simulation = calculateCompetitionSimulationEvidence(
    room.lockedPlayerCount,
    room.completedGameCount,
    room.integrityTotal,
    room.corruptionTotal,
    room.timeoutTotal,
  )
  const buildingLevels = normalizeBuildingLevels(room.buildingLevels)
  const { matched } = assessment
  const hasMatchedEvidence = matched.matchedCount > 0

  return (
    <div className="competition-evidence-dashboard">
      <section className="competition-criteria" aria-label="เกณฑ์การประกวด SSSS 2026">
        {CRITERIA.map(([number, title, points, status]) => (
          <article className={number === '3' ? 'is-system-evidence' : ''} key={number}>
            <span>{number}</span><div><strong>{title} — {points}</strong><small>{status}</small></div>
          </article>
        ))}
      </section>

      <header className="competition-evidence-hero">
        <div><p>TEACHER COMPETITION EVIDENCE</p><h1>หลักฐานสำหรับนำเสนอกรรมการ</h1><span>ข้อมูลจริงจากกิจกรรมที่จบแล้ว • อ่านอย่างเดียว • ไม่แสดงข้อมูลรายบุคคล</span></div>
        <dl>
          <div><dt>ห้อง</dt><dd>{room.roomId}</dd></div>
          <div><dt>วันเวลากิจกรรม</dt><dd>{formatActivityDate(room.createdAt)}</dd></div>
          <div><dt>ผู้เข้าร่วม</dt><dd>{formatNumber(room.lockedPlayerCount)} คน</dd></div>
          <div><dt>รอบเกมที่จบ</dt><dd>{formatNumber(room.completedGameCount)} รอบ</dd></div>
        </dl>
        <aside><span>ผลการจำลองของกิจกรรม</span><strong>{formatNumber(Math.round(room.cityScore))} / 1,000</strong><p>{formatCityLevel(room.cityLevel)}</p></aside>
      </header>

      {loading ? <p className="competition-evidence-state">กำลังโหลดหลักฐานการประเมิน…</p> : null}
      {error ? <p className="competition-evidence-error" role="alert">{error}</p> : null}

      <section className="competition-evidence-flow" aria-labelledby="evidence-flow-title">
        <div className="competition-section-heading"><p>WHAT WAS MEASURED?</p><h2 id="evidence-flow-title">เส้นทางหลักฐานตลอดกิจกรรม</h2><span>หลักฐานแต่ละแหล่งสนับสนุนกัน แต่แยกวิเคราะห์และไม่รวมเป็นคะแนนเดียว</span></div>
        <div className="competition-evidence-flow__steps">
          <article><b>1</b><strong>PRE 10 ข้อ</strong><span>หลักฐานเชิงปริมาณก่อนกิจกรรม</span></article><i>→</i>
          <article><b>2</b><strong>สถานการณ์ 10 + Crisis 2</strong><span>หลักฐานการตัดสินใจในสถานการณ์จำลอง</span></article><i>→</i>
          <article><b>3</b><strong>POST 10 ข้อ</strong><span>หลักฐานเชิงปริมาณหลังจบกิจกรรม</span></article><i>→</i>
          <article><b>4</b><strong>Reflection 3 ข้อ</strong><span>หลักฐานเชิงคุณภาพจากผู้เรียน</span></article><i>→</i>
          <article><b>5</b><strong>Observation O1–O4</strong><span>หลักฐานการสังเกตจากครู</span></article>
        </div>
      </section>

      <section className="competition-assessment" aria-labelledby="competition-assessment-title">
        <div className="competition-section-heading"><p>QUANTITATIVE EVIDENCE</p><h2 id="competition-assessment-title">ผลการประเมิน PRE–POST</h2><span>เปรียบเทียบเฉพาะผู้เรียนที่มี PRE และ POST ครบทั้งสองช่วง</span></div>
        <div className="competition-completeness-grid" aria-label="ความครบถ้วนของหลักฐาน">
          <article><span>ผู้เข้าร่วมทั้งหมด</span><strong>{formatNumber(assessment.participantCount)}</strong><small>คน</small></article>
          <article><span>PRE ครบ</span><strong>{assessment.preCompleteCount} / {assessment.participantCount}</strong><small>{formatPercent(assessment.preCompletionPercent)}</small></article>
          <article><span>POST ครบ</span><strong>{assessment.postCompleteCount} / {assessment.participantCount}</strong><small>{formatPercent(assessment.postCompletionPercent)}</small></article>
          <article><span>จับคู่ PRE–POST</span><strong>{matched.matchedCount}</strong><small>คู่ข้อมูลสมบูรณ์</small></article>
          <article><span>Reflection ครบ</span><strong>{assessment.reflectionCompleteCount} / {assessment.participantCount}</strong><small>{formatPercent(assessment.reflectionCompletionPercent)}</small></article>
          <article><span>Teacher Observation</span><strong>{assessment.observation ? 'Recorded' : 'Not Recorded'}</strong><small>{assessment.observation ? 'บันทึกแล้ว' : 'ยังไม่มีข้อมูล'}</small></article>
        </div>

        {!hasMatchedEvidence && !loading ? <p className="competition-no-evidence">ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบ PRE–POST</p> : null}
        <div className="competition-primary-metrics">
          <article><span>ค่าเฉลี่ย PRE [1–5]</span><strong>{hasMatchedEvidence ? formatFixed(matched.preMean) : '—'} <small>/ 5</small></strong></article>
          <article><span>ค่าเฉลี่ย POST [1–5]</span><strong>{hasMatchedEvidence ? formatFixed(matched.postMean) : '—'} <small>/ 5</small></strong></article>
          <article className="is-gain"><span>คะแนนเฉลี่ยที่เพิ่มขึ้น [1–5]</span><strong>{hasMatchedEvidence ? formatSigned(matched.meanGainFivePoint) : '—'} <small>คะแนน</small></strong></article>
        </div>
        <div className="competition-change-grid">
          <article className="is-improved"><span>Improved</span><strong>{hasMatchedEvidence ? matched.improvedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(matched.improvedPercent)} ของ matched N=${matched.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
          <article><span>Unchanged</span><strong>{hasMatchedEvidence ? matched.unchangedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(matched.unchangedPercent)} ของ matched N=${matched.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
          <article className="is-decreased"><span>Decreased</span><strong>{hasMatchedEvidence ? matched.decreasedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(matched.decreasedPercent)} ของ matched N=${matched.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
        </div>
        <p className="competition-interpretation">ผลการประเมินสะท้อนการเปลี่ยนแปลงระยะสั้นด้านความตระหนักและแนวโน้มการตัดสินใจหลังเข้าร่วมกิจกรรม</p>

        <details className="competition-calculation-trace">
          <summary>วิธีคำนวณผลการประเมิน</summary>
          <div>
            <p>ผู้เข้าร่วม {assessment.participantCount} คน → PRE ครบ {assessment.preCompleteCount} คน → POST ครบ {assessment.postCompleteCount} คน → จับคู่ PRE–POST ได้ {matched.matchedCount} คน</p>
            <p>แบบประเมิน PRE และ POST มีชุดละ 10 ข้อ ระดับ 1–5 ระบบจับคู่ข้อมูลก่อนและหลังของผู้เรียนคนเดียวกัน จากนั้นหาค่าเฉลี่ยจากคำตอบ 10 ข้อ และเปรียบเทียบค่าเฉลี่ยก่อน–หลัง</p>
            {hasMatchedEvidence ? <dl>
              <div><dt>PRE เฉลี่ย</dt><dd>{formatFixed(matched.preMean)} / 5</dd></div>
              <div><dt>POST เฉลี่ย</dt><dd>{formatFixed(matched.postMean)} / 5</dd></div>
              <div><dt>คะแนนเฉลี่ยที่เพิ่มขึ้น</dt><dd>{formatFixed(matched.postMean)} − {formatFixed(matched.preMean)} = {formatSigned(matched.meanGainFivePoint)} คะแนน</dd></div>
              <div><dt>Improved / Unchanged / Decreased</dt><dd>จำนวนแต่ละกลุ่ม / matched N={matched.matchedCount} × 100</dd></div>
            </dl> : <p>ยังไม่มีข้อมูลเพียงพอ จึงไม่คำนวณค่าเฉลี่ยหรือหารด้วยศูนย์</p>}
          </div>
        </details>
      </section>

      <div className="competition-evidence-columns">
        <section className="competition-observation" aria-labelledby="competition-observation-title">
          <div className="competition-section-heading"><p>TEACHER EVIDENCE</p><h2 id="competition-observation-title">Teacher Observation O1–O4</h2><span>แบบสังเกตพฤติกรรมชั้นเรียน แยกจากคะแนน PRE–POST</span></div>
          {assessment.observation ? <>
            <div className="competition-observation-grid">
              {OBSERVATION_DIMENSIONS.map((dimension) => {
                const score = assessment.observation![dimension.id]
                const label = OBSERVATION_SCALE.find((option) => option.value === score)?.label ?? ''
                return <article key={dimension.id}><span>{dimension.code}</span><div><strong>{dimension.title}</strong><small>{label}</small></div><b>{score} / 4</b></article>
              })}
            </div>
            <p className="competition-observation-average">ค่าเฉลี่ย Observation <strong>{formatFixed(assessment.observationMean!)} / 4</strong></p>
            {assessment.observation.notes ? <div className="competition-teacher-notes"><strong>บันทึกเพิ่มเติมของครู</strong><p>{assessment.observation.notes}</p></div> : null}
          </> : <p className="competition-no-evidence">ยังไม่มีหลักฐานการสังเกตของครู</p>}
        </section>

        <section className="competition-reflection" aria-labelledby="competition-reflection-title">
          <div className="competition-section-heading"><p>QUALITATIVE EVIDENCE</p><h2 id="competition-reflection-title">Reflection ของผู้เรียน</h2><span>หลักฐานเชิงคุณภาพ ไม่ให้คะแนนและไม่สรุปข้อความอัตโนมัติ</span></div>
          <div className="competition-reflection-total"><strong>{assessment.reflectionCompleteCount} / {assessment.participantCount}</strong><span>ส่งครบ • {formatPercent(assessment.reflectionCompletionPercent)}</span></div>
          <ol>{REFLECTION_PROMPTS.map((prompt, index) => <li key={prompt}><span>R{index + 1}</span>{prompt}</li>)}</ol>
          <p>แดชบอร์ดไม่แสดงคำตอบต้นฉบับรายบุคคล ข้อความ Reflection ยังคงเป็นหลักฐานส่วนตัวสำหรับครู</p>
        </section>
      </div>

      <section className="competition-simulation" aria-labelledby="competition-simulation-title">
        <div className="competition-section-heading"><p>SIMULATION / IMPLEMENTATION EVIDENCE</p><h2 id="competition-simulation-title">หลักฐานการตัดสินใจระหว่างสถานการณ์จำลอง</h2><span>สถานการณ์หลัก 10 ข้อ + Crisis 2 เหตุการณ์ต่อหนึ่งรอบเกมที่จบ</span></div>
        <div className="competition-simulation-grid">
          <article><span>สถานการณ์หลักที่จบ</span><strong>{simulation.normalScenariosCompleted}</strong></article>
          <article><span>Crisis ที่จบ</span><strong>{simulation.crisisScenariosCompleted}</strong></article>
          <article><span>ผู้เข้าร่วม</span><strong>{room.lockedPlayerCount}</strong></article>
          <article className="is-integrity"><span>Integrity</span><strong>{formatNumber(room.integrityTotal)}</strong></article>
          <article className="is-corruption"><span>Corruption</span><strong>{formatNumber(room.corruptionTotal)}</strong></article>
          <article><span>Timeout</span><strong>{formatNumber(room.timeoutTotal)}</strong></article>
        </div>
        <div className={`competition-reconciliation ${simulation.reconciles === true ? 'is-match' : simulation.reconciles === false ? 'is-mismatch' : ''}`}>
          <strong>ตรวจสอบจำนวนโอกาสตัดสินใจ</strong>
          {simulation.expectedDecisionOpportunities === null ? <p>ยังไม่มีรอบเกมที่จบเพียงพอสำหรับคำนวณจำนวนที่คาด</p> : <p>คาด {formatNumber(simulation.expectedDecisionOpportunities)} = ผู้เข้าร่วม {room.lockedPlayerCount} × 12 × {room.completedGameCount} รอบ • ระบบบันทึกจริง {formatNumber(simulation.actualDecisionOutcomes)} {simulation.reconciles ? '✓ ตรงกัน' : '⚠ ไม่ตรงกัน โปรดตรวจสอบข้อมูลห้องและความหมายของรอบที่บันทึก'}</p>}
        </div>
        <div className="competition-building-grid">{BUILDINGS.map((building) => { const level = buildingLevels[building.id]; return <article key={building.id}><span>{building.icon}</span><div><strong>{building.label}</strong><small>{BUILDING_LEVEL_LABELS[level]}</small></div><b>Lv.{level > 0 ? '+' : ''}{level}</b></article> })}</div>
        <p className="competition-separation-note">ข้อมูลส่วนนี้เป็นผลจากกลไกสถานการณ์จำลอง ใช้เป็นหลักฐานการเข้าร่วมและการตัดสินใจระหว่างกิจกรรม ไม่ใช้แทนคะแนนประเมินก่อน–หลัง และไม่ใช้สรุประดับคุณธรรมหรือความซื่อสัตย์รายบุคคล</p>
      </section>

      <div className="competition-context-columns">
        <section className="competition-curriculum" aria-labelledby="competition-curriculum-title">
          <div className="competition-section-heading"><p>CRITERION 2</p><h2 id="competition-curriculum-title">ความสอดคล้องกับหลักสูตรต้านทุจริตศึกษา</h2><span>ประเด็นผลลัพธ์ที่รายงานส่วน 4.2 รองรับ</span></div>
          <ul>{CURRICULUM_OUTCOMES.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
          <p>ยังไม่มี mapping รายข้อกับคุณลักษณะโรงเรียนสุจริตทั้ง 5 ด้านที่ได้รับการยืนยัน จึงไม่แสดงการจับคู่ที่อนุมานขึ้นเอง</p>
        </section>
        <section className="competition-innovation" aria-labelledby="competition-innovation-title">
          <div className="competition-section-heading"><p>CRITERION 4</p><h2 id="competition-innovation-title">องค์ประกอบความคิดสร้างสรรค์</h2><span>คุณลักษณะที่มีอยู่จริงในระบบ</span></div>
          <ul><li>8 บทบาทอาชีพในสังคม</li><li>การตัดสินใจรายบุคคล</li><li>ผลร่วมต่อเมืองเดียวกัน</li><li>อาคารสาธารณะ 7 แห่ง</li><li>Crisis events</li><li>การเปลี่ยนแปลงเมืองและอาคารที่มองเห็นได้</li></ul>
        </section>
      </div>

      <section className="competition-improvements" aria-labelledby="competition-improvements-title">
        <div className="competition-section-heading"><p>REPORT-DERIVED IMPLEMENTATION LEARNING</p><h2 id="competition-improvements-title">ปัญหาและแนวทางปรับปรุงจากรายงาน</h2><span>เป็นหลักฐานจากรายงาน ไม่ใช่ตัวชี้วัดที่ระบบวัดอัตโนมัติ</span></div>
        <div><article><h3>ประเด็นที่พบ/ต้องเตรียมรับมือ</h3><ul>{IMPLEMENTATION_ISSUES.map((issue) => <li key={issue}>{issue}</li>)}</ul></article><article><h3>แนวทางพัฒนา</h3><ul>{IMPROVEMENT_DIRECTIONS.map((direction) => <li key={direction}>{direction}</li>)}</ul></article></div>
      </section>
    </div>
  )
}
