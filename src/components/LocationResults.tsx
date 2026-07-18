import type { LocationId, LocationSummary } from '../domain/cityScoring'
import { LOCATION_POSITIONS } from './classroomUi'

const LOCATIONS: readonly { id: LocationId; label: string }[] = [
  { id: 'hospital', label: 'โรงพยาบาล' },
  { id: 'municipal-office', label: 'สำนักเทศบาล' },
  { id: 'police-station', label: 'สถานีตำรวจ' },
  { id: 'school', label: 'โรงเรียน' },
  { id: 'market', label: 'ตลาด' },
  { id: 'construction', label: 'พื้นที่ก่อสร้าง' },
  { id: 'news-office', label: 'สำนักข่าว' },
]

const signed = (value: number): string => {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

export const LocationResults = ({ summaries }: { summaries: Record<LocationId, LocationSummary> }) => (
  <div className="location-results">
    {LOCATIONS.map(({ id, label }) => {
      const result = summaries[id]
      return (
        <article
          className="location-result-card"
          key={id}
          style={{ '--location-x': `${LOCATION_POSITIONS[id].x}%`, '--location-y': `${LOCATION_POSITIONS[id].y}%` } as React.CSSProperties}
        >
          <h2>{label}</h2>
          <p>สุจริต {result.integrityCount} • ทุจริต {result.corruptionCount} • ไม่ตอบ {result.timeoutCount}</p>
          <strong className={result.scoreAverage >= 0 ? 'location-impact--positive' : 'location-impact--negative'}>
            ผลต่อเมือง {signed(result.scoreAverage)}
          </strong>
        </article>
      )
    })}
  </div>
)
