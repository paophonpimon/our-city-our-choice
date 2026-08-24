import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreAssessmentWaitingState } from './PreAssessmentPage'

describe('PRE completed waiting state', () => {
  it('confirms the saved response without asking the student to do anything else', () => {
    const html = renderToStaticMarkup(<PreAssessmentWaitingState roomId="ROOM01" />)
    expect(html).toContain('ทำแบบประเมินก่อนกิจกรรมเสร็จแล้ว')
    expect(html).toContain('บันทึกคำตอบของคุณเรียบร้อยแล้ว')
    expect(html).toContain('รอเพื่อนทำแบบประเมินให้ครบ')
    expect(html).toContain('ไม่ต้องกดอะไรเพิ่มเติม')
    expect(html).toContain('การตัดสินใจของทุกคนจะพาเมืองไปทางไหน?')
    expect(html).toContain('city-overview-degraded.webp')
    expect(html).toContain('city-overview-normal.webp')
    expect(html).toContain('city-overview-developed.webp')
    expect(html.match(/<figure/g)).toHaveLength(3)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('กลับหน้าหลัก')
  })
})
