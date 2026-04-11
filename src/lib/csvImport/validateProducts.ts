import {
  type CsvValidationError,
  type CsvValidationResult,
  VALID_UNITS,
  mapHeaders,
  getField,
} from './index'

export type ProductCsvRow = {
  name: string
  sku?: string
  category?: string
  unit?: string
  costPrice: number
  sellingPrice?: number
  reorderLevel?: number
}

const EXPECTED_COLUMNS = [
  'name',
  'sku',
  'category',
  'unit',
  'cost_price',
  'selling_price',
  'reorder_level',
]

const REQUIRED_COLUMNS = ['name', 'cost_price']

export function validateProductsCsv(rows: string[][]): CsvValidationResult<ProductCsvRow> {
  if (rows.length === 0) {
    return {
      valid: false,
      rows: [],
      errors: [{ row: 0, column: '', message: 'CSV file is empty' }],
    }
  }

  const headerRow = rows[0]
  const colMap = mapHeaders(headerRow, EXPECTED_COLUMNS)

  // Check required columns exist in header
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
  const validRows: ProductCsvRow[] = []
  const seenSkus = new Map<string, number>() // sku → first row number

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i // 1-indexed data row

    // Skip empty rows
    if (row.every((f) => f.trim() === '')) continue

    const name = getField(row, colMap.get('name'))
    const sku = getField(row, colMap.get('sku'))
    const category = getField(row, colMap.get('category'))
    const unit = getField(row, colMap.get('unit'))
    const costPriceStr = getField(row, colMap.get('cost_price'))
    const sellingPriceStr = getField(row, colMap.get('selling_price'))
    const reorderLevelStr = getField(row, colMap.get('reorder_level'))

    // name: required, max 100 chars
    if (!name) {
      errors.push({ row: rowNum, column: 'name', message: 'Name is required' })
    } else if (name.length > 100) {
      errors.push({ row: rowNum, column: 'name', message: 'Name must be 100 characters or less' })
    }

    // sku: optional, unique within file
    if (sku) {
      const skuLower = sku.toLowerCase()
      const firstRow = seenSkus.get(skuLower)
      if (firstRow !== undefined) {
        errors.push({
          row: rowNum,
          column: 'sku',
          message: `Duplicate SKU "${sku}" (first seen in row ${firstRow})`,
        })
      } else {
        seenSkus.set(skuLower, rowNum)
      }
    }

    // unit: optional, must be one of VALID_UNITS
    if (unit) {
      const unitLower = unit.toLowerCase()
      if (!VALID_UNITS.includes(unitLower as (typeof VALID_UNITS)[number])) {
        errors.push({
          row: rowNum,
          column: 'unit',
          message: `Invalid unit "${unit}". Must be one of: ${VALID_UNITS.join(', ')}`,
        })
      }
    }

    // cost_price: required, numeric, >= 0
    if (!costPriceStr) {
      errors.push({ row: rowNum, column: 'cost_price', message: 'Cost price is required' })
    } else {
      const costPrice = Number(costPriceStr)
      if (isNaN(costPrice)) {
        errors.push({ row: rowNum, column: 'cost_price', message: 'Must be a number' })
      } else if (costPrice < 0) {
        errors.push({ row: rowNum, column: 'cost_price', message: 'Must be 0 or greater' })
      }
    }

    // selling_price: optional, numeric, >= 0
    if (sellingPriceStr) {
      const sellingPrice = Number(sellingPriceStr)
      if (isNaN(sellingPrice)) {
        errors.push({ row: rowNum, column: 'selling_price', message: 'Must be a number' })
      } else if (sellingPrice < 0) {
        errors.push({ row: rowNum, column: 'selling_price', message: 'Must be 0 or greater' })
      }
    }

    // reorder_level: optional, integer, >= 0
    if (reorderLevelStr) {
      const reorderLevel = Number(reorderLevelStr)
      if (isNaN(reorderLevel) || !Number.isInteger(reorderLevel)) {
        errors.push({ row: rowNum, column: 'reorder_level', message: 'Must be a whole number' })
      } else if (reorderLevel < 0) {
        errors.push({ row: rowNum, column: 'reorder_level', message: 'Must be 0 or greater' })
      }
    }

    // Build validated row (even if there are errors — we collect all errors)
    if (errors.length === 0 || errors[errors.length - 1]?.row !== rowNum) {
      // Only add if no errors on this row (check is implicit: we add after all checks)
    }

    // Always build the row object for inclusion if valid
    const costPrice = Number(costPriceStr)
    const sellingPrice = sellingPriceStr ? Number(sellingPriceStr) : undefined
    const reorderLevel = reorderLevelStr ? Number(reorderLevelStr) : undefined

    validRows.push({
      name,
      sku: sku || undefined,
      category: category || undefined,
      unit: unit ? unit.toLowerCase() : undefined,
      costPrice: isNaN(costPrice) ? 0 : costPrice,
      sellingPrice: sellingPrice !== undefined && !isNaN(sellingPrice) ? sellingPrice : undefined,
      reorderLevel: reorderLevel !== undefined && !isNaN(reorderLevel) ? reorderLevel : undefined,
    })
  }

  if (errors.length > 0) {
    return { valid: false, rows: [], errors }
  }

  return { valid: true, rows: validRows, errors: [] }
}
