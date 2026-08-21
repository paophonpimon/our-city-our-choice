import { applyNetworkProfile } from './network.mjs'

function wireDiagnostics(page, recorder, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') void recorder.log(label, 'console-error', { text: msg.text() })
  })
  page.on('pageerror', (err) => {
    void recorder.log(label, 'page-error', { message: err.message })
  })
  page.on('requestfailed', (req) => {
    void recorder.log(label, 'request-failed', { url: req.url(), method: req.method(), failure: req.failure()?.errorText })
  })
  page.on('response', (res) => {
    if (res.status() >= 400) void recorder.log(label, 'bad-response', { url: res.url(), status: res.status() })
  })
  page.on('dialog', (dialog) => {
    void recorder.log(label, 'unexpected-dialog-auto-dismissed', { message: dialog.message() })
    void dialog.dismiss().catch(() => undefined)
  })
}

class BaseActor {
  constructor(recorder, label) {
    this.recorder = recorder
    this.label = label
  }

  async init(browser, { baseUrl, latencyProfile = 'normal', viewport } = {}) {
    this.baseUrl = baseUrl
    this.context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 900 } })
    this.page = await this.context.newPage()
    wireDiagnostics(this.page, this.recorder, this.label)
    if (latencyProfile !== 'normal') await applyNetworkProfile(this.page, latencyProfile)
    this.latencyProfile = latencyProfile
    await this.recorder.log(this.label, 'init', { latencyProfile })
  }

  async snap(step) {
    return this.recorder.screenshot(this.page, this.label, step)
  }

  async close() {
    await this.context?.close().catch(() => undefined)
  }

  async reload() {
    const startedAt = Date.now()
    await this.page.reload({ waitUntil: 'domcontentloaded' })
    await this.recorder.log(this.label, 'reload', { ms: Date.now() - startedAt })
  }

  async goOffline() {
    await this.context.setOffline(true)
    await this.recorder.log(this.label, 'offline')
  }

  async goOnline() {
    await this.context.setOffline(false)
    await this.recorder.log(this.label, 'online')
  }
}

export class TeacherActor extends BaseActor {
  async open() {
    const startedAt = Date.now()
    await this.page.goto(`${this.baseUrl}/teacher`, { waitUntil: 'domcontentloaded' })
    // The teacher's confirm() dialogs (end activity / reset room) are only ever
    // triggered by explicit clicks in this harness, so auto-accept is safe and
    // lets endActivity() proceed without hanging on a native dialog.
    this.page.on('dialog', (dialog) => {
      void this.recorder.log(this.label, 'dialog-accepted', { message: dialog.message() })
      void dialog.accept().catch(() => undefined)
    })
    await this.recorder.log(this.label, 'open-teacher', { ms: Date.now() - startedAt })
  }

