// ─── FIFO Cost Engine ────────────────────────────────────────────────────────
// Pure functions — no database imports. Pass pre-fetched transaction data in;
// receive cost computations out. Fully testable without a database.

// ─── Types ───────────────────────────────────────────────────────────────────

export type FifoTransactionInput = {
  id: string
  transactionType:
    | 'purchase'
    | 'sale'
    | 'adjustment'
    | 'opening'
    | 'return_in'
    | 'return_out'
  quantity: number // positive = stock in, negative = stock out
  unitCost: number
  transactionDate: string // 'YYYY-MM-DD'
  createdAt: Date
}

export type InventoryLayer = {
  transactionId: string
  transactionDate: string
  createdAt: Date
  quantity: number // original layer quantity
  available: number // remaining after prior consumption
  unitCost: number
}

export type FifoSaleResult = {
  cogsTotal: number
  layersConsumed: Array<{
    layerId: string
    quantityConsumed: number
    unitCost: number
    lineTotal: number
  }>
  remainingQuantity: number
  insufficientStock: boolean
  shortfall: number
}

export type FifoInventoryValue = {
  totalValue: number
  totalQuantity: number
  remainingLayers: InventoryLayer[]
}

// ─── Inbound / outbound classification ───────────────────────────────────────

const INBOUND_TYPES = new Set(['opening', 'purchase', 'return_in'])
const OUTBOUND_TYPES = new Set(['sale', 'return_out'])

function isInbound(tx: FifoTransactionInput): boolean {
  if (INBOUND_TYPES.has(tx.transactionType)) return true
  if (tx.transactionType === 'adjustment' && tx.quantity > 0) return true
  return false
}

function isOutbound(tx: FifoTransactionInput): boolean {
  if (OUTBOUND_TYPES.has(tx.transactionType)) return true
  if (tx.transactionType === 'adjustment' && tx.quantity < 0) return true
  return false
}

// ─── Core: build FIFO layers by replaying all transactions ───────────────────

/**
 * Replay all inventory transactions chronologically to build the current
 * FIFO layer state. Each inbound transaction creates a layer; each outbound
 * transaction consumes from the oldest available layers.
 */
export function buildFifoLayers(
  transactions: FifoTransactionInput[],
): InventoryLayer[] {
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = a.transactionDate.localeCompare(b.transactionDate)
    if (dateDiff !== 0) return dateDiff
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  const layers: InventoryLayer[] = []

  for (const tx of sorted) {
    if (isInbound(tx)) {
      const qty = Math.abs(tx.quantity)
      if (qty > 0) {
        layers.push({
          transactionId: tx.id,
          transactionDate: tx.transactionDate,
          createdAt: tx.createdAt,
          quantity: qty,
          available: qty,
          unitCost: tx.unitCost,
        })
      }
    } else if (isOutbound(tx)) {
      let remaining = Math.abs(tx.quantity)
      for (const layer of layers) {
        if (remaining < 0.0001) break
        const consumed = Math.min(layer.available, remaining)
        layer.available -= consumed
        remaining -= consumed
      }
    }
    // Zero-quantity adjustments are a no-op
  }

  return layers
}

// ─── computeFifoCogs ─────────────────────────────────────────────────────────

/**
 * Given all inventory transactions for a product, compute the FIFO cost
 * of selling `quantityToSell` units from the remaining layers.
 */
export function computeFifoCogs(
  transactions: FifoTransactionInput[],
  quantityToSell: number,
): FifoSaleResult {
  const layers = buildFifoLayers(transactions)
  const activeLayers = layers.filter((l) => l.available > 0.0001)

  let remaining = quantityToSell
  let cogsTotal = 0
  const layersConsumed: FifoSaleResult['layersConsumed'] = []

  for (const layer of activeLayers) {
    if (remaining < 0.0001) break
    const consumed = Math.min(layer.available, remaining)
    const lineTotal = consumed * layer.unitCost
    cogsTotal += lineTotal
    layersConsumed.push({
      layerId: layer.transactionId,
      quantityConsumed: consumed,
      unitCost: layer.unitCost,
      lineTotal,
    })
    remaining -= consumed
  }

  const totalAvailable = activeLayers.reduce((sum, l) => sum + l.available, 0)
  const actualSold = quantityToSell - Math.max(0, remaining)

  return {
    cogsTotal: Math.round(cogsTotal * 100) / 100,
    layersConsumed,
    remainingQuantity: totalAvailable - actualSold,
    insufficientStock: remaining > 0.0001,
    shortfall: remaining > 0.0001 ? Math.round(remaining * 100) / 100 : 0,
  }
}

// ─── computeFifoInventoryValue ───────────────────────────────────────────────

/**
 * Compute total inventory value using FIFO for all remaining layers.
 * Used for Balance Sheet and Valuation Report.
 */
export function computeFifoInventoryValue(
  transactions: FifoTransactionInput[],
): FifoInventoryValue {
  const layers = buildFifoLayers(transactions)
  const remainingLayers = layers.filter((l) => l.available > 0.0001)

  const totalValue = remainingLayers.reduce(
    (sum, l) => sum + l.available * l.unitCost,
    0,
  )
  const totalQuantity = remainingLayers.reduce(
    (sum, l) => sum + l.available,
    0,
  )

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    totalQuantity,
    remainingLayers,
  }
}
