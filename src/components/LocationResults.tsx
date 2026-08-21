import type { LocationId, LocationSummary } from '../domain/cityScoring'
import { SCORE_POSITIONS, signedLocationScore } from './locationScoreDisplay'

const LOCATIONS: readonly { id: LocationId; label: string }[] = [
  { id: 'hospital', label: 'โรงพยาบาล' },
  { id: 'municipal-office', label: 'สำนักเทศบาล' },
  { id: 'police-station', label: 'สถานีตำรวจ' },
  { id: 'school', label: 'โรงเรียน' },
  { id: 'market', label: 'ตลาด' },
  { id: 'construction', label: 'พื้นที่ก่อสร้าง' },
  { id: 'news-office', label: 'สำนักข่าว' },
]

export const LocationResults = ({ summaries }: { summaries: Record<LocationId, LocationSummary> }) => (
  <div className="location-results">
    {LOCATIONS.map(({ id, label }) => {
      const result = summaries[id]
      const position = SCORE_POSITIONS[id]
      return (
        <article
          className="location-result-card"
          key={id}
          aria-label={`${label} ${signedLocationScore(result.scoreAverage)}`}
          title={`${label}: ${signedLocationScore(result.scoreAverage)}`}
          style={{ '--location-x': `${position.x}%`, '--location-y': `${position.y}%` } as React.CSSProperties}
        >
          <strong className={result.scoreAverage >= 0 ? 'location-impact--positive' : 'location-impact--negative'}>
            {signedLocationScore(result.scoreAverage)}
          </strong>
        </article>
      )
    })}
  </div>
)
