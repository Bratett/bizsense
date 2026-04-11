import {
  type CsvValidationError,
  type CsvValidationResult,
  mapHeaders,
  getField,
  normaliseGhanaPhone,
} from './index'

export type InvoiceCsvRow = {
  customerName: string
  customerPhone?: string
  invoiceAmount: number
  invoiceDate: string // YYYY-MM-DD (converted from DD/MM/YYYY)
  dueDate?: string // YYYY-MM-DD (converted from DD/MM/YYYY)
}

const EXPECTED_COLUMNS = [
  'customer_name',
  'customer_phone',
  'invoice_amount',
  'invoice_date',
  'due_date',
]

const REQUIRED_COLUMNS = ['customer_name', 'invoice_amount', 'invoice_date']

/**
 * Parse a DD/MM/YYYY date string and return YYYY-MM-DD, or null if invalid.
 */
function parseDdMmYyyy(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  // Validate ranges
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1900 || year > 2100) return null

  // Validate the date is real (e.g., 31/02/2024 is invalid)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  // Return YYYY-MM-DD
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function validateInvoicesCsv(rows: string[][]): CsvValidationResult<InvoiceCsvRow> {
  if (rows.length === 0) {
    return {
      valid: false,
      rows: [],
      errors: [{ row: 0, column: '', message: 'CSV file is empty' }],
    }
  }

  const headerRow = rows[0]
  const colMap = mapHeaders(headerRow, EXPECTED_COLUMNS)

  // Check required columns exist
  const missingHeaders: CsvValidationError[] = []
  for (const col of REQUIRED_COLUMNS) {
    if (!colMap.has(col)) {
      missingHeaders.push({
        row: 0,
        column: col,
        message: `Required column "${col}" not found in header row`,
      })
    }
  }
  if (missingHeaders.length > 0) {
    return { valid: false, rows: [], errors: missingHeaders }
  }

  const errors: CsvValidationError[] = []
  const validRows: InvoiceCsvRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i

    if (row.every((f) => f.trim() === '')) continue

    const customerName = getField(row, colMap.get('customer_name'))
    const customerPhone = getField(row, colMap.get('customer_phone'))
    const invoiceAmountStr = getField(row, colMap.get('invoice_amount'))
    const invoiceDateStr = getField(row, colMap.get('invoice_date'))
    const dueDateStr = getField(row, colMap.get('due_date'))

    // customer_name: required
    if (!customerName) {
      errors.push({ row: rowNum, column: 'customer_name', message: 'Customer name is required' })
    }

    // customer_phone: optional, but if provided must be valid Ghanaian format
    let normalisedPhone: string | undefined
    if (customerPhone) {
      const normalised = normaliseGhanaPhone(customerPhone)
      if (!normalised) {
        errors.push({
          row: rowNum,
          column: 'customer_phone',
          message: 'Invalid Ghanaian phone number. Use format: 0XX XXX XXXX (e.g., 0241234567)',
        })
      } else {
        normalisedPhone = normalised
      }
    }

    // invoice_amount: required, numeric, > 0
    let invoiceAmount = 0
    if (!invoiceAmountStr) {
      errors.push({ row: rowNum, column: 'invoice_amount', message: 'Invoice amount is required' })
    } else {
      invoiceAmount = Number(invoiceAmountStr)
      if (isNaN(invoiceAmount)) {
        errors.push({ row: rowNum, column: 'invoice_amount', message: 'Must be a number' })
      } else if (invoiceAmount <= 0) {
        errors.push({ row: rowNum, column: 'invoice_amount', message: 'Must be greater than 0' })
      }
    }

    // invoice_date: required, DD/MM/YYYY format
    let invoiceDate: string | null = null
    if (!invoiceDateStr) {
      errors.push({ row: rowNum, column: 'invoice_date', message: 'Invoice date is required' })
    } else {
      invoiceDate = parseDdMmYyyy(invoiceDateStr)
      if (!invoiceDate) {
        errors.push({
          row: rowNum,
          column: 'invoice_date',
          message: 'Invalid date. Use DD/MM/YYYY format (e.g., 15/03/2026)',
        })
      }
    }

    // due_date: optional, DD/MM/YYYY, must be >= invoice_date
    let dueDate: string | undefined
    if (dueDateStr) {
      const parsed = parseDdMmYyyy(dueDateStr)
      if (!parsed) {
        errors.push({
          row: rowNum,
          column: 'due_date',
          message: 'Invalid date. Use DD/MM/YYYY format (e.g., 30/04/2026)',
        })
      } else if (invoiceDate && parsed < invoiceDate) {
        errors.push({
          row: rowNum,
          column: 'due_date',
          message: 'Due date must be on or after the invoice date',
        })
      } else {
        dueDate = parsed
      }
    }

    validRows.push({
      customerName,
      customerPhone: normalisedPhone || customerPhone || undefined,
      invoiceAmount: isNaN(invoiceAmount) ? 0 : invoiceAmount,
      invoiceDate: invoiceDate ?? '',
      dueDate,
    })
  }

  if (errors.length > 0) {
    return { valid: false, rows: [], errors }
  }

  return { valid: true, rows: validRows, errors: [] }
}
