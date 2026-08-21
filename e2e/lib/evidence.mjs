import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'

const sanitize = (value) => value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80)

export class Recorder {
  constructor(runDir, label) {
    this.runDir = runDir
    this.label = label
    this.startedAt = Date.now()
    this.timeline = []
    this.findings = []
  }

  static async create(baseDir, label) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const runDir = path.join(baseDir, `${sanitize(label)}-${stamp}`)
    await mkdir(path.join(runDir, 'screenshots'), { recursive: true })
    return new Recorder(runDir, label)
  }

  elapsed() {
    return Date.now() - this.startedAt
  }

  async log(actor, message, data) {
    const entry = { t: this.elapsed(), actor, message, data: data ?? null }
    this.timeline.push(entry)
    const suffix = data ? ` ${JSON.stringify(data)}` : ''
    console.log(`[+${String(entry.t).padStart(7, ' ')}ms] [${actor}] ${message}${suffix}`)
    try {
      await appendFile(path.join(this.runDir, 'timeline.jsonl'), `${JSON.stringify(entry)}\n`)
    } catch {
      // Evidence logging must never crash the run.
    }
    return entry
  }

  async screenshot(page, actor, step) {
    const file = `${String(this.elapsed()).padStart(7, '0')}_${sanitize(actor)}_${sanitize(step)}.png`
    const full = path.join(this.runDir, 'screenshots', file)
    try {
      await page.screenshot({ path: full, timeout: 10_000 })
      await this.log(actor, `screenshot:${step}`, { file: path.join('screenshots', file) })
      return path.join('screenshots', file)
    } catch (error) {
      await this.log(actor, `screenshot-failed:${step}`, { error: String(error) })
      return null
    }
  }

  async finding(f) {
    const entry = { ...f, t: this.elapsed() }
    this.findings.push(entry)
    await this.log('FINDING', `[${f.severity}] ${f.step}`, entry)
    return entry
  }

  async finish(extra = {}) {
    const report = {
      label: this.label,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: this.elapsed(),
      findings: this.findings,
      ...extra,
    }
    await writeFile(path.join(this.runDir, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(path.join(this.runDir, 'report.md'), renderMarkdown(report))
    return { runDir: this.runDir, report }
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push(`# E2E run: ${report.label}`)
  lines.push('')
  lines.push(`- Started: ${report.startedAt}`)
  lines.push(`- Finished: ${report.finishedAt}`)
  lines.push(`- Duration: ${(report.durationMs / 1000).toFixed(1)}s`)
  if (report.roomId) lines.push(`- Room: ${report.roomId}`)
  if (report.newRoomId) lines.push(`- New room: ${report.newRoomId}`)
  lines.push('')
  const checks = report.checks ?? []
  const passed = checks.filter((c) => c.pass).length
  lines.push(`## Checks (${passed}/${checks.length} passed)`)
  lines.push('')
  for (const c of checks) {
    lines.push(`- [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  lines.push('')
  lines.push(`## Findings (${report.findings.length})`)
  if (report.findings.length === 0) lines.push('None.')
  for (const f of report.findings) {
    lines.push('')
    lines.push(`### [${f.severity}] ${f.step}`)
    lines.push(`- Affected: ${(f.affected || []).join(', ')}`)
    lines.push(`- Expected: ${f.expected}`)
    lines.push(`- Actual: ${f.actual}`)
    if (f.likelyCause) lines.push(`- Likely cause: ${f.likelyCause}`)
    if (f.evidence?.length) lines.push(`- Evidence: ${f.evidence.filter(Boolean).join(', ')}`)
    lines.push(`- Timestamp: +${f.t}ms into run`)
  }
  return lines.join('\n')
}
