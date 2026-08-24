import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StudentQuestionStage } from './GamePage'

const activeQuestion = (label: string) => (
  <StudentQuestionStage waitingVariant={null}>
    <article>
      <h1>{label}</h1>
      <button type="button">เลือกคำตอบ ก.</button>
      <button type="button">เลือกคำตอบ ข.</button>
    </article>
  </StudentQuestionStage>
)

describe('student question presentation transition', () => {
  it('renders active normal-question controls immediately inside the entry motion layer', () => {
    const markup = renderToStaticMarkup(activeQuestion('คำถามข้อที่ 1'))

    expect(markup).toContain('student-question-entry')
    expect(markup).toContain('คำถามข้อที่ 1')
    expect(markup.match(/<button/g)).toHaveLength(2)
    expect(markup).not.toContain('กำลังสรุปผลการตัดสินใจของเมือง')
  })

  it('replaces active controls with the normal submitted waiting presentation and no action', () => {
    const markup = renderToStaticMarkup(
      <StudentQuestionStage waitingVariant="normal">
        <button type="button">คำตอบที่ต้องไม่แสดง</button>
      </StudentQuestionStage>,
    )

    expect(markup).toContain('กำลังสรุปผลการตัดสินใจของเมือง')
    expect(markup).toContain('การตัดสินใจของทุกคนกำลังส่งผลต่อเมือง')
    expect(markup).toContain('ดูการเปลี่ยนแปลงที่หน้าจอครู')
    expect(markup).not.toContain('คำตอบที่ต้องไม่แสดง')
    expect(markup).not.toContain('<button')
  })

  it('uses the Crisis waiting treatment and keeps x2 as presentation copy only', () => {
    const markup = renderToStaticMarkup(
      <StudentQuestionStage waitingVariant="crisis">
        <button type="button">คำตอบวิกฤตที่ต้องไม่แสดง</button>
      </StudentQuestionStage>,
    )

    expect(markup).toContain('student-impact-waiting--crisis')
    expect(markup).toContain('กำลังประเมินผลกระทบจากวิกฤต')
    expect(markup).toContain('ผลของการตัดสินใจครั้งนี้ส่งผลต่อเมือง ×2')
    expect(markup).toContain('ดูผลกระทบที่หน้าจอครู')
    expect(markup).not.toContain('<button')
  })

  it('renders the new authoritative question instead of persisting the old waiting composition', () => {
    const waiting = renderToStaticMarkup(<StudentQuestionStage waitingVariant="normal">คำถามเดิม</StudentQuestionStage>)
    const nextQuestion = renderToStaticMarkup(activeQuestion('คำถามข้อที่ 2'))

    expect(waiting).toContain('กำลังสรุปผลการตัดสินใจของเมือง')
    expect(nextQuestion).toContain('คำถามข้อที่ 2')
    expect(nextQuestion).toContain('<button')
    expect(nextQuestion).not.toContain('กำลังสรุปผลการตัดสินใจของเมือง')
  })

  it('adds no transition write, progression call, subscription, or artificial delay', () => {
    const source = readFileSync(new URL('./GamePage.tsx', import.meta.url), 'utf8')
    const serviceCalls = [...source.matchAll(/service\.(\w+)\(/g)].map((match) => match[1])

    expect(serviceCalls).toEqual(['submitAnswer', 'submitCrisisAnswer'])
    expect(source).not.toMatch(/setTimeout|studentCutscene|transitionAck|closeQuestion|openNextQuestion|beginCrisisEvent/)
  })
})
