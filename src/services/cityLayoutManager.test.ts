import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cityLayoutDraftId,
  cityLayoutLabelDraftId,
  draftRecordsToLabelOverrides,
  draftRecordsToOverrides,
  resolveCompleteCityLayout,
  resolveProductionPlacement,
  setLabelLayoutPlacement,
  setLayoutPlacement,
  type CityLayoutDraftRecord,
  type CityLayoutPublishedSnapshot,
} from '../domain/cityLayoutOverrides'
import {
  DemoClassroomGameService,
  resetDemoClassroomStateForTests,
} from './demoClassroomService'

const EDITOR_UID = 'central-layout-editor'

const placementA = { x: 12, y: -7, scaleX: 1.1, scaleY: .9 }
const placementB = { x: -22, y: 14, scaleX: .85, scaleY: 1.15 }

const draftRecord = (placement = placementA): CityLayoutDraftRecord => ({
  scene: 'normal',
  building: 'hospital',
  level: 2,
  ...placement,
  updatedAt: 1,
})

const readDraft = (service: DemoClassroomGameService, uid = EDITOR_UID): CityLayoutDraftRecord[] => {
  let value: CityLayoutDraftRecord[] = []
  const unsubscribe = service.subscribeCityLayoutDraft(uid, (next) => { value = next }, () => undefined)
  unsubscribe()
  return value
}

const readPublished = (service: DemoClassroomGameService): CityLayoutPublishedSnapshot | null => {
  let value: CityLayoutPublishedSnapshot | null = null
  const unsubscribe = service.subscribePublishedCityLayout((next) => { value = next }, () => undefined)
  unsubscribe()
  return value
}

const readVersions = (service: DemoClassroomGameService): CityLayoutPublishedSnapshot[] => {
  let value: CityLayoutPublishedSnapshot[] = []
  const unsubscribe = service.subscribeCityLayoutVersions(EDITOR_UID, (next) => { value = next }, () => undefined)
  unsubscribe()
  return value
}

