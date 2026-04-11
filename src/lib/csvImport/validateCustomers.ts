import {
  type CsvValidationError,
  type CsvValidationResult,
  mapHeaders,
  getField,
  normaliseGhanaPhone,
} from './index'

export type CustomerCsvRow = {
  name: string
  phone: string
  location?: string
  creditLimit?: number
}

const EXPECTED_COLUMNS = ['name', 'phone', 'location', 'credit_limit']
const REQUIRED_COLUMNS = ['name', 'phone']

export function validateCustomersCsv(rows: string[][]): CsvValidationResult<CustomerCsvRow> {
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
  const validRows: CustomerCsvRow[] = []
  const seenPhones = new Map<string, number>() // phone → first row number

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i

    if (row.every((f) => f.trim() === '')) continue

    const name = getField(row, colMap.get('name'))
    const phone = getField(row, colMap.get('phone'))
    const location = getField(row, colMap.get('location'))
    const creditLimitStr = getField(row, colMap.get('credit_limit'))

    // name: required, max 100 chars
    if (!name) {
      errors.push({ row: rowNum, column: 'name', message: 'Name is required' })
    } else if (name.length > 100) {
      errors.push({ row: rowNum, column: 'name', message: 'Name must be 100 characters or less' })
    }

    // phone: required, valid Ghanaian format, unique within file
    let normalisedPhone = ''
    if (!phone) {
      errors.push({ row: rowNum, column: 'phone', message: 'Phone is required' })
    } else {
      const normalised = normaliseGhanaPhone(phone)
      if (!normalised) {
        errors.push({
          row: rowNum,
          column: 'phone',
          message: 'Invalid Ghanaian phone number. Use format: 0XX XXX XXXX (e.g., 0241234567)',
        })
      } else {
        normalisedPhone = normalised
        const firstRow = seenPhones.get(normalisedPhone)
        if (firstRow !== undefined) {
          errors.push({
            row: rowNum,
            column: 'phone',
            message: `Duplicate phone "${normalisedPhone}" (first seen in row ${firstRow})`,
          })
        } else {
          seenPhones.set(normalisedPhone, rowNum)
        }
      }
    }

    // location: optional, max 100 chars
    if (location && location.length > 100) {
      errors.push({
        row: rowNum,
        column: 'location',
        message: 'Location must be 100 characters or less',
      })
    }

    // credit_limit: optional, numeric, >= 0
    if (creditLimitStr) {
      const creditLimit = Number(creditLimitStr)
      if (isNaN(creditLimit)) {
        errors.push({ row: rowNum, column: 'credit_limit', message: 'Must be a number' })
      } else if (creditLimit < 0) {
        errors.push({ row: rowNum, column: 'credit_limit', message: 'Must be 0 or greater' })
      }
    }

    const creditLimit = creditLimitStr ? Number(creditLimitStr) : undefined

    validRows.push({
      name,
      phone: normalisedPhone || phone,
      location: location || undefined,
      creditLimit: creditLimit !== undefined && !isNaN(creditLimit) ? creditLimit : undefined,
    })
  }

  if (errors.length > 0) {
    return { valid: false, rows: [], errors }
  }

  return { valid: true, rows: validRows, errors: [] }
}
