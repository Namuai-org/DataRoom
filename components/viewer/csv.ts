/**
 * A small RFC 4180 CSV reader.
 *
 * Deliberately hand-rolled rather than pulled from a dependency: the viewer
 * needs exactly one thing — split a delimited file into rows of strings while
 * respecting quotes — and a parser you can read in a minute is easier to trust
 * with confidential financials than one you cannot.
 *
 * Handles: quoted fields, escaped quotes (""), embedded newlines and commas,
 * CRLF and LF line endings, a UTF-8 BOM, and tab- or semicolon-delimited files.
 */

export type CsvTable = {
  header: string[]
  rows: string[][]
  /** Rows parsed but not returned, when the file is longer than the cap. */
  truncatedRows: number
  delimiter: string
}

const MAX_ROWS = 2000

/** Picks the delimiter that appears most often outside quotes on the first line. */
function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', '\t', ';', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i]
      if (char === '"') inQuotes = !inQuotes
      else if (char === candidate && !inQuotes) count++
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** `maxRows` counts data rows; the header is always kept on top of that. */
export function parseCsv(input: string, maxRows: number = MAX_ROWS): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delimiter = detectDelimiter(text)
  const rowLimit = maxRows + 1

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let truncatedRows = 0

  const endField = () => {
    row.push(field)
    field = ''
  }

  const endRow = () => {
    endField()
    // Skip the blank final line that most exports end with.
    const isEmpty = row.length === 1 && row[0] === ''
    if (!isEmpty) {
      if (rows.length < rowLimit) rows.push(row)
      else truncatedRows++
    }
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === delimiter) {
      endField()
    } else if (char === '\n') {
      endRow()
    } else if (char === '\r') {
      // Swallowed; the following \n ends the row. A lone \r also ends one.
      if (text[i + 1] !== '\n') endRow()
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) endRow()

  const header = rows.shift() ?? []
  return { header, rows, truncatedRows, delimiter }
}

/** Right-aligns columns that read as numbers, which is how money should sit. */
export function isNumericColumn(rows: string[][], index: number): boolean {
  let seen = 0
  let numeric = 0
  for (const row of rows.slice(0, 40)) {
    const value = row[index]?.trim()
    if (!value) continue
    seen++
    if (/^[-+(]?[$€£₦]?\s?[\d,]+(\.\d+)?\)?%?$/.test(value)) numeric++
  }
  return seen > 0 && numeric / seen > 0.7
}