describe('central city layout manager lifecycle', () => {
  beforeEach(() => {
    resetDemoClassroomStateForTests()
  })

  it('is immediately available as a staging calibration service without owner provisioning', async () => {
    const service = new DemoClassroomGameService()
    expect(service.cityLayoutRuntime).toBe('staging')
    await expect(service.saveCityLayoutDraft(EDITOR_UID, [draftRecord()])).resolves.toBeUndefined()
    await expect(service.publishCityLayout(EDITOR_UID, resolveCompleteCityLayout({}, null))).resolves.toMatchObject({
      schemaVersion: 2,
    })
  })

  it('rejects a complete-looking snapshot when any placement is outside the sane bounds', async () => {
    const service = new DemoClassroomGameService()
    const placements = resolveCompleteCityLayout({}, null)
    placements.normal.hospital[2].scaleX = 99

    await expect(service.publishCityLayout(EDITOR_UID, placements)).rejects.toThrow('ครบ 105 จุด')
    expect(readPublished(service)).toBeNull()
  })

  it('autosave target is central Draft and survives a new service instance/refresh', async () => {
    const firstBrowser = new DemoClassroomGameService()
    await firstBrowser.saveCityLayoutDraft(EDITOR_UID, [draftRecord()])

    const refreshedBrowser = new DemoClassroomGameService()
    expect(readDraft(refreshedBrowser)).toEqual([expect.objectContaining({
      scene: 'normal', building: 'hospital', level: 2, ...placementA,
    })])
  })

  it('keeps Draft isolated until Publish creates a complete immutable version and current snapshot', async () => {
    const service = new DemoClassroomGameService()
    const beforePublish = resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2)
    await service.saveCityLayoutDraft(EDITOR_UID, [draftRecord()])

    expect(resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2)).toEqual(beforePublish)

    const draft = draftRecordsToOverrides(readDraft(service))
    const firstVersion = await service.publishCityLayout(EDITOR_UID, resolveCompleteCityLayout(draft, null))
    expect(resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2))
      .toMatchObject({ ...placementA, source: 'PUBLISHED', labelSource: 'PUBLISHED' })
    expect(readVersions(service)).toEqual([firstVersion])

    await service.saveCityLayoutDraft(EDITOR_UID, [draftRecord(placementB)])
    expect(resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2))
      .toMatchObject({ ...placementA, source: 'PUBLISHED', labelSource: 'PUBLISHED' })
  })

  it('publishes a later version and rollback restores the earlier complete snapshot without mutating history', async () => {
    const service = new DemoClassroomGameService()
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000)
    const firstPlacements = resolveCompleteCityLayout(
      setLayoutPlacement({}, 'normal', 'hospital', 2, placementA),
      null,
    )
    const firstVersion = await service.publishCityLayout(EDITOR_UID, firstPlacements)
    const secondPlacements = resolveCompleteCityLayout(
      setLayoutPlacement({}, 'normal', 'hospital', 2, placementB),
      firstVersion,
    )
    const secondVersion = await service.publishCityLayout(EDITOR_UID, secondPlacements)

    expect(readVersions(service).map((version) => version.versionId)).toEqual([secondVersion.versionId, firstVersion.versionId])
    expect(resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2))
      .toMatchObject({ ...placementB, source: 'PUBLISHED', labelSource: 'PUBLISHED' })

    await service.rollbackCityLayout(EDITOR_UID, firstVersion.versionId)
    expect(resolveProductionPlacement(readPublished(service), 'normal', 'hospital', 2))
      .toMatchObject({ ...placementA, source: 'PUBLISHED', labelSource: 'PUBLISHED' })
    expect(readVersions(service).find((version) => version.versionId === firstVersion.versionId)?.placements)
      .toEqual(firstVersion.placements)
    now.mockRestore()
  })

  it('clears only the explicitly selected Draft record', async () => {
    const service = new DemoClassroomGameService()
    const second = { ...draftRecord(placementB), building: 'school' as const }
    await service.saveCityLayoutDraft(EDITOR_UID, [draftRecord(), second])
    await service.deleteCityLayoutDraft(EDITOR_UID, [cityLayoutDraftId('normal', 'hospital', 2)])

    expect(readDraft(service)).toEqual([expect.objectContaining({ building: 'school', ...placementB })])
  })

  it('persists, publishes, and resets a label Draft independently from the model Draft', async () => {
    const service = new DemoClassroomGameService()
    const labelRecord = {
      scene: 'normal' as const,
      building: 'hospital' as const,
      level: 2 as const,
      labelX: 444,
      labelY: 222,
      updatedAt: 1,
    }
    await service.saveCityLayoutDraft(EDITOR_UID, [draftRecord(), labelRecord])
    const records = readDraft(service)
    expect(draftRecordsToLabelOverrides(records).normal?.hospital?.[2]).toEqual({ labelX: 444, labelY: 222 })

    const placements = resolveCompleteCityLayout(
      draftRecordsToOverrides(records),
      null,
      draftRecordsToLabelOverrides(records),
    )
    const published = await service.publishCityLayout(EDITOR_UID, placements)
    expect(published.placements.normal.hospital[2]).toMatchObject({ ...placementA, labelX: 444, labelY: 222 })

    await service.deleteCityLayoutDraft(EDITOR_UID, [cityLayoutLabelDraftId('normal', 'hospital', 2)])
    expect(readDraft(service)).toEqual([expect.objectContaining({ ...placementA })])
    expect(draftRecordsToOverrides(readDraft(service)).normal?.hospital?.[2]).toEqual(placementA)
  })

  it('copying label overrides across levels and scenes does not alter model placements', () => {
    const labelDraft = (['degraded', 'normal', 'developed'] as const).reduce((scenes, scene) =>
      ([-2, -1, 0, 1, 2] as const).reduce((levels, level) =>
        setLabelLayoutPlacement(levels, scene, 'school', level, { labelX: 300, labelY: 200 }), scenes), {})
    const complete = resolveCompleteCityLayout({}, null, labelDraft)
    expect(complete.degraded.school[-2]).toMatchObject({ labelX: 300, labelY: 200 })
    expect(complete.developed.school[2]).toMatchObject({ labelX: 300, labelY: 200 })
    const defaultSchool = resolveProductionPlacement(null, 'normal', 'school', 0)
    expect(complete.normal.school[0]).toMatchObject({
      x: defaultSchool.x,
      y: defaultSchool.y,
      scaleX: defaultSchool.scaleX,
      scaleY: defaultSchool.scaleY,
      labelX: 300,
      labelY: 200,
    })
  })
})
