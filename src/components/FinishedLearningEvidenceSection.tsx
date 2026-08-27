import { OBSERVATION_DIMENSIONS, OBSERVATION_SCALE } from '../domain/assessment'
import { calculateCompetitionSimulationEvidence } from '../domain/competitionEvidence'
import type { ClassroomPublicLearningEvidence, ClassroomRoom } from '../types/classroomGame'

interface FinishedLearningEvidenceSectionProps {
  evidence: ClassroomPublicLearningEvidence | null
  room: ClassroomRoom
  publishing?: boolean
}

const formatFixed = (value: number): string => value.toFixed(2)
const formatSigned = (value: number): string => `${value > 0 ? '+' : ''}${formatFixed(value)}`
const formatPercent = (value: number | null): string => value === null ? '—' : `${Number(value.toFixed(1))}%`

export const FinishedLearningEvidenceSection = ({
  evidence,
  room,
  publishing = false,
}: FinishedLearningEvidenceSectionProps) => {
  const simulation = calculateCompetitionSimulationEvidence(
    room.lockedPlayerCount,
    room.completedGameCount,
    room.integrityTotal,
    room.corruptionTotal,
    room.timeoutTotal,
  )
  const hasMatchedEvidence = evidence !== null && evidence.matchedCount > 0

  return (
    <section className="finished-learning" aria-labelledby="finished-learning-title">
      <header className="finished-learning__heading">
        <div><p>ผลการเรียนรู้หลังจบกิจกรรม</p><h2 id="finished-learning-title">หลักฐานจากกิจกรรมจริง</h2><span>แสดงเฉพาะข้อมูลรวมของห้อง ไม่แสดงข้อมูลหรือคำตอบรายบุคคล</span></div>
        {publishing ? <small>กำลังอัปเดตข้อมูลรวม…</small> : null}
      </header>

      <section className="finished-learning__assessment" aria-labelledby="finished-prepost-title">
        <div className="teacher-section-heading"><div><h3 id="finished-prepost-title">PRE / POST</h3><p>คำนวณจากผู้เรียนที่มีแบบประเมินครบทั้งก่อนและหลังเท่านั้น</p></div></div>
        <div className="finished-learning__completeness">
          <article><span>ผู้เข้าร่วมกิจกรรม</span><strong>{room.lockedPlayerCount} คน</strong></article>
          <article><span>ทำ PRE ครบ</span><strong>{evidence ? `${evidence.preCompleteCount} / ${evidence.participantCount}` : '—'}</strong></article>
          <article><span>ทำ POST ครบ</span><strong>{evidence ? `${evidence.postCompleteCount} / ${evidence.participantCount}` : '—'}</strong></article>
          <article><span>จับคู่ก่อน–หลังได้</span><strong>{evidence ? `${evidence.matchedCount} คน` : '—'}</strong></article>
        </div>
        {!hasMatchedEvidence ? <p className="finished-learning__empty">ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบ PRE–POST</p> : null}
        <div className="finished-learning__means">
          <article><span>PRE เฉลี่ย</span><strong>{hasMatchedEvidence ? formatFixed(evidence.preMean!) : '—'} <small>/ 5</small></strong></article>
          <article><span>POST เฉลี่ย</span><strong>{hasMatchedEvidence ? formatFixed(evidence.postMean!) : '—'} <small>/ 5</small></strong></article>
          <article className="is-gain"><span>คะแนนเฉลี่ยที่เพิ่มขึ้น</span><strong>{hasMatchedEvidence ? formatSigned(evidence.meanGainFivePoint!) : '—'} <small>คะแนน</small></strong></article>
        </div>
        <div className="finished-learning__changes">
          <article className="is-improved"><span>เพิ่มขึ้น</span><strong>{hasMatchedEvidence ? evidence.improvedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(evidence.improvedPercent)} ของ matched N=${evidence.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
          <article><span>คงเดิม</span><strong>{hasMatchedEvidence ? evidence.unchangedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(evidence.unchangedPercent)} ของ matched N=${evidence.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
          <article className="is-decreased"><span>ลดลง</span><strong>{hasMatchedEvidence ? evidence.decreasedCount : '—'}</strong><small>{hasMatchedEvidence ? `${formatPercent(evidence.decreasedPercent)} ของ matched N=${evidence.matchedCount}` : 'ยังไม่มีข้อมูล'}</small></article>
        </div>
        <p className="finished-learning__interpretation">ผลการประเมินสะท้อนการเปลี่ยนแปลงระยะสั้นด้านความตระหนักและแนวโน้มการตัดสินใจหลังเข้าร่วมกิจกรรม</p>
      </section>

      <div className="finished-learning__columns">
        <section aria-labelledby="finished-observation-title">
          <div className="teacher-section-heading"><div><h3 id="finished-observation-title">Teacher Observation</h3><p>แบบสังเกตพฤติกรรม O1–O4 ระดับ 1–4</p></div></div>
          {evidence?.observation ? <>
            <div className="finished-learning__observation-grid">
              {OBSERVATION_DIMENSIONS.map((dimension) => {
                const score = evidence.observation![dimension.id]
                const label = OBSERVATION_SCALE.find((option) => option.value === score)?.label ?? ''
                return <article key={dimension.id}><span>{dimension.code}</span><div><strong>{dimension.title}</strong><small>{label}</small></div><b>{score} / 4</b></article>
              })}
            </div>
            <p className="finished-learning__observation-mean">ค่าเฉลี่ย <strong>{formatFixed(evidence.observation.mean)} / 4</strong></p>
          </> : <p className="finished-learning__empty">ยังไม่มีหลักฐานการสังเกตของครู</p>}
        </section>

        <section aria-labelledby="finished-reflection-title">
          <div className="teacher-section-heading"><div><h3 id="finished-reflection-title">Reflection</h3><p>หลักฐานเชิงคุณภาพ ไม่แปลงเป็นคะแนน</p></div></div>
          <div className="finished-learning__reflection-total"><strong>{evidence ? `${evidence.reflectionCompleteCount} / ${evidence.participantCount}` : '—'}</strong><span>ส่งครบ {evidence ? formatPercent(evidence.reflectionCompletionPercent) : '—'}</span></div>
          <p>เพื่อความเป็นส่วนตัว หน้านี้แสดงเฉพาะจำนวนการส่ง ไม่เผยแพร่ข้อความ Reflection รายบุคคล</p>
        </section>
      </div>

      <section className="finished-learning__simulation" aria-labelledby="finished-simulation-title">
        <div className="teacher-section-heading"><div><h3 id="finished-simulation-title">หลักฐานจากสถานการณ์จำลอง</h3><p>ข้อมูลเกมแยกจากคะแนนประเมิน PRE–POST</p></div></div>
        <div className="finished-learning__simulation-grid">
          <article><span>สถานการณ์ปกติ</span><strong>10</strong></article>
          <article><span>Crisis</span><strong>2</strong></article>
          <article><span>โอกาสการตัดสินใจ</span><strong>12</strong><small>ต่อคนต่อรอบ</small></article>
          <article><span>Integrity</span><strong>{room.integrityTotal}</strong></article>
          <article><span>Corruption</span><strong>{room.corruptionTotal}</strong></article>
          <article><span>Timeout</span><strong>{room.timeoutTotal}</strong></article>
        </div>
        <div className={`finished-learning__reconciliation ${simulation.reconciles === true ? 'is-match' : simulation.reconciles === false ? 'is-mismatch' : ''}`}>
          {simulation.expectedDecisionOpportunities === null ? <p>ยังไม่มีรอบเกมที่จบเพียงพอสำหรับตรวจสอบจำนวนการตัดสินใจ</p> : <>
            <p>Expected: {room.lockedPlayerCount} × 12 × {room.completedGameCount} = <strong>{simulation.expectedDecisionOpportunities}</strong></p>
            <p>Actual: {room.integrityTotal} + {room.corruptionTotal} + {room.timeoutTotal} = <strong>{simulation.actualDecisionOutcomes}</strong> {simulation.reconciles ? '✓ ตรงกัน' : '⚠ ไม่ตรงกัน'}</p>
          </>}
        </div>
        <p className="finished-learning__simulation-note">ข้อมูลส่วนนี้เป็นหลักฐานจากการตัดสินใจในสถานการณ์จำลอง ไม่ใช้รวมกับ PRE–POST และไม่ใช้สรุประดับคุณธรรมหรือความซื่อสัตย์รายบุคคล</p>
      </section>
    </section>
  )
}
