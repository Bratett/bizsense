import { describe, it, expect } from 'vitest'
import {
  computeFifoCogs,
  computeFifoInventoryValue,
  buildFifoLayers,
  type FifoTransactionInput,
} from '../fifo'

// ─── Helper: build a transaction input ───────────────────────────────────────

let txCounter = 0

function makeTx(
  overrides: Pick<FifoTransactionInput, 'transactionType' | 'quantity' | 'unitCost'> &
    Partial<FifoTransactionInput>,
): FifoTransactionInput {
  txCounter++
  return {
    id: `tx-${txCounter}`,
    transactionDate: '2026-03-01',
    createdAt: new Date(`2026-03-01T00:00:${String(txCounter).padStart(2, '0')}Z`),
    ...overrides,
  }
}

// Reset counter between tests
function resetCounter() {
  txCounter = 0
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeFifoCogs', () => {
  it('Test 1 — single layer, full consumption', () => {
    resetCounter()
    const txns = [makeTx({ transactionType: 'opening', quantity: 10, unitCost: 50 })]

    const result = computeFifoCogs(txns, 10)

    expect(result.cogsTotal).toBe(500)
    expect(result.remainingQuantity).toBe(0)
    expect(result.insufficientStock).toBe(false)
    expect(result.layersConsumed).toHaveLength(1)
  })

  it('Test 2 — single layer, partial consumption', () => {
    resetCounter()
    const txns = [makeTx({ transactionType: 'opening', quantity: 20, unitCost: 50 })]

    const result = computeFifoCogs(txns, 8)

    expect(result.cogsTotal).toBe(400)
    expect(result.remainingQuantity).toBe(12)
    expect(result.insufficientStock).toBe(false)
  })

  it('Test 3 — two layers, spans both', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'purchase',
        quantity: 10,
        unitCost: 50,
        transactionDate: '2026-03-01',
      }),
      makeTx({
        transactionType: 'purchase',
        quantity: 20,
        unitCost: 55,
        transactionDate: '2026-03-15',
      }),
    ]

    const result = computeFifoCogs(txns, 15)

    expect(result.cogsTotal).toBe(775) // 10*50 + 5*55
    expect(result.layersConsumed).toHaveLength(2)
    expect(result.layersConsumed[0].quantityConsumed).toBe(10)
    expect(result.layersConsumed[0].unitCost).toBe(50)
    expect(result.layersConsumed[1].quantityConsumed).toBe(5)
    expect(result.layersConsumed[1].unitCost).toBe(55)
  })

  it('Test 4 — exhausts first layer, partial second', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'purchase',
        quantity: 5,
        unitCost: 40,
        transactionDate: '2026-03-01',
      }),
      makeTx({
        transactionType: 'purchase',
        quantity: 30,
        unitCost: 60,
        transactionDate: '2026-03-10',
      }),
    ]

    const result = computeFifoCogs(txns, 10)

    expect(result.cogsTotal).toBe(500) // 5*40 + 5*60
    expect(result.remainingQuantity).toBe(25)
  })

  it('Test 5 — insufficient stock', () => {
    resetCounter()
    const txns = [makeTx({ transactionType: 'purchase', quantity: 3, unitCost: 50 })]

    const result = computeFifoCogs(txns, 5)

    expect(result.insufficientStock).toBe(true)
    expect(result.shortfall).toBe(2)
    expect(result.cogsTotal).toBe(150) // only covers 3 available
  })

  it('Test 6 — prior sales already consumed layers (full replay)', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'opening',
        quantity: 10,
        unitCost: 50,
        transactionDate: '2026-03-01',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'sale',
        quantity: -6,
        unitCost: 50,
        transactionDate: '2026-03-05',
        createdAt: new Date('2026-03-05T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'purchase',
        quantity: 15,
        unitCost: 55,
        transactionDate: '2026-03-10',
        createdAt: new Date('2026-03-10T00:00:00Z'),
      }),
    ]

    const result = computeFifoCogs(txns, 8)

    // After replay: 4 remaining @ 50 + 15 @ 55
    // Sell 8: 4*50 + 4*55 = 200 + 220 = 420
    expect(result.cogsTotal).toBe(420)
    expect(result.layersConsumed).toHaveLength(2)
    expect(result.layersConsumed[0]).toEqual(
      expect.objectContaining({ quantityConsumed: 4, unitCost: 50 }),
    )
    expect(result.layersConsumed[1]).toEqual(
      expect.objectContaining({ quantityConsumed: 4, unitCost: 55 }),
    )
    expect(result.remainingQuantity).toBe(11)
  })

  it('Test 7 — negative adjustment reduces oldest layer first', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'opening',
        quantity: 10,
        unitCost: 50,
        transactionDate: '2026-03-01',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'adjustment',
        quantity: -3,
        unitCost: 50,
        transactionDate: '2026-03-02',
        createdAt: new Date('2026-03-02T00:00:00Z'),
      }),
    ]

    const result = computeFifoCogs(txns, 5)

    // After replay: 7 remaining @ 50; sell 5
    expect(result.cogsTotal).toBe(250) // 5*50
    expect(result.remainingQuantity).toBe(2)
    expect(result.insufficientStock).toBe(false)
  })

  it('Test 9 — zero stock, sell any quantity', () => {
    resetCounter()
    const result = computeFifoCogs([], 1)

    expect(result.insufficientStock).toBe(true)
    expect(result.cogsTotal).toBe(0)
    expect(result.shortfall).toBe(1)
    expect(result.layersConsumed).toHaveLength(0)
  })

  it('Test 10 — decimal quantities (2.5 kg @ GHS 12.40)', () => {
    resetCounter()
    const txns = [makeTx({ transactionType: 'purchase', quantity: 2.5, unitCost: 12.4 })]

    const result = computeFifoCogs(txns, 2.5)

    expect(result.cogsTotal).toBe(31.0) // 2.5 * 12.40 = 31.00
    expect(result.remainingQuantity).toBe(0)
    expect(result.insufficientStock).toBe(false)
  })
})

