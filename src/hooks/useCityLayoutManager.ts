import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePublishedCityLayout } from '../context/CityLayoutContext'
import { useGame } from '../context/GameContext'
import {
  CITY_LAYOUT_COMBINATION_COUNT,
  CITY_LAYOUT_STORAGE_KEY,
  CITY_LAYOUT_STORAGE_KEY_V1,
  cityLayoutDraftId,
  cityLayoutLabelDraftId,
  countCityLayoutDraftLabels,
  countCityLayoutDraftPlacements,
  draftRecordsToLabelOverrides,
  draftRecordsToOverrides,
  isLabelCityLayoutDraftRecord,
  isModelCityLayoutDraftRecord,
  labelOverridesToDraftRecords,
  overridesToDraftRecords,
  readCityLayoutOverrides,
  resolveCompleteCityLayout,
  setLayoutPlacement,
  setLabelLayoutPlacement,
  type CityLayoutDraftRecord,
  type CityLabelLayoutOverrides,
  type CityLayoutOverrides,
  type CityLayoutPublishedSnapshot,
} from '../domain/cityLayoutOverrides'
import { classroomFriendlyError } from '../services'

const applyRecords = (draft: CityLayoutOverrides, records: readonly CityLayoutDraftRecord[]): CityLayoutOverrides =>
  records.filter(isModelCityLayoutDraftRecord).reduce((current, record) => setLayoutPlacement(current, record.scene, record.building, record.level, {
    x: record.x,
    y: record.y,
    scaleX: record.scaleX,
    scaleY: record.scaleY,
  }), draft)

const applyLabelRecords = (
  draft: CityLabelLayoutOverrides,
  records: readonly CityLayoutDraftRecord[],
): CityLabelLayoutOverrides => records.filter(isLabelCityLayoutDraftRecord).reduce((current, record) =>
  setLabelLayoutPlacement(current, record.scene, record.building, record.level, {
    labelX: record.labelX,
    labelY: record.labelY,
  }), draft)

const draftRecordId = (record: CityLayoutDraftRecord): string => isLabelCityLayoutDraftRecord(record)
  ? cityLayoutLabelDraftId(record.scene, record.building, record.level)
  : cityLayoutDraftId(record.scene, record.building, record.level)

