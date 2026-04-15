import { parse } from 'papaparse'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

export type CsvExpenseRow = {
  date: string
  category: string
  amount: number
  paymentMethod: string
  description: string
}

export type CsvValidationResult = {
  valid: CsvExpenseRow[]
  errors: Array<{ row: number; field: string; message: string }>
  warnings: Array<{ row: number; message: string }>
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: 'cash',
  momo: 'momo_mtn',
  'mtn momo': 'momo_mtn',
  mtn_momo: 'momo_mtn',
  momo_mtn: 'momo_mtn',
  telecel: 'momo_telecel',
  momo_telecel: 'momo_telecel',
  airteltigo: 'momo_airtel',
  airtel: 'momo_airtel',
  momo_airtel: 'momo_airtel',
  bank: 'bank',
  'bank transfer': 'bank',
}

export function parseAndValidateExpenseCsv(csvText: string): CsvValidationResult {
  const { data, errors: parseErrors } = parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return {
      valid: [],
      errors: [{ row: 0, field: 'file', message: `CSV parse error: ${parseErrors[0].message}` }],
      warnings: [],
    }
  }

  const valid: CsvExpenseRow[] = []
  const errors: Array<{ row: number; field: string; message: string }> = []
  const warnings: Array<{ row: number; message: string }> = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as Record<string, string>
    const rowNum = i + 2 // 1-indexed, row 1 is header
    let hasError = false

    // ── Date ────────────────────────────────────────────────────────────
    let parsedDate: string | null = null
    const rawDate = (row.date ?? '').trim()
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const [d, m, y] = rawDate.split('/')
      parsedDate = `${y}-${m}-${d}`
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      parsedDate = rawDate
    }
    if (!parsedDate) {
      errors.push({
        row: rowNum,
        field: 'date',
        message: `Invalid date "${rawDate}". Use DD/MM/YYYY or YYYY-MM-DD.`,
      })
      hasError = true
    }

    // ── Amount ───────────────────────────────────────────────────────────
    const amount = parseFloat((row.amount ?? '').replace(/,/g, ''))
    if (isNaN(amount) || amount < 0) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: `Invalid amount "${row.amount}". Must be a positive number.`,
      })
      hasError = true
    }

    // ── Category ─────────────────────────────────────────────────────────
    const rawCat = (row.category ?? '').trim()
    const matchedCategory = EXPENSE_CATEGORIES.find(
      (c) => c.label.toLowerCase() === rawCat.toLowerCase(),
    )
    if (!matchedCategory) {
      warnings.push({
        row: rowNum,
        message: `Category "${rawCat}" not recognised — assigned to Miscellaneous.`,
      })
    }
    const category = matchedCategory?.label ?? 'Miscellaneous'

    // ── Payment method ────────────────────────────────────────────────────
    const rawMethod = (row.payment_method ?? '').trim().toLowerCase()
    const paymentMethod = PAYMENT_METHOD_MAP[rawMethod]
    if (!paymentMethod) {
      errors.push({
        row: rowNum,
        field: 'payment_method',
        message: `Unknown payment method "${row.payment_method}". Use: cash, momo, mtn momo, telecel, airteltigo, bank.`,
      })
      hasError = true
    }
    if (rawMethod === 'momo') {
      warnings.push({
        row: rowNum,
        message: '"momo" defaulted to MTN MoMo. Edit the import if Telecel or AirtelTigo.',
      })
    }

    // ── Description ───────────────────────────────────────────────────────
    const description = (row.description ?? '').trim()
    if (!description) {
      errors.push({ row: rowNum, field: 'description', message: 'Description is required.' })
      hasError = true
    }

    if (!hasError && parsedDate && paymentMethod) {
      valid.push({ date: parsedDate, category, amount, paymentMethod, description })
    }
  }

  return { valid, errors, warnings }
}