describe('computeFifoInventoryValue', () => {
  it('Test 8 — two partial layers remaining after sales', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'opening',
        quantity: 10,
        unitCost: 50,
        transactionDate: '2026-03-01',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'sale',
        quantity: -6,
        unitCost: 50,
        transactionDate: '2026-03-05',
        createdAt: new Date('2026-03-05T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'purchase',
        quantity: 15,
        unitCost: 55,
        transactionDate: '2026-03-10',
        createdAt: new Date('2026-03-10T00:00:00Z'),
      }),
    ]

    const result = computeFifoInventoryValue(txns)

    // After replay: 4 @ 50 + 15 @ 55 = 200 + 825 = 1025
    expect(result.totalValue).toBe(1025)
    expect(result.totalQuantity).toBe(19)
    expect(result.remainingLayers).toHaveLength(2)
  })
})

describe('buildFifoLayers', () => {
  it('handles positive adjustment as a new layer', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'opening',
        quantity: 5,
        unitCost: 30,
        transactionDate: '2026-03-01',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'adjustment',
        quantity: 3,
        unitCost: 35,
        transactionDate: '2026-03-05',
        createdAt: new Date('2026-03-05T00:00:00Z'),
      }),
    ]

    const layers = buildFifoLayers(txns)

    expect(layers).toHaveLength(2)
    expect(layers[0].available).toBe(5)
    expect(layers[0].unitCost).toBe(30)
    expect(layers[1].available).toBe(3)
    expect(layers[1].unitCost).toBe(35)
  })

  it('handles return_in as a new layer', () => {
    resetCounter()
    const txns = [
      makeTx({
        transactionType: 'purchase',
        quantity: 10,
        unitCost: 50,
        transactionDate: '2026-03-01',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'sale',
        quantity: -5,
        unitCost: 50,
        transactionDate: '2026-03-05',
        createdAt: new Date('2026-03-05T00:00:00Z'),
      }),
      makeTx({
        transactionType: 'return_in',
        quantity: 2,
        unitCost: 50,
        transactionDate: '2026-03-07',
        createdAt: new Date('2026-03-07T00:00:00Z'),
      }),
    ]

    const layers = buildFifoLayers(txns)

    // Layer 1: 10 purchased, 5 sold → 5 remaining
    // Layer 2: 2 returned → 2 available
    expect(layers).toHaveLength(2)
    expect(layers[0].available).toBe(5)
    expect(layers[1].available).toBe(2)
  })
})
