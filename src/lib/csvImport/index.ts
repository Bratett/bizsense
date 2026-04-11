// ─── Shared CSV Import Infrastructure ───────────────────────────────────────

export type CsvValidationError = {
  row: number // 1-indexed data row (header = row 0)
  column: string // column name
  message: string
}

export type CsvValidationResult<T> =
  | { valid: true; rows: T[]; errors: [] }
  | { valid: false; rows: []; errors: CsvValidationError[] }

export const VALID_UNITS = ['piece', 'kg', 'litre', 'box', 'bag', 'carton', 'other'] as const

/**
 * Validate a Ghanaian phone number.
 *
 * Accepted formats (all resolve to 10 digits starting with 0):
 *   0241234567        — standard local
 *   024 123 4567      — with spaces
 *   024-123-4567      — with dashes
 *   +233241234567     — international with +
 *   233241234567      — international without +
 *
 * Known operator prefixes (2-digit after leading 0):
 *   MTN:        024, 054, 055, 059
 *   Vodafone:   020, 050
 *   AirtelTigo: 026, 027, 056, 057
 *
 * Returns the normalised 10-digit form (e.g. "0241234567") or null if invalid.
 */
export function normaliseGhanaPhone(raw: string): string | null {
  // Strip spaces, dashes, parentheses
  let digits = raw.replace(/[\s\-()]/g, '')

  // Strip leading +
  if (digits.startsWith('+')) digits = digits.slice(1)

  // Convert international prefix 233 → 0
  if (digits.startsWith('233') && digits.length === 12) {
    digits = '0' + digits.slice(3)
  }

  // Must now be exactly 10 digits starting with 0
  if (!/^0\d{9}$/.test(digits)) return null

  return digits
}

export const MAX_CSV_ROWS = 500
export const MAX_CSV_SIZE_BYTES = 1_048_576 // 1 MB

/**
 * Parse a CSV string into a 2D array of strings.
 * Handles quoted fields (with embedded commas and newlines), double-quote
 * escapes (""), \r\n and \n line endings. Trims whitespace from each field.
 * Filters out rows where every field is empty.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: double-quote escape or end of quoted field
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        currentField += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        currentRow.push(currentField.trim())
        currentField = ''
        i++
      } else if (ch === '\r') {
        // Handle \r\n
        currentRow.push(currentField.trim())
        currentField = ''
        rows.push(currentRow)
        currentRow = []
        i++ // skip \r
        if (i < text.length && text[i] === '\n') {
          i++ // skip \n
        }
      } else if (ch === '\n') {
        currentRow.push(currentField.trim())
        currentField = ''
        rows.push(currentRow)
        currentRow = []
        i++
      } else {
        currentField += ch
        i++
      }
    }
  }

  // Push last field and row if there's remaining content
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    rows.push(currentRow)
  }

  // Filter out rows where every field is empty
  return rows.filter((row) => row.some((field) => field !== ''))
}

/**
 * Map header names case-insensitively. Returns a mapping from expected
 * column name to column index, or null for missing columns.
 */
export function mapHeaders(headerRow: string[], expectedColumns: string[]): Map<string, number> {
  const normalised = headerRow.map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))
  const map = new Map<string, number>()

  for (const col of expectedColumns) {
    const idx = normalised.indexOf(col.toLowerCase())
    if (idx !== -1) {
      map.set(col, idx)
    }
  }

  return map
}

/**
 * Get a field value from a row by column index, returning empty string
 * if index is out of bounds or column not mapped.
 */
export function getField(row: string[], colIndex: number | undefined): string {
  if (colIndex === undefined || colIndex < 0 || colIndex >= row.length) return ''
  return row[colIndex].trim()
}
