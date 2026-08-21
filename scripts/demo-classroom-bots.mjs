const STATE_URL = 'http://127.0.0.1:4173/__matana_demo_state'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1ndzvM2Fd021etUmJX60N_j_YaficwFkZ/gviz/tq?tqx=out:csv&sheet=QUESTIONS'
const roomId = String(process.argv[process.argv.indexOf('--room') + 1] || '').trim().toUpperCase()
const botCount = Number(process.argv[process.argv.indexOf('--count') + 1] || 8)
const corruptCount = Number(process.argv[process.argv.indexOf('--corrupt') + 1] || 5)
const staggerMs = Number(process.argv[process.argv.indexOf('--stagger-ms') + 1] || 0)
const maxQuestion = Number(process.argv[process.argv.indexOf('--max-question') + 1] || 10)

if (!/^[A-Z0-9]{6}$/.test(roomId)) throw new Error('room code must contain 6 letters/numbers')
if (!Number.isInteger(staggerMs) || staggerMs < 0 || staggerMs > 10_000) throw new Error('stagger-ms must be 0-10000')
if (!Number.isInteger(maxQuestion) || maxQuestion < 1 || maxQuestion > 10) throw new Error('max-question must be 1-10')

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getState = async () => (await (await fetch(STATE_URL, { cache: 'no-store' })).json()).state
const putState = async (state) => {
  const response = await fetch(STATE_URL, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
  })
  if (!response.ok) throw new Error(`state update failed: HTTP ${response.status}`)
}

const parseCsv = (csv) => {
  const rows = []; let row = []; let field = ''; let quoted = false
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i]
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

const csvRows = parseCsv(await (await fetch(SHEET_URL)).text())
const headers = csvRows[0]
const indexes = Object.fromEntries(headers.map((header, index) => [header, index]))
const integrityChoices = new Map(csvRows.slice(1).filter((row) => row[indexes.active]?.toUpperCase() === 'TRUE').map((row) => {
  const questionId = row[indexes.question_id]
  return [questionId, `${questionId}-c${row[indexes.integrity_choice]}`]
}))

let state
for (let attempt = 0; attempt < 80; attempt += 1) {
  state = await getState()
  if (state?.rooms?.[roomId]) break
  await pause(250)
}
if (!state?.rooms?.[roomId]) throw new Error(`room ${roomId} was not shared by the teacher page`)

const roomState = state.rooms[roomId]
if (roomState.room.status !== 'lobby') throw new Error(`room ${roomId} has already started`)
const now = Date.now()
for (let index = 0; index < botCount; index += 1) {
  const playerId = `demo-bot-${index + 1}`
  roomState.players[playerId] = {
    playerId,
    nickname: `บอตทุจริต ${String(index + 1).padStart(2, '0')}`,
    nicknameKey: `บอตทุจริต ${String(index + 1).padStart(2, '0')}`,
    classSection: ['1/1', '1/2', '1/3'][index % 3],
    studentNumber: index + 1,
    ownerUid: `demo-bot-owner-${index + 1}`,
    roleId: null,
    roleHistory: [],
    roleOffset: null,
    joinedAt: now + index,
    lastSeenAt: now + index,
  }
}
roomState.room.updatedAt = now
await putState(state)
console.log(`[demo-bots] joined ${botCount} bots in ${roomId}; ${corruptCount} will always choose corruption; stagger ${staggerMs}ms; through question ${maxQuestion}`)

const answered = new Set()
while (true) {
  await pause(200)
  const latest = await getState()
  const current = latest?.rooms?.[roomId]
  if (!current) continue
  const room = current.room
  if (room.status !== 'playing' || !room.currentQuestionNumber) continue
  if (room.currentQuestionNumber > maxQuestion) continue
  const roundKey = `${room.gameCycle}::${room.currentQuestionNumber}`
  if (answered.has(roundKey)) continue

  let changed = false
  for (let index = 0; index < botCount; index += 1) {
    const player = current.players[`demo-bot-${index + 1}`]
    if (!player?.roleId) continue
    const question = Object.values(current.questions).find((item) =>
      item.roleId === player.roleId && item.questionNumber === room.currentQuestionNumber)
    if (!question) continue
    const integrityChoiceId = integrityChoices.get(question.questionId)
    const choiceId = index < corruptCount
      ? question.choices.find((choice) => choice.id !== integrityChoiceId)?.id
      : integrityChoiceId
    if (!choiceId) continue
    const answerId = `${room.gameCycle}::${player.playerId}::${question.questionId}`
    if (current.answers[answerId]) continue
    current.answers[answerId] = {
      answerId, roomId, playerId: player.playerId, ownerUid: player.ownerUid,
      gameCycle: room.gameCycle, questionNumber: room.currentQuestionNumber,
      questionId: question.questionId, choiceId, submittedAt: Date.now(),
    }
    changed = true
    current.room.updatedAt = Date.now()
    await putState(latest)
    if (staggerMs > 0 && index < botCount - 1) await pause(staggerMs)
  }
  if (changed) {
    answered.add(roundKey)
    console.log(`[demo-bots] answered ${roundKey}: corrupt ${corruptCount}, integrity ${botCount - corruptCount}`)
  }
}
