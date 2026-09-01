import type { LiveAnswerImpact } from '../domain/liveAnswerImpact'
import type { LocationId } from '../domain/cityScoring'
import { SCORE_POSITIONS, signedLocationScore } from './locationScoreDisplay'

export interface LiveImpactPosition {
  x: number
  y: number
}

const resolveLiveImpactAnchor = (labelPosition: LiveImpactPosition): LiveImpactPosition => ({
  x: labelPosition.x,
  y: Math.max(4, labelPosition.y - 8),
})

interface LiveAnswerImpactsProps {
  impacts: readonly LiveAnswerImpact[]
  labelPositions?: Partial<Record<LocationId, LiveImpactPosition>>
}

const IMPACT_LANES = [0, -1, 1] as const

export const LiveAnswerImpacts = ({ impacts, labelPositions }: LiveAnswerImpactsProps) => (
  <div className="location-results live-answer-impacts" aria-live="polite">
    {impacts.map((impact, index) => {
      const labelPosition = labelPositions?.[impact.locationId]
      const position = labelPosition ? resolveLiveImpactAnchor(labelPosition) : SCORE_POSITIONS[impact.locationId]
      const locationIndex = impacts.slice(0, index).filter((item) => item.locationId === impact.locationId).length
      return (
        <output
          className={`live-answer-impact ${impact.score >= 0 ? 'location-impact--positive' : 'location-impact--negative'}`}
          key={impact.id}
          style={{
            '--location-x': `${position.x}%`,
            '--location-y': `${position.y}%`,
            '--impact-offset-x': `${IMPACT_LANES[locationIndex % IMPACT_LANES.length] * 0.9}rem`,
            '--impact-offset-y': `${Math.floor(locationIndex / IMPACT_LANES.length) % 2 * -1.1}rem`,
          } as React.CSSProperties}
        >
          {signedLocationScore(impact.score)}
        </output>
      )
    })}
  </div>
)