  async waitQuestionsReady(timeoutMs = 45_000) {
    const startedAt = Date.now()
    const button = this.page.getByRole('button', { name: 'สร้างห้อง' })
    await button.waitFor({ state: 'visible', timeout: timeoutMs })
    await this.page.waitForFunction(
      () => {
        const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('สร้างห้อง'))
        return Boolean(el) && !el.disabled
      },
      { timeout: timeoutMs },
    )
    await this.recorder.log(this.label, 'questions-ready', { ms: Date.now() - startedAt })
  }

  async createRoom(questionDurationSec) {
    const durationInput = this.page.locator('.teacher-lobby-duration-field input')
    await durationInput.fill(String(questionDurationSec))
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: 'สร้างห้อง' }).click()
    const shareRow = this.page.locator('.teacher-lobby-share-row span')
    await shareRow.waitFor({ state: 'visible', timeout: 20_000 })
    const text = await shareRow.textContent()
    const match = text?.match(/room=([A-Za-z2-9]{4})/i)
    const roomId = match ? match[1].toUpperCase() : null
    if (!roomId) throw new Error(`Could not parse room code from share link text: "${text}"`)
    this.roomId = roomId
    await this.recorder.log(this.label, 'room-created', { roomId, ms: Date.now() - startedAt })
    return roomId
  }

  async rosterCount() {
    const text = await this.page.locator('.teacher-lobby-roster-count span').textContent().catch(() => null)
    return text ? Number(text.trim()) : null
  }

  async waitForRosterCount(expected, timeoutMs = 30_000) {
    const startedAt = Date.now()
    try {
      await this.page.waitForFunction(
        (n) => {
          const el = document.querySelector('.teacher-lobby-roster-count span')
          return el ? Number(el.textContent?.trim()) === n : false
        },
        expected,
        { timeout: timeoutMs },
      )
      await this.recorder.log(this.label, 'roster-count-reached', { expected, ms: Date.now() - startedAt })
      return true
    } catch {
      const actual = await this.rosterCount()
      await this.recorder.log(this.label, 'roster-count-timeout', { expected, actual, ms: Date.now() - startedAt })
      return false
    }
  }

  async startGame() {
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: 'เริ่มเกม' }).click()
    await this.recorder.log(this.label, 'start-game-clicked', { ms: Date.now() - startedAt })
  }

  async waitForRoleDraw(timeoutMs = 20_000) {
    const startedAt = Date.now()
    await this.page.waitForURL(/\/role-draw\//, { timeout: timeoutMs })
    await this.recorder.log(this.label, 'on-role-draw', { ms: Date.now() - startedAt })
  }

  async beginQuestionsFromRoleDraw(timeoutMs = 30_000) {
    const startedAt = Date.now()
    await this.page.waitForFunction(
      () => {
        const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('เริ่มคำถาม'))
        return Boolean(el) && !el.disabled
      },
      { timeout: timeoutMs },
    )
    await this.page.getByRole('button', { name: /เริ่มคำถาม/ }).click()
    await this.recorder.log(this.label, 'begin-questions-clicked', { ms: Date.now() - startedAt })
  }

  async answerProgressLabel() {
    return this.page.locator('.city-stage__answer-progress').getAttribute('aria-label').catch(() => null)
  }

  async cityScoreDisplay() {
    const text = await this.page.locator('.city-stage__score strong').textContent().catch(() => null)
    return text ? text.trim() : null
  }

  async buildingMoods() {
    return this.page.locator('.city-stage__building-mood').allTextContents().catch(() => [])
  }

  async waitAndAdvanceQuestion(timeoutMs = 90_000) {
    const startedAt = Date.now()
    const nextButton = this.page.locator('.city-stage__action-button--next')
    await nextButton.waitFor({ state: 'visible', timeout: timeoutMs })
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('.city-stage__action-button--next')
        return Boolean(el) && !el.disabled
      },
      { timeout: timeoutMs },
    )
    const label = (await nextButton.textContent())?.trim() ?? ''
    await nextButton.click()
    await this.recorder.log(this.label, 'advance-question-clicked', { label, ms: Date.now() - startedAt })
    return label
  }

  async beginCrisis(timeoutMs = 20_000) {
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: 'เริ่มเหตุการณ์วิกฤต' }).click({ timeout: timeoutMs })
    await this.recorder.log(this.label, 'begin-crisis-clicked', { ms: Date.now() - startedAt })
  }

  async crisisAnsweredLabel() {
    const text = await this.page.locator('.teacher-crisis-live strong').first().textContent().catch(() => null)
    return text ? text.trim() : null
  }

  async closeCrisisIfAvailable() {
    const button = this.page.getByRole('button', { name: 'ปิดรับและสรุปผล' })
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 5_000 }).catch(() => undefined)
      await this.recorder.log(this.label, 'close-crisis-clicked')
      return true
    }
    return false
  }

  async waitForCrisisResult(timeoutMs = 90_000) {
    const startedAt = Date.now()
    await this.page.waitForFunction(
      () => document.querySelector('.teacher-crisis-page')?.className.includes('crisis-result') ?? false,
      { timeout: timeoutMs },
    )
    await this.recorder.log(this.label, 'crisis-result-reached', { ms: Date.now() - startedAt })
  }

  async continueAfterCrisis() {
    const startedAt = Date.now()
    await this.page.locator('.teacher-crisis-actions button').filter({ hasText: 'เข้าสู่คำถามข้อ' }).click()
    await this.recorder.log(this.label, 'continue-after-crisis-clicked', { ms: Date.now() - startedAt })
  }

  async waitForResultPage(timeoutMs = 30_000) {
    const startedAt = Date.now()
    await this.page.waitForURL(/\/result\//, { timeout: timeoutMs })
    await this.page.locator('.teacher-result-page').waitFor({ state: 'visible', timeout: timeoutMs })
    await this.recorder.log(this.label, 'on-result-page', { ms: Date.now() - startedAt })
  }

  async resultCityScore() {
    // The score <strong> also wraps a nested "<small>/ 1,000</small>" node,
    // so reading textContent would concatenate both numbers together — pull
    // only the element's direct text nodes instead.
    const text = await this.page.locator('.teacher-result-hero__score strong').first().evaluate((el) =>
      Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(''),
    )
    return Number(text?.replace(/[^\d]/g, '') ?? NaN)
  }

  async continueCity() {
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: /เล่นต่อเพื่อพัฒนาเมือง/ }).click()
    await this.recorder.log(this.label, 'continue-city-clicked', { ms: Date.now() - startedAt })
  }

  async endActivity() {
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: 'จบกิจกรรม' }).click()
    await this.recorder.log(this.label, 'end-activity-clicked', { ms: Date.now() - startedAt })
  }

  async createNewRoomFromResult() {
    const startedAt = Date.now()
    await this.page.getByRole('button', { name: 'สร้างห้องใหม่' }).click()
    await this.page.waitForURL(/\/teacher\/?(\?.*)?$/, { timeout: 15_000 })
    await this.recorder.log(this.label, 'create-new-room-clicked', { ms: Date.now() - startedAt })
  }
}

