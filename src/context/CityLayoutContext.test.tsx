import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CityScene } from '../components/CityScene'
import { resolveFrozenBuildingPlacement } from '../domain/cityBuildings'
import {
  CITY_LAYOUT_SCHEMA_VERSION,
  parseCityLayoutPublishedSnapshot,
  resolveCompleteCityLayout,
  setLayoutPlacement,
  type CityLayoutPublishedSnapshot,
} from '../domain/cityLayoutOverrides'
import type { ClassroomGameService } from '../services'
import {
  CityLayoutProvider,
  CityLayoutStateProvider,
  resolvedCityLayoutState,
  unresolvedCityLayoutState,
} from './CityLayoutContext'

const customPlacement = { x: 321, y: -123, scaleX: 1.2, scaleY: .8 }

const publishedSnapshot = (
  versionId: string,
  placement = customPlacement,
): CityLayoutPublishedSnapshot => ({
  schemaVersion: CITY_LAYOUT_SCHEMA_VERSION,
  versionId,
  placements: resolveCompleteCityLayout(
    setLayoutPlacement({}, 'normal', 'hospital', 0, placement),
    null,
  ),
  publishedAt: 1_700_000_000_000,
})

const renderState = (value: ReturnType<typeof resolvedCityLayoutState> | ReturnType<typeof unresolvedCityLayoutState>): string =>
  renderToStaticMarkup(
    <CityLayoutStateProvider value={value}>
      <CityScene />
    </CityLayoutStateProvider>,
  )

const hospitalTransform = (placement: typeof customPlacement): string =>
  `transform="translate(${placement.x} ${placement.y}) scale(${placement.scaleX} ${placement.scaleY})"`

describe('CityLayoutContext first-result readiness boundary', () => {
  it('CASE A: renders only readiness UI while unresolved, then the first visible city already uses valid Published coordinates', () => {
    const serviceThatHasNotAnswered = { cityLayoutRuntime: 'staging' } as ClassroomGameService
    const initialMarkup = renderToStaticMarkup(
      <CityLayoutProvider service={serviceThatHasNotAnswered}><CityScene /></CityLayoutProvider>,
    )
    const publishedMarkup = renderState(resolvedCityLayoutState(publishedSnapshot('version-a')))
    const frozen = resolveFrozenBuildingPlacement('normal', 'hospital', 0)

    expect(initialMarkup).toContain('city-scene--layout-loading')
    expect(initialMarkup).toContain('กำลังโหลดผังเมือง')
    expect(initialMarkup).not.toContain('data-building-id=')
    expect(initialMarkup).not.toContain(hospitalTransform(frozen))
    expect(publishedMarkup).not.toContain('city-scene--layout-loading')
    expect(publishedMarkup).toContain('data-building-id="hospital"')
    expect(publishedMarkup).toContain(hospitalTransform(customPlacement))
    expect(publishedMarkup).not.toContain(hospitalTransform(frozen))
  })

  it('production runtime resolves frozen immediately and never waits for remote Published configuration', () => {
    const productionService = { cityLayoutRuntime: 'production' } as ClassroomGameService
    const markup = renderToStaticMarkup(
      <CityLayoutProvider service={productionService}><CityScene /></CityLayoutProvider>,
    )
    const frozen = resolveFrozenBuildingPlacement('normal', 'hospital', 0)

    expect(markup).not.toContain('city-scene--layout-loading')
    expect(markup).toContain(hospitalTransform(frozen))
    expect((markup.match(/data-building-id=/g) ?? [])).toHaveLength(7)
  })

  it('CASE B: missing Published resolves readiness and renders the complete frozen fallback', () => {
    const unresolvedMarkup = renderState(unresolvedCityLayoutState())
    const resolvedMarkup = renderState(resolvedCityLayoutState(null))
    const frozen = resolveFrozenBuildingPlacement('normal', 'hospital', 0)

    expect(unresolvedMarkup).not.toContain('data-building-id=')
    expect(resolvedMarkup).toContain('data-building-id="hospital"')
    expect(resolvedMarkup).toContain(hospitalTransform(frozen))
  })

  it('CASE C: an invalid/incomplete Published payload is rejected as a whole with no partial mixing', () => {
    const parsed = parseCityLayoutPublishedSnapshot({
      schemaVersion: CITY_LAYOUT_SCHEMA_VERSION,
      versionId: 'partial',
      publishedAt: 1,
      placements: { normal: { hospital: { 0: customPlacement } } },
    })
    const markup = renderState(resolvedCityLayoutState(parsed))
    const frozen = resolveFrozenBuildingPlacement('normal', 'hospital', 0)

    expect(parsed).toBeNull()
    expect(markup).toContain(hospitalTransform(frozen))
    expect(markup).not.toContain(hospitalTransform(customPlacement))
    expect((markup.match(/data-building-id=/g) ?? [])).toHaveLength(7)
  })

  it('CASE D: a subscription/read error exits loading and safely renders frozen fallback', () => {
    const markup = renderState(resolvedCityLayoutState(null, 'network unavailable'))
    const frozen = resolveFrozenBuildingPlacement('normal', 'hospital', 0)

    expect(markup).not.toContain('city-scene--layout-loading')
    expect(markup).toContain(hospitalTransform(frozen))
    expect((markup.match(/data-building-id=/g) ?? [])).toHaveLength(7)
  })

  it('CASE E: later legitimate Published updates continue switching the complete visible city', () => {
    const first = { x: 10, y: 20, scaleX: 1, scaleY: 1 }
    const second = { x: -30, y: 40, scaleX: .9, scaleY: 1.1 }
    const firstMarkup = renderState(resolvedCityLayoutState(publishedSnapshot('version-1', first)))
    const secondMarkup = renderState(resolvedCityLayoutState(publishedSnapshot('version-2', second)))

    expect(firstMarkup).toContain(hospitalTransform(first))
    expect(secondMarkup).toContain(hospitalTransform(second))
    expect(secondMarkup).not.toContain(hospitalTransform(first))
    expect((secondMarkup.match(/data-building-id=/g) ?? [])).toHaveLength(7)
  })
})
