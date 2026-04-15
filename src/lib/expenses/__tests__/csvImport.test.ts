import { describe, it, expect } from 'vitest'
import { parseAndValidateExpenseCsv } from '../csvImport'

// Helper to build a minimal valid CSV
function buildCsv(rows: string[]): string {
  return ['date,category,amount,payment_method,description', ...rows].join('\n')
}

describe('parseAndValidateExpenseCsv', () => {
  // ── Test 8: valid 3-row CSV ─────────────────────────────────────────────────
  it('valid 3-row CSV: returns 3 valid rows, 0 errors', () => {
    const csv = buildCsv([
      '01/04/2026,Transport & Fuel,80,cash,Fuel for delivery van',
      '02/04/2026,Rent,1200,bank,April office rent',
      '03/04/2026,Utilities,150,mtn momo,Electricity bill',
    ])
    const { valid, errors, warnings } = parseAndValidateExpenseCsv(csv)
    expect(valid).toHaveLength(3)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  // ── Test 9: DD/MM/YYYY date format ─────────────────────────────────────────
  it('DD/MM/YYYY date is correctly parsed to YYYY-MM-DD', () => {
    const csv = buildCsv(['15/03/2026,Rent,500,cash,March rent'])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(0)
    expect(valid[0]?.date).toBe('2026-03-15')
  })

  // ── Test 10: unknown category → warning + Miscellaneous ────────────────────
  it('unknown category: assigns Miscellaneous and adds a warning', () => {
    const csv = buildCsv(['01/04/2026,Office Supplies,200,cash,Paper and pens'])
    const { valid, errors, warnings } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toMatch(/not recognised/i)
    expect(valid[0]?.category).toBe('Miscellaneous')
  })

  // ── Test 11: 'momo' payment method → warning + momo_mtn ───────────────────
  it('"momo" payment method: defaults to momo_mtn with a warning', () => {
    const csv = buildCsv(['01/04/2026,Utilities,100,momo,Electricity'])
    const { valid, errors, warnings } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toMatch(/MTN MoMo/i)
    expect(valid[0]?.paymentMethod).toBe('momo_mtn')
  })

  // ── Test 12: negative amount → error ───────────────────────────────────────
  it('negative amount: adds an error and excludes the row from valid', () => {
    const csv = buildCsv(['01/04/2026,Rent,-500,cash,Bad row'])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('amount')
    expect(valid).toHaveLength(0)
  })

  // ── Test 13: missing description → error ───────────────────────────────────
  it('missing description: adds an error', () => {
    const csv = buildCsv(['01/04/2026,Rent,500,cash,'])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('description')
    expect(valid).toHaveLength(0)
  })

  // ── Test 14: mixed valid/invalid rows ──────────────────────────────────────
  it('mix of valid and invalid rows: errors.length > 0, valid rows still returned', () => {
    const csv = buildCsv([
      '01/04/2026,Rent,1200,bank,April rent', // valid
      '02/04/2026,Utilities,-50,cash,Bad amount', // error: negative amount
      '03/04/2026,Transport & Fuel,80,cash,Fuel', // valid
    ])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors.length).toBeGreaterThan(0)
    expect(valid).toHaveLength(2)
  })

  // ── Test 15: comma-formatted amount ────────────────────────────────────────
  it('amount with comma thousands separator (1,200.00): parsed correctly to 1200', () => {
    const csv = buildCsv(['01/04/2026,Rent,"1,200.00",bank,Rent payment'])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(0)
    expect(valid[0]?.amount).toBe(1200)
  })

  // ── Additional coverage ────────────────────────────────────────────────────

  it('ISO date format YYYY-MM-DD is accepted', () => {
    const csv = buildCsv(['2026-04-01,Rent,500,cash,April rent'])
    const { valid, errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(0)
    expect(valid[0]?.date).toBe('2026-04-01')
  })

  it('invalid date format: adds error', () => {
    const csv = buildCsv(['April 1 2026,Rent,500,cash,Rent'])
    const { errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('date')
  })

  it('unknown payment method: adds error', () => {
    const csv = buildCsv(['01/04/2026,Rent,500,paypal,Online payment'])
    const { errors } = parseAndValidateExpenseCsv(csv)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.field).toBe('payment_method')
  })
})
