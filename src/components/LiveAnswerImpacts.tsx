import type { LiveAnswerImpact } from '../domain/liveAnswerImpact'
import { SCORE_POSITIONS, signedLocationScore } from './locationScoreDisplay'

export const LiveAnswerImpacts = ({ impacts }: { impacts: readonly LiveAnswerImpact[] }) => (
  <div className="location-results live-answer-impacts" aria-live="polite">
    {impacts.map((impact, index) => {
      const position = SCORE_POSITIONS[impact.locationId]
      return (
        <output
          className={`live-answer-impact ${impact.score >= 0 ? 'location-impact--positive' : 'location-impact--negative'}`}
          key={impact.id}
          style={{
            '--location-x': `${position.x}%`,
            '--location-y': `${position.y}%`,
            '--impact-offset-x': `${((index % 3) - 1) * 0.9}rem`,
          } as React.CSSProperties}
        >
          {signedLocationScore(impact.score)}
        </output>
      )
    })}
  </div>
)