export class StudentActor extends BaseActor {
  async join(roomId, { nickname, classSection, studentNumber }) {
    const startedAt = Date.now()
    await this.page.goto(`${this.baseUrl}/join?room=${roomId}`, { waitUntil: 'domcontentloaded' })
    await this.page.getByPlaceholder('กรอกชื่อและนามสกุล').fill(nickname)
    await this.page.getByPlaceholder('เช่น ม.1/1').fill(classSection)
    await this.page.getByPlaceholder('เลขที่').fill(String(studentNumber))
    await this.page.getByRole('button', { name: 'เข้าสู่ห้องเรียน' }).click()
    await this.page.waitForURL(/\/lobby\//, { timeout: 20_000 })
    this.nickname = nickname
    await this.recorder.log(this.label, 'joined', { roomId, nickname, ms: Date.now() - startedAt })
  }

  async lobbyParticipantCount() {
    const text = await this.page.locator('.student-wait-participants strong').textContent().catch(() => null)
    const match = text?.match(/(\d+)\s*\//)
    return match ? Number(match[1]) : null
  }

  async waitForRoleDrawNavigation(timeoutMs = 30_000) {
    const startedAt = Date.now()
    await this.page.waitForURL(/\/role-draw\//, { timeout: timeoutMs })
    await this.recorder.log(this.label, 'on-role-draw', { ms: Date.now() - startedAt })
  }

  async waitForRoleReveal(timeoutMs = 15_000) {
    const startedAt = Date.now()
    await this.page.locator('.role-draw-player-result strong').first().waitFor({ state: 'visible', timeout: timeoutMs })
    const role = (await this.page.locator('.role-draw-player-result strong').first().textContent())?.trim() ?? null
    await this.recorder.log(this.label, 'role-revealed', { role, ms: Date.now() - startedAt })
    return role
  }

  async waitForGamePage(timeoutMs = 30_000) {
    const startedAt = Date.now()
    await this.page.waitForURL(/\/game\//, { timeout: timeoutMs })
    await this.recorder.log(this.label, 'on-game-page', { ms: Date.now() - startedAt })
  }

  async currentQuestionNumber() {
    const text = await this.page.locator('.game-play-header h1').textContent().catch(() => null)
    const match = text?.match(/ข้อที่\s*(\d+)/)
    return match ? Number(match[1]) : null
  }

  async answerQuestionIfOpen({ choiceIndex = 0, timeoutMs = 15_000 } = {}) {
    const startedAt = Date.now()
    const choices = this.page.locator('.game-play-choice')
    try {
      await choices.first().waitFor({ state: 'visible', timeout: timeoutMs })
    } catch {
      await this.recorder.log(this.label, 'answer-question-no-choices', { ms: Date.now() - startedAt })
      return { submitted: false, reason: 'no-choices-visible' }
    }
    const count = await choices.count()
    const target = choices.nth(choiceIndex % Math.max(count, 1))
    if (await target.isDisabled().catch(() => true)) {
      await this.recorder.log(this.label, 'answer-question-disabled', { ms: Date.now() - startedAt })
      return { submitted: false, reason: 'disabled' }
    }
    try {
      await target.click({ timeout: timeoutMs })
    } catch (error) {
      await this.recorder.log(this.label, 'answer-question-click-failed', { error: String(error) })
      return { submitted: false, reason: 'click-failed' }
    }
    const confirmed = await this.page
      .locator('.game-play-feedback')
      .getByText('ส่งคำตอบแล้ว')
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => true)
      .catch(() => false)
    await this.recorder.log(this.label, 'answer-question-submitted', { confirmed, ms: Date.now() - startedAt })
    return { submitted: confirmed, reason: confirmed ? null : 'no-confirmation' }
  }

  async answerCrisisIfOpen({ choiceIndex = 0, timeoutMs = 15_000 } = {}) {
    const startedAt = Date.now()
    const choices = this.page.locator('.crisis-student-choices button')
    try {
      await choices.first().waitFor({ state: 'visible', timeout: timeoutMs })
    } catch {
      await this.recorder.log(this.label, 'answer-crisis-no-choices', { ms: Date.now() - startedAt })
      return { submitted: false, reason: 'no-choices-visible' }
    }
    const count = await choices.count()
    const target = choices.nth(choiceIndex % Math.max(count, 1))
    if (await target.isDisabled().catch(() => true)) {
      return { submitted: false, reason: 'disabled' }
    }
    try {
      await target.click({ timeout: timeoutMs })
    } catch (error) {
      await this.recorder.log(this.label, 'answer-crisis-click-failed', { error: String(error) })
      return { submitted: false, reason: 'click-failed' }
    }
    const confirmed = await this.page
      .locator('.crisis-student-feedback')
      .getByText('ส่งการตัดสินใจแล้ว')
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => true)
      .catch(() => false)
    await this.recorder.log(this.label, 'answer-crisis-submitted', { confirmed, ms: Date.now() - startedAt })
    return { submitted: confirmed, reason: confirmed ? null : 'no-confirmation' }
  }

  async isStuckOnQuestion(expectedNumber) {
    const current = await this.currentQuestionNumber()
    return current !== null && current !== expectedNumber
  }

  async waitForResultPage(timeoutMs = 30_000) {
    await this.page.waitForURL(/\/result\//, { timeout: timeoutMs })
    await this.page.locator('.student-cycle-result').waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => undefined)
  }

  async personalResultCounts() {
    const read = async (selector) => {
      const text = await this.page.locator(selector).first().textContent().catch(() => null)
      if (!text || text.trim() === '—') return null
      return Number(text.trim())
    }
    return {
      integrity: await read('.is-integrity strong'),
      corruption: await read('.is-corruption strong'),
      timeout: await read('.is-timeout strong'),
    }
  }
}
