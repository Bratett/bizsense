// BROWSER ONLY
import { localDb } from '@/db/local/dexie'
import { generateOrderNumber } from '@/lib/orderNumber'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import type { FifoTransactionInput } from '@/lib/inventory/fifo'
import { enqueueSync, enqueueDeferredJournal } from '@/lib/offline/offlineWrite'
import type { CreateOrderInput } from '@/actions/orders'

// ─── Account code constants (mirrors orders.ts server-side constants) ─────────

const PAYMENT_ACCOUNT_CODES: Record<string, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}
const AR_ACCOUNT_CODE = '1100'
const REVENUE_ACCOUNT_CODE = '4001'
const VAT_PAYABLE_ACCOUNT_CODE = '2100'
const COGS_ACCOUNT_CODE = '5001'
const INVENTORY_ACCOUNT_CODE = '1200'

// ─── Input type ───────────────────────────────────────────────────────────────

export type OfflineOrderInput = CreateOrderInput & {
  businessId: string
  userId: string
  // Pre-computed totals from the form (already calculated via previewOrderTax)
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Write a cash/credit/partial order to Dexie when the network is unavailable.
 * Enqueues sync items and a deferred journal blueprint for server-side promotion.
 * Returns the locally-generated orderId.
 */
export async function writeOrderOffline(input: OfflineOrderInput): Promise<string> {
  const orderId = crypto.randomUUID()
  const orderNumber = await generateOrderNumber()
  const now = new Date().toISOString()
  const paymentStatus = input.paymentStatus ?? 'paid'

  // ── 1. Compute FIFO COGS for product-linked lines ─────────────────────────
  type CogsResult = { productId: string; cogsTotal: number; quantity: number; unitCost: number }
  const cogsByProduct: CogsResult[] = []

  for (const line of input.lines) {
    if (!line.productId) continue

    const txns = await localDb.inventoryTransactions
      .where('productId')
      .equals(line.productId)
      .toArray()

    const fifoInput: FifoTransactionInput[] = txns.map((t) => ({
      id: t.id,
      transactionType: t.transactionType as FifoTransactionInput['transactionType'],
      quantity: Number(t.quantity),
      unitCost: Number(t.unitCost),
      transactionDate: t.transactionDate,
      createdAt: new Date(t.updatedAt),
    }))

    const fifoResult = computeFifoCogs(fifoInput, line.quantity)

    if (fifoResult.insufficientStock) {
      console.warn(`[Offline] Insufficient stock for product ${line.productId} — proceeding anyway`)
    }

    const unitCost = fifoResult.cogsTotal > 0 ? fifoResult.cogsTotal / line.quantity : 0
    cogsByProduct.push({
      productId: line.productId,
      cogsTotal: fifoResult.cogsTotal,
      quantity: line.quantity,
      unitCost,
    })
  }

  // ── 2. Build records ──────────────────────────────────────────────────────
  const order = {
    id: orderId,
    businessId: input.businessId,
    orderNumber,
    localOrderNumber: orderNumber,
    customerId: input.customerId ?? null,
    orderDate: input.orderDate,
    status: 'fulfilled',
    paymentStatus,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    taxAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    amountPaid: input.amountPaid,
    paymentMethod: input.paymentMethod ?? null,
    fxRate: input.fxRate ?? null,
    notes: input.notes ?? null,
    journalEntryId: null,
    aiGenerated: false,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }

  const orderLineRecords = input.lines.map((l) => {
    const fxRate = input.fxRate ?? 1
    const unitPriceGhs = l.unitPriceCurrency === 'USD' ? l.unitPrice * fxRate : l.unitPrice
    const gross = Math.round(unitPriceGhs * l.quantity * 100) / 100
    const discount = Math.round((l.discountAmount ?? 0) * 100) / 100
    const lineTotal = Math.round((gross - discount) * 100) / 100
    return {
      id: crypto.randomUUID(),
      orderId,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: unitPriceGhs,
      unitPriceCurrency: 'GHS' as const,
      discountAmount: discount,
      lineTotal,
    }
  })

  const inventoryTxRecords = cogsByProduct.map((c) => ({
    id: crypto.randomUUID(),
    businessId: input.businessId,
    productId: c.productId,
    transactionType: 'sale',
    quantity: -c.quantity, // outbound
    unitCost: c.unitCost,
    referenceId: orderId,
    transactionDate: input.orderDate,
    updatedAt: now,
  }))

  // ── 3. Build deferred journal lines using account codes ───────────────────
  const journalLines: Array<{
    accountCode: string
    debitAmount: number
    creditAmount: number
    currency: string
    fxRate: number
  }> = []

  const netRevenue = Math.round((input.subtotal - input.discountAmount) * 100) / 100
  const totalCogs = cogsByProduct.reduce((s, c) => s + c.cogsTotal, 0)

  if (paymentStatus === 'paid') {
    const payCode = input.paymentMethod
      ? (PAYMENT_ACCOUNT_CODES[input.paymentMethod] ?? '1001')
      : '1001'
    journalLines.push({
      accountCode: payCode,
      debitAmount: input.totalAmount,
      creditAmount: 0,
      currency: 'GHS',
      fxRate: 1,
    })
  } else if (paymentStatus === 'unpaid') {
    journalLines.push({
      accountCode: AR_ACCOUNT_CODE,
      debitAmount: input.totalAmount,
      creditAmount: 0,
      currency: 'GHS',
      fxRate: 1,
    })
  } else if (paymentStatus === 'partial') {
    const payCode = input.paymentMethod
      ? (PAYMENT_ACCOUNT_CODES[input.paymentMethod] ?? '1001')
      : '1001'
    const arBalance = Math.round((input.totalAmount - input.amountPaid) * 100) / 100
    journalLines.push({
      accountCode: payCode,
      debitAmount: input.amountPaid,
      creditAmount: 0,
      currency: 'GHS',
      fxRate: 1,
    })
    journalLines.push({
      accountCode: AR_ACCOUNT_CODE,
      debitAmount: arBalance,
      creditAmount: 0,
      currency: 'GHS',
      fxRate: 1,
    })
  }

  journalLines.push({
    accountCode: REVENUE_ACCOUNT_CODE,
    debitAmount: 0,
    creditAmount: netRevenue,
    currency: 'GHS',
    fxRate: 1,
  })

  if (input.taxAmount > 0) {
    journalLines.push({
      accountCode: VAT_PAYABLE_ACCOUNT_CODE,
      debitAmount: 0,
      creditAmount: input.taxAmount,
      currency: 'GHS',
      fxRate: 1,
    })
  }

  if (totalCogs > 0) {
    journalLines.push({
      accountCode: COGS_ACCOUNT_CODE,
      debitAmount: totalCogs,
      creditAmount: 0,
      currency: 'GHS',
      fxRate: 1,
    })
    journalLines.push({
      accountCode: INVENTORY_ACCOUNT_CODE,
      debitAmount: 0,
      creditAmount: totalCogs,
      currency: 'GHS',
      fxRate: 1,
    })
  }

  // ── 4. Write everything to Dexie atomically ───────────────────────────────
  await localDb.transaction(
    'rw',
    [
      localDb.orders,
      localDb.orderLines,
      localDb.inventoryTransactions,
      localDb.syncQueue,
      localDb.deferredJournals,
    ],
    async () => {
      await localDb.orders.add(order)
      await localDb.orderLines.bulkAdd(orderLineRecords)

      for (const invTx of inventoryTxRecords) {
        await localDb.inventoryTransactions.add(invTx)
        await enqueueSync('inventory_transactions', invTx.id, { ...invTx })
      }

      await enqueueSync('orders', orderId, { ...order })
      for (const line of orderLineRecords) {
        await enqueueSync('order_lines', line.id, { ...line })
      }

      await enqueueDeferredJournal({
        id: crypto.randomUUID(),
        businessId: input.businessId,
        sourceTable: 'orders',
        sourceId: orderId,
        proposedEntry: {
          entryDate: input.orderDate,
          description: `Sale ${orderNumber}`,
          sourceType: 'order',
          lines: journalLines,
        },
      })
    },
  )

  return orderId
}
