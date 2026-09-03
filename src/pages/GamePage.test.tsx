import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  QuestionSceneImage,
  StudentQuestionStage,
} from './GamePage'
import {
  hideFailedQuestionScene,
  QUESTION_SCENE_IMAGE_BY_QUESTION_ID,
  resolveQuestionSceneImageUrl,
} from './gameQuestionScenes'

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
        <QuestionSceneImage src="/assets/question-scenes/doctor/doctor-01.webp" />
        <button type="button">คำตอบที่ต้องไม่แสดง</button>
      </StudentQuestionStage>,
    )

    expect(markup).toContain('กำลังสรุปผลการตัดสินใจของเมือง')
    expect(markup).toContain('การตัดสินใจของทุกคนกำลังส่งผลต่อเมือง')
    expect(markup).toContain('ดูการเปลี่ยนแปลงที่หน้าจอครู')
    expect(markup).not.toContain('คำตอบที่ต้องไม่แสดง')
    expect(markup).not.toContain('/assets/question-scenes/doctor/doctor-01.webp')
    expect(markup).not.toContain('<button')
  })

  it('uses the Crisis waiting treatment and keeps x2 as presentation copy only', () => {
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
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
    expect(styles).toMatch(/\.student-impact-waiting--crisis \{[\s\S]*?background: linear-gradient\(145deg, #fffdfd, #edf6fc\)/)
    expect(styles).not.toContain('background: linear-gradient(145deg, #6e130c, #300907 62%, #7a2e08)')
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

describe('role-question scene images', () => {
  it('resolves reviewed scenario mappings to assets that exist in the project', () => {
    expect(Object.keys(QUESTION_SCENE_IMAGE_BY_QUESTION_ID)).toHaveLength(80)
    expect(resolveQuestionSceneImageUrl('doctor-01', null)).toBe('/assets/question-scenes/doctor/doctor-01.webp')
    expect(resolveQuestionSceneImageUrl('contractor-09', null)).toBe('/assets/question-scenes/contractor/contractor-9.webp')
    for (let questionNumber = 1; questionNumber <= 10; questionNumber += 1) {
      const paddedNumber = String(questionNumber).padStart(2, '0')
      expect(resolveQuestionSceneImageUrl(`journalist-${paddedNumber}`, null))
        .toBe(`/assets/question-scenes/journalist/news-${paddedNumber}.webp`)
    }

    for (const imageUrl of Object.values(QUESTION_SCENE_IMAGE_BY_QUESTION_ID)) {
      expect(existsSync(fileURLToPath(new URL(`../../public${imageUrl}`, import.meta.url)))).toBe(true)
    }
  })

  it('maps all ten Teacher questions to their exact runtime scene assets', () => {
    const teacherMappings = Object.entries(QUESTION_SCENE_IMAGE_BY_QUESTION_ID)
      .filter(([questionId]) => questionId.startsWith('teacher-'))

    expect(teacherMappings).toHaveLength(10)
    for (let questionNumber = 1; questionNumber <= 10; questionNumber += 1) {
      const paddedNumber = String(questionNumber).padStart(2, '0')
      expect(resolveQuestionSceneImageUrl(`teacher-${paddedNumber}`, null))
        .toBe(`/assets/question-scenes/teacher/teacher-${paddedNumber}.webp`)
    }
    expect(resolveQuestionSceneImageUrl('teacher-02', null)).toBe('/assets/question-scenes/teacher/teacher-02.webp')
    expect(resolveQuestionSceneImageUrl('teacher-09', null)).toBe('/assets/question-scenes/teacher/teacher-09.webp')
    expect(resolveQuestionSceneImageUrl('teacher-10', null)).toBe('/assets/question-scenes/teacher/teacher-10.webp')
  })

  it('preserves existing role mapping counts while completing Teacher', () => {
    const countsByRole = Object.keys(QUESTION_SCENE_IMAGE_BY_QUESTION_ID).reduce<Record<string, number>>((counts, questionId) => {
      const roleId = questionId.slice(0, questionId.lastIndexOf('-'))
      counts[roleId] = (counts[roleId] ?? 0) + 1
      return counts
    }, {})

    expect(countsByRole).toEqual({
      contractor: 10,
      doctor: 10,
      journalist: 10,
      merchant: 10,
      municipal: 10,
      police: 10,
      student: 10,
      teacher: 10,
    })
    expect(resolveQuestionSceneImageUrl('journalist-10', null)).toBe('/assets/question-scenes/journalist/news-10.webp')
  })

  it('preserves a configured presentation image and leaves genuinely unmapped questions without one', () => {
    expect(resolveQuestionSceneImageUrl('doctor-01', '/custom/doctor-scene.webp')).toBe('/custom/doctor-scene.webp')
    expect(resolveQuestionSceneImageUrl('unknown-01', null)).toBeNull()

    const playableWithoutImage = renderToStaticMarkup(activeQuestion('คำถามที่ไม่มีภาพ'))
    expect(playableWithoutImage).toContain('คำถามที่ไม่มีภาพ')
    expect(playableWithoutImage.match(/<button/g)).toHaveLength(2)
    expect(playableWithoutImage).not.toContain('game-play-question-media')
  })

  it('uses one intrinsic-size-independent frame contract for differently shaped source assets', () => {
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const mappedFrames = Object.values(QUESTION_SCENE_IMAGE_BY_QUESTION_ID).map((src) =>
      renderToStaticMarkup(<QuestionSceneImage src={src} />),
    )

    expect(mappedFrames).toHaveLength(80)
    for (const markup of mappedFrames) {
      expect(markup).toContain('class="game-play-question-media"')
      expect(markup).toContain('width="1280"')
      expect(markup).toContain('height="960"')
      expect(markup).toContain('loading="eager"')
      expect(markup).toContain('fetchPriority="high"')
      expect(markup).not.toContain('style=')
    }
    expect(styles).toContain('aspect-ratio: 16 / 9')
    expect(styles).toContain('object-fit: cover')
    expect(styles).toContain('overflow: hidden')
  })

  it('hides only failed media and restores the playable full-width composition', () => {
    const frame = { setAttribute: vi.fn() }
    const layout = { classList: { remove: vi.fn() } }
    const image = {
      closest: vi.fn((selector: string) => selector === '.game-play-question-media' ? frame : layout),
    } as unknown as HTMLImageElement

    hideFailedQuestionScene(image)

    expect(frame.setAttribute).toHaveBeenCalledWith('hidden', '')
    expect(layout.classList.remove).toHaveBeenCalledWith('has-scene')
  })
})

describe('student question responsive layout contracts', () => {
  const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  const questionLayoutStyles = styles.slice(styles.indexOf('/* Role-question scene illustrations'))

  it('keeps question, centered image, answers, and feedback in one reading-order column', () => {
    const copyPosition = questionLayoutStyles.indexOf('"copy"')
    const mediaPosition = questionLayoutStyles.indexOf('"media"')
    const choicesPosition = questionLayoutStyles.indexOf('"choices"')
    const feedbackPosition = questionLayoutStyles.indexOf('"feedback"')

    expect(copyPosition).toBeGreaterThan(-1)
    expect(copyPosition).toBeLessThan(mediaPosition)
    expect(mediaPosition).toBeLessThan(choicesPosition)
    expect(choicesPosition).toBeLessThan(feedbackPosition)
    expect(questionLayoutStyles).not.toMatch(/grid-template-areas:\s*\n\s*"copy media"/)
    expect(questionLayoutStyles).not.toContain('minmax(15rem, .8fr)')
  })

  it('uses the same stacked layout on desktop, tablet, portrait, and short landscape', () => {
    expect(questionLayoutStyles.match(/grid-template-areas:/g)).toHaveLength(1)
    expect(questionLayoutStyles).toContain('@media (max-height: 520px) and (orientation: landscape)')
    expect(questionLayoutStyles).toContain('min-height: calc(100dvh - .7rem) !important')
    expect(questionLayoutStyles).not.toContain('@media (min-width: 900px) and (min-height: 600px)')
  })

  it('keeps student pages flow-safe and meaningful text fully wrappable', () => {
    expect(styles).toMatch(/\.our-city-page\.game-play-page,[\s\S]*?overflow-x: hidden;/)
    expect(styles).toMatch(/\.game-play-shell,[\s\S]*?\.crisis-student-card \{[\s\S]*?min-width: 0;/)
    expect(styles).toMatch(/\.game-play-header h1,[\s\S]*?\.student-impact-waiting strong \{[\s\S]*?overflow-wrap: break-word;[\s\S]*?text-overflow: clip;[\s\S]*?white-space: normal;/)
    expect(styles).not.toMatch(/\.game-play-(?:prompt|choice)[^{]*\{[^}]*text-overflow:\s*ellipsis/)
  })

  it('centers a common cover frame between full-width copy and responsive answers', () => {
    const frameRule = styles.match(/\.game-play-question-media \{([^}]*)\}/)?.[1] ?? ''
    const imageRule = styles.match(/\.game-play-question-media img \{([^}]*)\}/)?.[1] ?? ''

    expect(styles).toMatch(/\.game-play-question-copy \{ width: 100%;/)
    expect(frameRule).toContain('width: min(100%, var(--question-scene-frame-max))')
    expect(frameRule).toContain('aspect-ratio: 16 / 9')
    expect(frameRule).toContain('align-self: center')
    expect(frameRule).toContain('overflow: hidden')
    expect(frameRule).toContain('margin: 0 auto')
    expect(imageRule).toContain('position: absolute')
    expect(imageRule).toContain('width: 100%')
    expect(imageRule).toContain('height: 100%')
    expect(imageRule).toContain('object-fit: cover')
    expect(imageRule).not.toContain('height: auto')
    expect(styles).toMatch(/\.game-play-question-layout > \.game-play-choices \{[\s\S]*?width: 100%;[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 18rem\), 1fr\)\)/)
    expect(styles).toContain('min-height: max(4.5rem, 44px) !important')
    expect(styles).toContain('min-height: max(3.5rem, 44px) !important')
  })

  it('uses one responsive frame maximum per viewport rather than per-image sizing', () => {
    expect(questionLayoutStyles).toContain('--question-scene-frame-max: 36rem')
    expect(questionLayoutStyles).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*?--question-scene-frame-max: 20rem;/)
    expect(questionLayoutStyles).not.toMatch(/question-scene-frame-max:\s*var\(--question/)
  })

  it('includes compact Crisis and submitted-waiting treatments without changing their markup', () => {
    expect(styles).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*?\.crisis-student-page \.crisis-student-header/)
    expect(styles).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*?\.student-impact-waiting \{/)
    expect(styles).toMatch(/\.student-question-entry \{[\s\S]*?flex: 1;/)
  })
})