export const useCityLayoutManager = (enabled: boolean) => {
  const { service, uid } = useGame()
  const { publishedLayout, status: publishedStatus } = usePublishedCityLayout()
  const [draft, setDraft] = useState<CityLayoutOverrides>({})
  const [labelDraft, setLabelDraft] = useState<CityLabelLayoutOverrides>({})
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [versions, setVersions] = useState<CityLayoutPublishedSnapshot[]>([])
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [legacyDraft, setLegacyDraft] = useState<CityLayoutOverrides | null>(null)
  const [legacyOfferChecked, setLegacyOfferChecked] = useState(false)
  const pendingRef = useRef(new Map<string, CityLayoutDraftRecord>())
  const saveTimerRef = useRef<number | null>(null)
  const publishedReady = publishedStatus === 'resolved'
  const isStagingLayoutEditor = service.cityLayoutRuntime === 'staging'
  const canEdit = enabled && publishedReady && isStagingLayoutEditor

  useEffect(() => {
    if (!canEdit) {
      setDraft({})
      setLabelDraft({})
      setDraftLoaded(false)
      setVersions([])
      setLegacyDraft(null)
      setLegacyOfferChecked(false)
      return undefined
    }
    const unsubscribeDraft = service.subscribeCityLayoutDraft(uid, (records) => {
      const central = draftRecordsToOverrides(records)
      const centralLabels = draftRecordsToLabelOverrides(records)
      setDraft(applyRecords(central, [...pendingRef.current.values()]))
      setLabelDraft(applyLabelRecords(centralLabels, [...pendingRef.current.values()]))
      setDraftLoaded(true)
    }, setFeedback)
    const unsubscribeVersions = service.subscribeCityLayoutVersions(uid, setVersions, setFeedback)
    return () => {
      unsubscribeDraft()
      unsubscribeVersions()
    }
  }, [canEdit, service, uid])

  useEffect(() => {
    if (!enabled || !canEdit || !draftLoaded
      || countCityLayoutDraftPlacements(draft) > 0
      || countCityLayoutDraftLabels(labelDraft) > 0
      || legacyOfferChecked) return
    setLegacyOfferChecked(true)
    try {
      const hasLegacy = window.localStorage.getItem(CITY_LAYOUT_STORAGE_KEY) !== null
        || window.localStorage.getItem(CITY_LAYOUT_STORAGE_KEY_V1) !== null
      if (hasLegacy) setLegacyDraft(readCityLayoutOverrides())
    } catch {
      // Legacy discovery is optional and never affects central rendering.
    }
  }, [canEdit, draft, draftLoaded, enabled, labelDraft, legacyOfferChecked])

  const flushPending = useCallback(async (): Promise<void> => {
    if (!canEdit || pendingRef.current.size === 0) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const records = [...pendingRef.current.values()]
    pendingRef.current.clear()
    try {
      await service.saveCityLayoutDraft(uid, records)
      setFeedback('บันทึก Draft กลางแล้ว')
    } catch (reason) {
      for (const record of records) pendingRef.current.set(draftRecordId(record), record)
      setFeedback(classroomFriendlyError(reason))
    }
  }, [canEdit, service, uid])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    if (pendingRef.current.size > 0 && canEdit) {
      void service.saveCityLayoutDraft(uid, [...pendingRef.current.values()]).catch(() => undefined)
    }
  }, [canEdit, service, uid])

  const saveDraft = useCallback((records: readonly CityLayoutDraftRecord[]): void => {
    if (!canEdit || records.length === 0) return
    setDraft((current) => applyRecords(current, records))
    setLabelDraft((current) => applyLabelRecords(current, records))
    for (const record of records) pendingRef.current.set(draftRecordId(record), record)
    setFeedback('กำลังบันทึก Draft กลาง...')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { void flushPending() }, 180)
  }, [canEdit, flushPending])

  const deleteDraft = useCallback(async (draftIds: readonly string[]): Promise<void> => {
    if (!canEdit || draftIds.length === 0) return
    const deleting = new Set(draftIds)
    for (const draftId of deleting) pendingRef.current.delete(draftId)
    setBusy(true)
    try {
      await service.deleteCityLayoutDraft(uid, draftIds)
      setDraft((current) => draftRecordsToOverrides(
        overridesToDraftRecords(current).filter((record) => !deleting.has(cityLayoutDraftId(record.scene, record.building, record.level))),
      ))
      setLabelDraft((current) => draftRecordsToLabelOverrides(
        labelOverridesToDraftRecords(current).filter((record) =>
          !deleting.has(cityLayoutLabelDraftId(record.scene, record.building, record.level))),
      ))
      setFeedback('คืน Draft แล้ว')
    } catch (reason) {
      setFeedback(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }, [canEdit, service, uid])

  const publish = useCallback(async (): Promise<CityLayoutPublishedSnapshot | null> => {
    if (!canEdit) return null
    setBusy(true)
    try {
      const completeDraft = applyRecords(draft, [...pendingRef.current.values()])
      const completeLabelDraft = applyLabelRecords(labelDraft, [...pendingRef.current.values()])
      await flushPending()
      const snapshot = await service.publishCityLayout(uid, resolveCompleteCityLayout(completeDraft, publishedLayout, completeLabelDraft))
      setFeedback(`เผยแพร่แล้ว ✓ Version: ${snapshot.versionId}`)
      return snapshot
    } catch (reason) {
      setFeedback(classroomFriendlyError(reason))
      return null
    } finally {
      setBusy(false)
    }
  }, [canEdit, draft, flushPending, labelDraft, publishedLayout, service, uid])

  const rollback = useCallback(async (versionId: string): Promise<void> => {
    if (!canEdit) return
    setBusy(true)
    try {
      await service.rollbackCityLayout(uid, versionId)
      setFeedback(`กลับไปใช้เวอร์ชัน ${versionId} แล้ว`)
    } catch (reason) {
      setFeedback(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }, [canEdit, service, uid])

  const importLegacy = useCallback((): void => {
    if (!legacyDraft || !canEdit) return
    const records = overridesToDraftRecords(legacyDraft)
    saveDraft(records)
    setLegacyDraft(null)
    setFeedback(`นำเข้าค่าเดิมเป็น Draft ${records.length} จุดแล้ว`)
  }, [canEdit, legacyDraft, saveDraft])

  const completePlacements = useMemo(
    () => resolveCompleteCityLayout(draft, publishedLayout, labelDraft),
    [draft, labelDraft, publishedLayout],
  )

  return {
    busy,
    canEdit,
    completePlacements,
    draft,
    draftCount: countCityLayoutDraftPlacements(draft),
    labelDraft,
    labelDraftCount: countCityLayoutDraftLabels(labelDraft),
    feedback,
    importLegacy,
    isStagingLayoutEditor,
    legacyDraft,
    publishedLayout,
    publishedReady,
    resolvedCount: CITY_LAYOUT_COMBINATION_COUNT,
    rollback,
    saveDraft,
    setLegacyDraft,
    deleteDraft,
    publish,
    uid,
    versions,
  }
}
