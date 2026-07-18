import { describe, expect, it, vi } from 'vitest'
import { createQuestionRows, rowsToCsv } from '../test/classroomFixtures'
import { GOOGLE_SHEETS_QUESTIONS_CSV_URL, loadGoogleSheetsQuestions, parseCsv } from './googleSheetsQuestions'

describe('Google Sheets CSV loader', () => {
  it('loads and validates the configured QUESTIONS CSV URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rowsToCsv(createQuestionRows()), { status: 200, headers: { 'Content-Type': 'text/csv' } }),
    )

    const result = await loadGoogleSheetsQuestions(fetcher)

    expect(fetcher).toHaveBeenCalledWith(GOOGLE_SHEETS_QUESTIONS_CSV_URL, { method: 'GET' })
    expect(result.valid).toBe(true)
    expect(result.questions).toHaveLength(80)
  })

  it('parses quoted commas, escaped quotes, and newlines', () => {
    expect(parseCsv('"a","b,b","say ""yes"""\r\n"1","line 1\nline 2","3"')).toEqual([
      ['a', 'b,b', 'say "yes"'],
      ['1', 'line 1\nline 2', '3'],
    ])
  })

  it('reports a failed HTTP response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('blocked', { status: 403 }))
    await expect(loadGoogleSheetsQuestions(fetcher)).rejects.toThrow('status 403')
  })
})
