import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { CITY_LAYOUT_SCHEMA_VERSION, resolveCompleteCityLayout } from '../src/domain/cityLayoutOverrides'

const PROJECT_ID = 'our-city-our-choice-staging'
const STAGING_UID = 'any-signed-in-staging-user'
let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.staging.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => testEnv?.cleanup())
beforeEach(async () => testEnv.clearFirestore())

const publish = async (db: Firestore, versionId: string, placements = resolveCompleteCityLayout({}, null)) => {
  const value = { schemaVersion: CITY_LAYOUT_SCHEMA_VERSION, versionId, placements, publishedAt: serverTimestamp() }
  const batch = writeBatch(db)
  batch.set(doc(db, `cityLayoutVersions/${versionId}`), value)
  batch.set(doc(db, 'cityLayoutPublished/current'), value)
  await batch.commit()
}

const legacyPlacements = () => {
  const placements = structuredClone(resolveCompleteCityLayout({}, null)) as unknown as Record<string, Record<string, Record<string, Record<string, number>>>>
  for (const scene of Object.values(placements)) {
    for (const building of Object.values(scene)) {
      for (const placement of Object.values(building)) {
        delete placement.labelX
        delete placement.labelY
      }
    }
  }
  return placements
}

describe('staging-only central city layout permissions', () => {
  it('allows any signed-in staging app session to autosave and reset central Draft', async () => {
    const db = testEnv.authenticatedContext(STAGING_UID).firestore() as unknown as Firestore
    const ref = doc(db, 'cityLayoutDraft/normal__hospital__2')
    await assertSucceeds(setDoc(ref, {
      scene: 'normal', building: 'hospital', level: 2,
      x: 1, y: 2, scaleX: 1, scaleY: 1, updatedAt: serverTimestamp(),
    }))
    expect((await assertSucceeds(getDoc(ref))).exists()).toBe(true)
    await assertSucceeds(deleteDoc(ref))

    const labelRef = doc(db, 'cityLayoutDraft/normal__hospital__2__label')
    await assertSucceeds(setDoc(labelRef, {
      scene: 'normal', building: 'hospital', level: 2,
      labelX: 420, labelY: 260, updatedAt: serverTimestamp(),
    }))
    expect((await assertSucceeds(getDoc(labelRef))).data()).toMatchObject({ labelX: 420, labelY: 260 })
    await assertSucceeds(deleteDoc(labelRef))
  })

  it('allows signed-in Publish of exactly 105 placements and keeps versions immutable', async () => {
    const db = testEnv.authenticatedContext(STAGING_UID).firestore() as unknown as Firestore
    await assertSucceeds(publish(db, 'staging-v1'))
    expect((await getDoc(doc(db, 'cityLayoutPublished/current'))).data()?.versionId).toBe('staging-v1')
    await assertFails(updateDoc(doc(db, 'cityLayoutVersions/staging-v1'), { publishedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(db, 'cityLayoutVersions/staging-v1')))
  })

  it('allows current to roll back to a pre-existing immutable schema-v1 version without permitting new schema-v1 versions', async () => {
    const versionId = 'legacy-v1'
    const placements = legacyPlacements()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `cityLayoutVersions/${versionId}`), {
        schemaVersion: 1,
        versionId,
        placements,
        publishedAt: new Date(0),
      })
    })

    const db = testEnv.authenticatedContext(STAGING_UID).firestore() as unknown as Firestore
    await assertSucceeds(setDoc(doc(db, 'cityLayoutPublished/current'), {
      schemaVersion: 1,
      versionId,
      placements,
      publishedAt: serverTimestamp(),
    }))
    expect((await getDoc(doc(db, 'cityLayoutPublished/current'))).data()?.schemaVersion).toBe(1)

    await assertFails(setDoc(doc(db, 'cityLayoutVersions/client-created-v1'), {
      schemaVersion: 1,
      versionId: 'client-created-v1',
      placements,
      publishedAt: serverTimestamp(),
    }))
  })

  it('rejects incomplete Published snapshots and every unauthenticated layout access', async () => {
    const signedDb = testEnv.authenticatedContext(STAGING_UID).firestore() as unknown as Firestore
    const anonymousDb = testEnv.unauthenticatedContext().firestore() as unknown as Firestore
    await assertFails(publish(signedDb, 'incomplete', { normal: {} } as never))
    await assertFails(getDoc(doc(anonymousDb, 'cityLayoutPublished/current')))
    await assertFails(setDoc(doc(anonymousDb, 'cityLayoutDraft/normal__hospital__2'), {
      scene: 'normal', building: 'hospital', level: 2,
      x: 1, y: 2, scaleX: 1, scaleY: 1, updatedAt: serverTimestamp(),
    }))
  })

  it('never permits clients to create the obsolete owner access document', async () => {
    const db = testEnv.authenticatedContext(STAGING_UID).firestore()
    await assertFails(setDoc(doc(db, 'system/cityLayoutAccess'), { ownerUid: STAGING_UID }))
  })
})
