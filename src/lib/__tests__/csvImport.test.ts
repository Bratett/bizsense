import { describe, it, expect } from 'vitest'
import { parseCsv, normaliseGhanaPhone } from '../csvImport'
import { validateProductsCsv } from '../csvImport/validateProducts'
import { validateCustomersCsv } from '../csvImport/validateCustomers'
import { validateInvoicesCsv } from '../csvImport/validateInvoices'

// ─── Test 1: Valid product CSV parses correctly ─────────────────────────────

describe('validateProductsCsv', () => {
  it('parses a valid product CSV with 3 rows', () => {
    const rows = parseCsv(
      'name,sku,category,unit,cost_price,selling_price,reorder_level\n' +
        'Rice 50kg Bag,RICE50,Grains,bag,120,145,5\n' +
        'Peak Milk,PEAK400,Beverages,piece,18.50,22,20\n' +
        'Sugar 1kg,SUG1,Groceries,piece,8,12,10',
    )

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows).toHaveLength(3)
      expect(result.rows[0].name).toBe('Rice 50kg Bag')
      expect(result.rows[0].costPrice).toBe(120)
      expect(typeof result.rows[0].costPrice).toBe('number')
      expect(result.rows[1].costPrice).toBe(18.5)
      expect(result.rows[2].sellingPrice).toBe(12)
    }
  })

  // ─── Test 2: Missing required field returns error ───────────────────────

  it('returns error when required name field is missing', () => {
    const rows = parseCsv('name,cost_price\n' + ',50')

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
      const nameError = result.errors.find((e) => e.column === 'name')
      expect(nameError).toBeDefined()
      expect(nameError!.row).toBe(1)
      expect(nameError!.message.toLowerCase()).toContain('required')
    }
  })

  // ─── Test 3: Duplicate SKU in same file returns error ───────────────────

  it('returns error for duplicate SKUs in the same file', () => {
    const rows = parseCsv('name,sku,cost_price\n' + 'Product A,SKU001,50\n' + 'Product B,SKU001,60')

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const dupError = result.errors.find((e) => e.column === 'sku')
      expect(dupError).toBeDefined()
      expect(dupError!.message.toLowerCase()).toContain('duplicate')
    }
  })

  // ─── Test 4: Invalid cost_price returns descriptive error ───────────────

  it('returns descriptive error for non-numeric cost_price', () => {
    const rows = parseCsv('name,cost_price\n' + 'Rice,abc')

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const costError = result.errors.find((e) => e.column === 'cost_price' && e.row === 1)
      expect(costError).toBeDefined()
      expect(costError!.message).toBe('Must be a number')
    }
  })

  it('validates unit against allowed values', () => {
    const rows = parseCsv('name,unit,cost_price\n' + 'Product A,invalid_unit,50')

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const unitError = result.errors.find((e) => e.column === 'unit')
      expect(unitError).toBeDefined()
      expect(unitError!.message).toContain('Must be one of')
    }
  })
})

// ─── Test 5: Empty rows are silently skipped ──────────────────────────────

describe('parseCsv', () => {
  it('skips empty rows silently', () => {
    const rows = parseCsv('name,cost_price\n' + 'Product A,50\n' + '\n' + 'Product B,60')

    const result = validateProductsCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].name).toBe('Product A')
      expect(result.rows[1].name).toBe('Product B')
    }
  })

  // ─── Test 6: Handles quoted fields with commas ──────────────────────────

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('name,cost_price\n' + '"Mensah, Kofi\'s Rice",120')

    expect(rows).toHaveLength(2) // header + 1 data row
    expect(rows[1][0]).toBe("Mensah, Kofi's Rice")
    expect(rows[1][1]).toBe('120')
  })

  it('handles double-quoted escapes within quoted fields', () => {
    const rows = parseCsv('name,value\n' + '"Say ""hello""",42')

    expect(rows[1][0]).toBe('Say "hello"')
    expect(rows[1][1]).toBe('42')
  })

  it('handles \\r\\n line endings', () => {
    const rows = parseCsv('name,cost_price\r\n' + 'Product A,50\r\n' + 'Product B,60\r\n')

    expect(rows).toHaveLength(3) // header + 2 data rows
    expect(rows[1][0]).toBe('Product A')
    expect(rows[2][0]).toBe('Product B')
  })

  it('trims whitespace from field values', () => {
    const rows = parseCsv('name , cost_price \n' + ' Product A , 50 ')

    expect(rows[0][0]).toBe('name')
    expect(rows[1][0]).toBe('Product A')
    expect(rows[1][1]).toBe('50')
  })
})

// ─── Customer validation tests ────────────────────────────────────────────

