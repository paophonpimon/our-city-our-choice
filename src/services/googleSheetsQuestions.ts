import { parseQuestionSheetRows, type ParsedQuestionSheet } from '../domain/classroomQuestions'

export const GOOGLE_SHEETS_QUESTIONS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1ndzvM2Fd021etUmJX60N_j_YaficwFkZ/gviz/tq?tqx=out:csv&sheet=QUESTIONS'

export const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export const loadGoogleSheetsQuestions = async (
  fetcher: typeof fetch = fetch,
  url = GOOGLE_SHEETS_QUESTIONS_CSV_URL,
): Promise<ParsedQuestionSheet> => {
  const response = await fetcher(url, { method: 'GET' })
  if (!response.ok) throw new Error(`Google Sheets CSV request failed with status ${response.status}`)
  return parseQuestionSheetRows(parseCsv(await response.text()))
}
