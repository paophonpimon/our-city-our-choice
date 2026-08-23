import {
  calculateMatchedAssessmentEvidence,
  OBSERVATION_DIMENSIONS,
  OBSERVATION_SCALE,
  REFLECTION_PROMPTS,
} from '../domain/assessment'
import type {
  ClassroomAssessmentRecord,
  ClassroomPlayer,
  ClassroomPostAssessment,
  ClassroomPreAssessment,
  ClassroomReflection,
  ClassroomTeacherObservation,
} from '../types/classroomGame'

interface TeacherEvidenceSummarySectionProps {
  records: readonly ClassroomAssessmentRecord[]
  players: readonly ClassroomPlayer[]
  loading?: boolean
  error?: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const getTeacherObservationEvidence = (
  records: readonly ClassroomAssessmentRecord[],
): ClassroomTeacherObservation | null =>
  records.find((record): record is ClassroomTeacherObservation => record.recordType === 'observation') ?? null

// eslint-disable-next-line react-refresh/only-export-components
export const shouldShowTeacherObservationSection = (
  finished: boolean,
  evidenceLoading: boolean,
  observation: ClassroomTeacherObservation | null,
): boolean => !finished || (!evidenceLoading && observation === null)

const formatFixed = (value: number): string => value.toFixed(2)
const formatSigned = (value: number): string => `${value > 0 ? '+' : ''}${formatFixed(value)}`
const formatPercent = (value: number): string => `${Number(value.toFixed(1))}%`

const studentLabel = (playerId: string, players: readonly ClassroomPlayer[]): string => {
  const player = players.find((candidate) => candidate.playerId === playerId)
  if (!player) return playerId
  const details = [
    player.classSection ? `ชั้น ${player.classSection}` : '',
    player.studentNumber !== null ? `เลขที่ ${player.studentNumber}` : '',
  ].filter(Boolean)
  return details.length > 0 ? `${player.nickname} • ${details.join(' • ')}` : player.nickname
}

export const TeacherEvidenceSummarySection = ({
  records,
  players,
  loading = false,
  error = '',
}: TeacherEvidenceSummarySectionProps) => {
  const preRecords = records.filter((record): record is ClassroomPreAssessment => record.recordType === 'pre')
  const postRecords = records.filter((record): record is ClassroomPostAssessment => record.recordType === 'post')
  const reflections = records
    .filter((record): record is ClassroomReflection => record.recordType === 'reflection')
    .sort((left, right) => {
      const leftIndex = players.findIndex((player) => player.playerId === left.playerId)
      const rightIndex = players.findIndex((player) => player.playerId === right.playerId)
      if (leftIndex === -1 && rightIndex === -1) return left.playerId.localeCompare(right.playerId)
      if (leftIndex === -1) return 1
      if (rightIndex === -1) return -1
      return leftIndex - rightIndex
    })
  const observation = getTeacherObservationEvidence(records)
  const evidence = calculateMatchedAssessmentEvidence(preRecords, postRecords)
  const { group } = evidence
  const hasMatchedEvidence = group.matchedCount > 0

  return (
    <section className="teacher-evidence-summary" aria-labelledby="teacher-evidence-summary-title">
      <div className="teacher-section-heading">
        <div>
          <p className="teacher-lobby-kicker">หลักฐานการประเมินหลังจบกิจกรรม (Phase B2c)</p>
          <h2 id="teacher-evidence-summary-title">สรุปหลักฐานการเรียนรู้ของชั้นเรียน</h2>
          <p>ข้อมูลแบบประเมิน PRE–POST การสังเกตของครู และ Reflection แสดงแยกจากคะแนนเกม</p>
        </div>
      </div>

      <p className="teacher-evidence-summary__interpretation">
        ผลการประเมินสะท้อนการเปลี่ยนแปลงระยะสั้นด้านความตระหนักและแนวโน้มการตัดสินใจหลังเข้าร่วมกิจกรรม
      </p>

      {loading ? <p className="teacher-evidence-summary__state">กำลังโหลดหลักฐานการประเมิน…</p> : null}
      {error ? <p className="teacher-evidence-summary__error" role="alert">{error}</p> : null}

      <section className="teacher-evidence-summary__matched" aria-labelledby="matched-evidence-title">
        <header>
          <div>
            <h3 id="matched-evidence-title">หลักฐาน PRE–POST ที่จับคู่ได้</h3>
            <p>คำนวณเฉพาะนักเรียนที่มีคำตอบ PRE และ POST ที่สมบูรณ์ทั้งสองชุด</p>
          </div>
          <strong>{group.matchedCount} คน</strong>
        </header>
        {!hasMatchedEvidence && !loading ? (
          <p className="teacher-evidence-summary__empty">ยังไม่มีข้อมูล PRE–POST ที่จับคู่ได้</p>
        ) : null}
        <div className="teacher-evidence-metrics">
          <article><span>ค่าเฉลี่ย PRE (1–5)</span><strong>{hasMatchedEvidence ? formatFixed(group.preMean) : '—'}</strong></article>
          <article><span>ค่าเฉลี่ย POST (1–5)</span><strong>{hasMatchedEvidence ? formatFixed(group.postMean) : '—'}</strong></article>
          <article><span>ค่าเฉลี่ยการเปลี่ยนแปลงคะแนนรวม (10–50)</span><strong>{hasMatchedEvidence ? formatSigned(group.meanGain) : '—'}</strong></article>
          <article className="is-improved"><span>เพิ่มขึ้น</span><strong>{group.improvedCount} คน</strong></article>
          <article><span>คงเดิม</span><strong>{group.unchangedCount} คน</strong></article>
          <article className="is-decreased"><span>ลดลง</span><strong>{group.decreasedCount} คน</strong></article>
          <article><span>สัดส่วนที่เพิ่มขึ้น</span><strong>{hasMatchedEvidence ? formatPercent(group.improvedPercent) : '—'}</strong></article>
        </div>
      </section>

      <section className="teacher-evidence-summary__observation" aria-labelledby="evidence-observation-title">
        <header>
          <div>
            <h3 id="evidence-observation-title">หลักฐานการสังเกตของครู</h3>
            <p>ภาพรวมพฤติกรรมชั้นเรียน O1–O4</p>
          </div>
          <strong>{observation ? 'บันทึกแล้ว' : 'ยังไม่ได้บันทึก'}</strong>
        </header>
        {observation ? (
          <>
            <div className="teacher-evidence-observation-grid">
              {OBSERVATION_DIMENSIONS.map((dimension) => {
                const score = observation[dimension.id]
                const label = OBSERVATION_SCALE.find((option) => option.value === score)?.label ?? ''
                return (
                  <article key={dimension.id}>
                    <span>{dimension.code}</span>
                    <div><strong>{dimension.title}</strong><small>{label}</small></div>
                    <b>{score} / 4</b>
                  </article>
                )
              })}
            </div>
            {observation.notes ? (
              <div className="teacher-evidence-summary__notes"><strong>บันทึกเพิ่มเติมของครู</strong><p>{observation.notes}</p></div>
            ) : null}
          </>
        ) : (
          <p className="teacher-evidence-summary__empty">ยังไม่มีหลักฐานการสังเกต ครูสามารถบันทึกได้ในแบบฟอร์มด้านล่าง</p>
        )}
      </section>

      <section className="teacher-evidence-summary__reflections" aria-labelledby="evidence-reflection-title">
        <header>
          <div>
            <h3 id="evidence-reflection-title">Reflection ของนักเรียน</h3>
            <p>คำตอบเชิงคุณภาพต้นฉบับ R1–R3 โดยไม่มีการให้คะแนนหรือสรุปอัตโนมัติ</p>
          </div>
          <strong>{reflections.length} คน</strong>
        </header>
        {reflections.length === 0 ? (
          <p className="teacher-evidence-summary__empty">ยังไม่มีนักเรียนส่ง Reflection</p>
        ) : (
          <div className="teacher-evidence-reflection-list">
            {reflections.map((reflection) => (
              <details key={reflection.playerId}>
                <summary>{studentLabel(reflection.playerId, players)}</summary>
                <dl>
                  {REFLECTION_PROMPTS.map((prompt, index) => {
                    const key = `r${index + 1}` as 'r1' | 'r2' | 'r3'
                    return <div key={key}><dt>R{index + 1}. {prompt}</dt><dd>{reflection[key]}</dd></div>
                  })}
                </dl>
              </details>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