describe('validateCustomersCsv', () => {
  it('parses valid customer rows', () => {
    const rows = parseCsv(
      'name,phone,location,credit_limit\n' +
        'Abena Serwaa,0244123456,Kumasi Market,500\n' +
        'Kofi Mensah,0201234567,Accra,1000',
    )

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].phone).toBe('0244123456')
      expect(result.rows[1].creditLimit).toBe(1000)
    }
  })

  it('returns error for duplicate phone numbers', () => {
    const rows = parseCsv('name,phone\n' + 'Customer A,0244123456\n' + 'Customer B,0244123456')

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const dupError = result.errors.find((e) => e.column === 'phone')
      expect(dupError).toBeDefined()
      expect(dupError!.message.toLowerCase()).toContain('duplicate')
    }
  })

  it('returns error when required phone is missing', () => {
    const rows = parseCsv('name,phone\n' + 'Customer A,')

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.find((e) => e.column === 'phone')).toBeDefined()
    }
  })
})

// ─── Invoice validation tests ─────────────────────────────────────────────

describe('validateInvoicesCsv', () => {
  it('parses valid invoices with DD/MM/YYYY dates', () => {
    const rows = parseCsv(
      'customer_name,customer_phone,invoice_amount,invoice_date,due_date\n' +
        'Kofi Mensah,0201234567,1200,01/04/2026,30/04/2026',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].invoiceDate).toBe('2026-04-01')
      expect(result.rows[0].dueDate).toBe('2026-04-30')
      expect(result.rows[0].invoiceAmount).toBe(1200)
    }
  })

  it('rejects YYYY-MM-DD format with helpful message', () => {
    const rows = parseCsv(
      'customer_name,invoice_amount,invoice_date\n' + 'Customer A,500,2026-04-01',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const dateError = result.errors.find((e) => e.column === 'invoice_date')
      expect(dateError).toBeDefined()
      expect(dateError!.message).toContain('DD/MM/YYYY')
    }
  })

  it('rejects due_date before invoice_date', () => {
    const rows = parseCsv(
      'customer_name,invoice_amount,invoice_date,due_date\n' +
        'Customer A,500,15/04/2026,01/04/2026',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const dueError = result.errors.find((e) => e.column === 'due_date')
      expect(dueError).toBeDefined()
      expect(dueError!.message).toContain('on or after')
    }
  })

  it('rejects invalid dates like 31/02/2026', () => {
    const rows = parseCsv(
      'customer_name,invoice_amount,invoice_date\n' + 'Customer A,500,31/02/2026',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.find((e) => e.column === 'invoice_date')).toBeDefined()
    }
  })

  it('rejects invalid Ghanaian phone number in invoice CSV', () => {
    const rows = parseCsv(
      'customer_name,customer_phone,invoice_amount,invoice_date\n' +
        'Customer A,12345,500,01/04/2026',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const phoneError = result.errors.find((e) => e.column === 'customer_phone')
      expect(phoneError).toBeDefined()
      expect(phoneError!.message).toContain('Invalid Ghanaian phone')
    }
  })

  it('normalises international format phone in invoice CSV', () => {
    const rows = parseCsv(
      'customer_name,customer_phone,invoice_amount,invoice_date\n' +
        'Customer A,+233241234567,500,01/04/2026',
    )

    const result = validateInvoicesCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows[0].customerPhone).toBe('0241234567')
    }
  })
})

// ─── Ghanaian phone number validation ────────────────────────────────────

describe('normaliseGhanaPhone', () => {
  it('accepts standard 10-digit local format', () => {
    expect(normaliseGhanaPhone('0241234567')).toBe('0241234567')
  })

  it('accepts format with spaces', () => {
    expect(normaliseGhanaPhone('024 123 4567')).toBe('0241234567')
  })

  it('accepts format with dashes', () => {
    expect(normaliseGhanaPhone('024-123-4567')).toBe('0241234567')
  })

  it('accepts international format with +233', () => {
    expect(normaliseGhanaPhone('+233241234567')).toBe('0241234567')
  })

  it('accepts international format without +', () => {
    expect(normaliseGhanaPhone('233241234567')).toBe('0241234567')
  })

  it('rejects too-short numbers', () => {
    expect(normaliseGhanaPhone('024123')).toBeNull()
  })

  it('rejects too-long numbers', () => {
    expect(normaliseGhanaPhone('02412345678')).toBeNull()
  })

  it('rejects numbers not starting with 0 after normalisation', () => {
    expect(normaliseGhanaPhone('1241234567')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(normaliseGhanaPhone('abcdefghij')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(normaliseGhanaPhone('')).toBeNull()
  })
})

describe('validateCustomersCsv — phone format', () => {
  it('rejects invalid Ghanaian phone number', () => {
    const rows = parseCsv('name,phone\n' + 'Customer A,12345')

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const phoneError = result.errors.find((e) => e.column === 'phone')
      expect(phoneError).toBeDefined()
      expect(phoneError!.message).toContain('Invalid Ghanaian phone')
    }
  })

  it('normalises international format phone numbers', () => {
    const rows = parseCsv('name,phone\n' + 'Customer A,+233201234567')

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.rows[0].phone).toBe('0201234567')
    }
  })

  it('detects duplicates after normalisation', () => {
    const rows = parseCsv('name,phone\n' + 'Customer A,0241234567\n' + 'Customer B,+233241234567')

    const result = validateCustomersCsv(rows)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const dupError = result.errors.find(
        (e) => e.column === 'phone' && e.message.includes('Duplicate'),
      )
      expect(dupError).toBeDefined()
    }
  })
})
