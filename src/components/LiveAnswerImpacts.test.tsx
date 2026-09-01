import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LiveAnswerImpact } from '../domain/liveAnswerImpact'
import { LiveAnswerImpacts } from './LiveAnswerImpacts'

describe('LiveAnswerImpacts', () => {
  it('anchors the popup directly above the calibrated building label', () => {
    const markup = renderToStaticMarkup(<LiveAnswerImpacts
      impacts={[{ id: 'school-1', locationId: 'school', score: 50 }]}
      labelPositions={{ school: { x: 12, y: 7 } }}
    />)

    expect(markup).toContain('--location-x:12%;--location-y:4%;--impact-offset-x:0rem')
  })

  it('centers the first impact per building and only fans out repeated impacts at that same building', () => {
    const impacts: LiveAnswerImpact[] = [
      { id: 'market-1', locationId: 'market', score: 50 },
      { id: 'news-1', locationId: 'news-office', score: 50 },
      { id: 'market-2', locationId: 'market', score: -100 },
    ]
    const markup = renderToStaticMarkup(<LiveAnswerImpacts
      impacts={impacts}
      labelPositions={{ market: { x: 74, y: 42 }, 'news-office': { x: 72, y: 79 } }}
    />)

    expect(markup).toContain('--location-x:74%;--location-y:34%;--impact-offset-x:0rem')
    expect(markup).toContain('--location-x:72%;--location-y:71%;--impact-offset-x:0rem')
    expect(markup).toContain('--location-x:74%;--location-y:34%;--impact-offset-x:-0.9rem')
  })
})
