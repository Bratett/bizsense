'use server'

import { and, eq, desc, gte, lte, inArray, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  businesses,
  accounts,
  orders,
  orderLines,
  paymentsReceived,
  customers,
  products,
  inventoryTransactions,
} from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { calculateTax, type TaxCalculationResult } from '@/lib/tax'
import { atomicTransactionWrite } from '@/lib/atomic'
import type { JournalLineInput, PostJournalEntryInput } from '@/lib/ledger'
import { reverseJournalEntry } from '@/lib/ledger'
import { isValidOrderNumber } from '@/lib/orderNumber'
import { getProductTransactions } from '@/lib/inventory/queries'
import { computeFifoCogs } from '@/lib/inventory/fifo'
import { getAllowNegativeStock } from '@/lib/inventory/settings'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'momo_mtn' | 'momo_telecel' | 'momo_airtel' | 'bank'

export type OrderLineInput = {
  productId?: string
  description: string
  quantity: number
  unitPrice: number
  unitPriceCurrency: 'GHS' | 'USD'
  discountAmount?: number
}

export type CreateOrderInput = {
  orderNumber: string
  customerId?: string
  orderDate: string
  lines: OrderLineInput[]
  paymentStatus?: 'paid' | 'unpaid' | 'partial' // defaults to 'paid' if omitted (backward compat)
  paymentMethod?: PaymentMethod // required when paymentStatus = 'paid' or 'partial'
  amountPaid?: number // required when paymentStatus = 'partial'
  momoReference?: string
  bankReference?: string
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  applyVat: boolean
  fxRate?: number
  notes?: string
}

// Backward-compat alias — existing callers continue to work
export type CreateCashOrderInput = CreateOrderInput

export type OrderActionResult =
  | { success: true; orderId: string; orderNumber: string; creditWarning?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type OrderListItem = {
  id: string
  orderNumber: string
  customerName: string | null
  orderDate: string
  status: string
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string | null
  paymentMethod: string | null
}

export type OrderDetail = {
  id: string
  orderNumber: string
  localOrderNumber: string | null
  customer: { id: string; name: string; phone: string | null } | null
  orderDate: string
  status: string
  paymentStatus: string
  discountType: string | null
  discountValue: string | null
  subtotal: string | null
  discountAmount: string | null
  taxAmount: string | null
  totalAmount: string | null
  amountPaid: string
  fxRate: string | null
  fxRateLockedAt: Date | null
  notes: string | null
  createdAt: Date
  lines: {
    id: string
    description: string | null
    quantity: string
    unitPrice: string
    unitPriceCurrency: string
    discountAmount: string
    lineTotal: string
  }[]
  payment: {
    id: string
    paymentMethod: string
    momoReference: string | null
    bankReference: string | null
    paymentDate: string
  } | null
  journalEntryId: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<PaymentMethod, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

const REVENUE_ACCOUNT_CODE = '4001'
const VAT_PAYABLE_ACCOUNT_CODE = '2100'
const COGS_ACCOUNT_CODE = '5001'
const INVENTORY_ACCOUNT_CODE = '1200'
const AR_ACCOUNT_CODE = '1100'

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'momo_mtn',
  'momo_telecel',
  'momo_airtel',
  'bank',
]

// ─── Create Order (cash, credit, or partial) ─────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<OrderActionResult> {
  // 1. Session
  const session = await getServerSession()
  const { businessId } = session.user
  const userId = session.user.id

  // 2. Validation
  const fieldErrors: Record<string, string> = {}
  // Resolve paymentStatus — defaults to 'paid' for backward compatibility
  const paymentStatus = input.paymentStatus ?? 'paid'

  if (!input.lines || input.lines.length === 0) {
    return { success: false, error: 'At least one line item is required' }
  }

  if (!input.orderNumber || !isValidOrderNumber(input.orderNumber)) {
    return { success: false, error: 'Invalid order number format' }
  }

  // Credit sale requires a named customer
  if (paymentStatus === 'unpaid' && !input.customerId) {
    return { success: false, error: 'A customer is required for credit sales.' }
  }

  // Payment method required for paid/partial
  if (paymentStatus !== 'unpaid' && !input.paymentMethod) {
    return { success: false, error: 'Payment method is required.' }
  }

  // Partial: amountPaid must be a positive number
  if (paymentStatus === 'partial') {
    if (!input.amountPaid || input.amountPaid <= 0) {
      fieldErrors.amountPaid = 'Amount paid must be greater than 0 for partial payment'
    }
  }

  // Validate payment method when present
  if (input.paymentMethod) {
    if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
      return { success: false, error: 'Invalid payment method' }
    }
    if (input.paymentMethod.startsWith('momo_') && !input.momoReference?.trim()) {
      fieldErrors.momoReference = 'MoMo reference is required for mobile money payments'
    }
    if (input.paymentMethod === 'bank' && !input.bankReference?.trim()) {
      fieldErrors.bankReference = 'Bank reference is required for bank payments'
    }
  }

  const hasUsdLine = input.lines.some((l) => l.unitPriceCurrency === 'USD')
  if (hasUsdLine && (!input.fxRate || input.fxRate <= 0)) {
    fieldErrors.fxRate = 'Exchange rate is required for USD-priced items'
  }

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]
    if (!line.description?.trim()) {
      fieldErrors[`line_${i}_description`] = 'Description is required'
    }
    if (!line.quantity || line.quantity <= 0) {
      fieldErrors[`line_${i}_quantity`] = 'Quantity must be greater than 0'
    }
    if (line.unitPrice == null || line.unitPrice < 0) {
      fieldErrors[`line_${i}_unitPrice`] = 'Unit price must be 0 or greater'
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // 3. Compute line totals in GHS
  const fxRate = hasUsdLine ? input.fxRate! : 1

  const computedLines = input.lines.map((line) => {
    const unitPriceGhs = line.unitPriceCurrency === 'USD' ? line.unitPrice * fxRate : line.unitPrice
    const gross = Math.round(unitPriceGhs * line.quantity * 100) / 100
    const discount = Math.round((line.discountAmount ?? 0) * 100) / 100
    const lineTotal = Math.round((gross - discount) * 100) / 100
    return { ...line, unitPriceGhs, lineTotal }
  })

  // 4. Compute subtotal
  const subtotal = computedLines.reduce((sum, l) => sum + l.lineTotal, 0)

  // 5. Apply order-level discount
  let discountAmount = 0
  if (input.discountType === 'percentage' && input.discountValue) {
    discountAmount = Math.round(subtotal * (input.discountValue / 100) * 100) / 100
  } else if (input.discountType === 'fixed' && input.discountValue) {
    discountAmount = Math.round(input.discountValue * 100) / 100
  }
  discountAmount = Math.min(discountAmount, subtotal)
  const taxableAmount = Math.round((subtotal - discountAmount) * 100) / 100

  // 6. Calculate tax
  let taxAmount = 0
  let taxResult: TaxCalculationResult | null = null
  if (input.applyVat) {
    taxResult = await calculateTax(businessId, taxableAmount)
    taxAmount = taxResult.totalTaxAmount
  }

  const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100

  // 7. Credit limit check (for credit and partial payment sales)
  let creditWarning: string | undefined
  if (paymentStatus !== 'paid' && input.customerId) {
    const [customer] = await db
      .select({ creditLimit: customers.creditLimit })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, businessId)))

    const creditLimit = Number(customer?.creditLimit ?? '0')
    if (creditLimit === 0) {
      return {
        success: false,
        error:
          'This customer has no credit facility. Record as cash payment or set a credit limit on the customer profile.',
      }
    }

    const [outstandingRow] = await db
      .select({
        outstanding: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric) - CAST(${orders.amountPaid} AS numeric)), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, input.customerId),
          eq(orders.businessId, businessId),
          eq(orders.status, 'fulfilled'),
          inArray(orders.paymentStatus, ['unpaid', 'partial']),
        ),
      )

    const currentOutstanding = Number(outstandingRow?.outstanding ?? '0')
    if (currentOutstanding + totalAmount > creditLimit) {
      if (session.user.role === 'cashier') {
        return {
          success: false,
          error: `Credit limit exceeded for this customer. Limit: GHS ${creditLimit.toFixed(2)}, current outstanding: GHS ${currentOutstanding.toFixed(2)}.`,
        }
      }
      // Owner/manager: allow but surface a warning
      creditWarning = `Credit limit exceeded: GHS ${currentOutstanding.toFixed(2)} outstanding, limit GHS ${creditLimit.toFixed(2)}.`
    }
  }

  // 8. Resolve GL account IDs
  const neededCodes = [
    AR_ACCOUNT_CODE,
    REVENUE_ACCOUNT_CODE,
    VAT_PAYABLE_ACCOUNT_CODE,
    COGS_ACCOUNT_CODE,
    INVENTORY_ACCOUNT_CODE,
  ]
  if (input.paymentMethod) {
    neededCodes.push(PAYMENT_ACCOUNT_CODES[input.paymentMethod])
  }

  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, neededCodes)))

  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))

  const arAccountId = accountMap[AR_ACCOUNT_CODE]
  const paymentAccountId = input.paymentMethod
    ? accountMap[PAYMENT_ACCOUNT_CODES[input.paymentMethod]]
    : undefined
  const revenueAccountId = accountMap[REVENUE_ACCOUNT_CODE]
  const vatAccountId = accountMap[VAT_PAYABLE_ACCOUNT_CODE]

  if (paymentStatus !== 'paid' && !arAccountId) {
    return {
      success: false,
      error: 'Accounts Receivable (1100) not found. Please complete business setup.',
    }
  }
  if (paymentStatus !== 'unpaid' && !paymentAccountId) {
    return {
      success: false,
      error: `Payment account not found. Please complete business setup.`,
    }
  }
  if (!revenueAccountId) {
    return {
      success: false,
      error: 'Sales Revenue account (4001) not found. Please complete business setup.',
    }
  }
  if (taxAmount > 0 && !vatAccountId) {
    return {
      success: false,
      error: 'VAT Payable account (2100) not found. Please complete business setup.',
    }
  }

  const cogsAccountId = accountMap[COGS_ACCOUNT_CODE]
  const inventoryAccountId = accountMap[INVENTORY_ACCOUNT_CODE]

  // 9. Compute COGS for product-linked lines (before entering the transaction)
  type CogsPreparedLine = {
    productId: string
    productName: string
    quantity: number
    cogsTotal: number
  }
  const cogsLines: CogsPreparedLine[] = []

  const productLineIndices = input.lines
    .map((l, i) => ({ line: l, idx: i }))
    .filter((entry) => entry.line.productId)

  if (productLineIndices.length > 0 && cogsAccountId && inventoryAccountId) {
    for (const { line } of productLineIndices) {
      const [prod] = await db
        .select({
          id: products.id,
          name: products.name,
          trackInventory: products.trackInventory,
          unit: products.unit,
        })
        .from(products)
        .where(and(eq(products.id, line.productId!), eq(products.businessId, businessId)))

      if (!prod || !prod.trackInventory) continue

      const transactions = await getProductTransactions(line.productId!, businessId)
      const fifoResult = computeFifoCogs(transactions, line.quantity)

      if (fifoResult.insufficientStock && !getAllowNegativeStock(businessId)) {
        const available = Math.round((line.quantity - fifoResult.shortfall) * 100) / 100
        return {
          success: false,
          error: `Insufficient stock for ${prod.name}. Available: ${available} ${prod.unit ?? 'units'}, requested: ${line.quantity} ${prod.unit ?? 'units'}.`,
        }
      }

      if (fifoResult.cogsTotal > 0) {
        cogsLines.push({
          productId: prod.id,
          productName: prod.name,
          quantity: line.quantity,
          cogsTotal: fifoResult.cogsTotal,
        })
      }
    }
  }

  // 10. Pre-generate order UUID for sourceId linkage
  const orderId = crypto.randomUUID()

  // 11. Build journal lines based on payment status
  const journalLines: JournalLineInput[] = []

  if (paymentStatus === 'paid') {
    // Dr Payment Account  totalAmount
    journalLines.push({
      accountId: paymentAccountId!,
      debitAmount: totalAmount,
      creditAmount: 0,
      currency: hasUsdLine ? 'USD' : 'GHS',
      fxRate: hasUsdLine ? fxRate : undefined,
      memo: `Cash sale ${input.orderNumber}`,
    })
  } else if (paymentStatus === 'unpaid') {
    // Dr 1100 AR  totalAmount
    journalLines.push({
      accountId: arAccountId!,
      debitAmount: totalAmount,
      creditAmount: 0,
      currency: hasUsdLine ? 'USD' : 'GHS',
      fxRate: hasUsdLine ? fxRate : undefined,
      memo: `AR — ${input.orderNumber}`,
    })
  } else {
    // partial: Dr AR (balance) + Dr Payment Account (amountPaid)
    const paidNow = Math.min(input.amountPaid!, totalAmount)
    const unpaidNow = Math.round((totalAmount - paidNow) * 100) / 100
    journalLines.push({
      accountId: arAccountId!,
      debitAmount: unpaidNow,
      creditAmount: 0,
      currency: hasUsdLine ? 'USD' : 'GHS',
      fxRate: hasUsdLine ? fxRate : undefined,
      memo: `AR — ${input.orderNumber}`,
    })
    journalLines.push({
      accountId: paymentAccountId!,
      debitAmount: paidNow,
      creditAmount: 0,
      currency: hasUsdLine ? 'USD' : 'GHS',
      fxRate: hasUsdLine ? fxRate : undefined,
      memo: `Partial payment — ${input.orderNumber}`,
    })
  }

  // Cr Revenue
  journalLines.push({
    accountId: revenueAccountId,
    debitAmount: 0,
    creditAmount: taxableAmount,
    currency: hasUsdLine ? 'USD' : 'GHS',
    fxRate: hasUsdLine ? fxRate : undefined,
    memo: `Revenue — ${input.orderNumber}`,
  })

  // Cr VAT Payable (if applicable)
  if (taxAmount > 0 && vatAccountId) {
    journalLines.push({
      accountId: vatAccountId,
      debitAmount: 0,
      creditAmount: taxAmount,
      currency: hasUsdLine ? 'USD' : 'GHS',
      fxRate: hasUsdLine ? fxRate : undefined,
      memo: `VAT — ${input.orderNumber}`,
    })
  }

  // COGS: Dr 5001 / Cr 1200 (self-balancing pair)
  const totalCogs = cogsLines.reduce((sum, cl) => sum + cl.cogsTotal, 0)
  if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
    journalLines.push({
      accountId: cogsAccountId,
      debitAmount: totalCogs,
      creditAmount: 0,
      memo: `COGS — ${input.orderNumber}`,
    })
    journalLines.push({
      accountId: inventoryAccountId,
      debitAmount: 0,
      creditAmount: totalCogs,
      memo: `Inventory reduction — ${input.orderNumber}`,
    })
  }

  // 12. Build journal entry input
  const isCreditOrPartial = paymentStatus !== 'paid'
  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: input.orderDate,
    reference: input.orderNumber,
    description: isCreditOrPartial
      ? `Credit sale ${input.orderNumber}`
      : `Cash sale ${input.orderNumber}`,
    sourceType: 'order',
    sourceId: orderId,
    createdBy: userId,
    lines: journalLines,
  }

  // 13. Determine amounts to record
  const paidNow =
    paymentStatus === 'paid'
      ? totalAmount
      : paymentStatus === 'partial'
        ? Math.min(input.amountPaid!, totalAmount)
        : 0

  // 14. Atomic write — order + lines + optional payment + inventory all succeed or all roll back
  const orderRow = await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    // a. Insert order
    const [created] = await tx
      .insert(orders)
      .values({
        id: orderId,
        businessId,
        orderNumber: input.orderNumber,
        localOrderNumber: input.orderNumber,
        customerId: input.customerId ?? null,
        orderDate: input.orderDate,
        status: 'fulfilled',
        paymentStatus: paymentStatus,
        discountType: input.discountType ?? null,
        discountValue: input.discountValue?.toFixed(2) ?? null,
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        amountPaid: paidNow.toFixed(2),
        fxRate: hasUsdLine ? fxRate.toFixed(4) : null,
        fxRateLockedAt: hasUsdLine ? new Date() : null,
        notes: input.notes ?? null,
        journalEntryId,
        createdBy: userId,
      })
      .returning()

    // b. Insert order lines
    await tx.insert(orderLines).values(
      computedLines.map((cl) => ({
        orderId,
        productId: cl.productId ?? null,
        description: cl.description,
        quantity: cl.quantity.toFixed(2),
        unitPrice: cl.unitPrice.toFixed(2),
        unitPriceCurrency: cl.unitPriceCurrency,
        discountAmount: (cl.discountAmount ?? 0).toFixed(2),
        lineTotal: cl.lineTotal.toFixed(2),
      })),
    )

    // c. Insert payment received record (only if money was actually received)
    if (paymentStatus !== 'unpaid') {
      await tx.insert(paymentsReceived).values({
        businessId,
        orderId,
        customerId: input.customerId ?? null,
        amount: paidNow.toFixed(2),
        paymentMethod: input.paymentMethod!,
        paymentDate: input.orderDate,
        momoReference: input.momoReference ?? null,
        bankReference: input.bankReference ?? null,
        createdBy: userId,
      })
    }

    // d. Insert inventory transactions for product-linked lines (COGS deduction)
    for (const cl of cogsLines) {
      await tx.insert(inventoryTransactions).values({
        businessId,
        productId: cl.productId,
        transactionType: 'sale',
        quantity: (-cl.quantity).toFixed(2),
        unitCost: (cl.cogsTotal / cl.quantity).toFixed(2),
        referenceId: orderId,
        journalEntryId,
        transactionDate: input.orderDate,
        notes: `Sale — ${input.orderNumber}`,
      })
    }

    return created
  })

  return {
    success: true,
    orderId: orderRow.id,
    orderNumber: input.orderNumber,
    ...(creditWarning ? { creditWarning } : {}),
  }
}

// Backward-compat alias — Sprint 3 call sites and existing tests continue to work
export const createCashOrder = createOrder

// ─── Reverse Order (Sales Return) ───────────────────────────────────────────

export async function reverseOrder(input: {
  orderId: string
  reason: string
  restockInventory: boolean
}): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getServerSession()
  const { businessId, id: userId, role } = session.user

  if (!['owner', 'manager'].includes(role)) {
    return { success: false, error: 'Only owners and managers can reverse orders.' }
  }

  // Fetch order
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.businessId, businessId)))

  if (!order) return { success: false, error: 'Order not found.' }
  if (order.status === 'cancelled') return { success: false, error: 'Order is already cancelled.' }
  if (!order.journalEntryId)
    return { success: false, error: 'Order has no journal entry to reverse.' }

  // Fetch payment journal entries (to reverse before the sale JE)
  const paymentRows = await db
    .select({ journalEntryId: paymentsReceived.journalEntryId })
    .from(paymentsReceived)
    .where(eq(paymentsReceived.orderId, input.orderId))

  // Fetch inventory transactions for restock (type='sale' linked to this order)
  let inventoryToRestock: { productId: string; quantity: number; unitCost: number }[] = []
  if (input.restockInventory) {
    const invRows = await db
      .select({
        productId: inventoryTransactions.productId,
        quantity: inventoryTransactions.quantity,
        unitCost: inventoryTransactions.unitCost,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.referenceId, input.orderId),
          eq(inventoryTransactions.businessId, businessId),
          eq(inventoryTransactions.transactionType, 'sale'),
        ),
      )

    inventoryToRestock = invRows.map((r) => ({
      productId: r.productId,
      quantity: Math.abs(Number(r.quantity)),
      unitCost: Number(r.unitCost),
    }))
  }

  const today = new Date().toISOString().split('T')[0]

  await db.transaction(async (tx) => {
    // Reverse payment journal entries FIRST (restores AR balance before sale reversal)
    for (const p of paymentRows) {
      if (p.journalEntryId) {
        await reverseJournalEntry(tx as never, p.journalEntryId, businessId, userId, input.reason)
      }
    }

    // Reverse the original sale journal entry
    await reverseJournalEntry(tx as never, order.journalEntryId!, businessId, userId, input.reason)

    // Restock inventory if requested
    if (input.restockInventory) {
      for (const line of inventoryToRestock) {
        await tx.insert(inventoryTransactions).values({
          businessId,
          productId: line.productId,
          transactionType: 'return_in',
          quantity: line.quantity.toFixed(2),
          unitCost: line.unitCost.toFixed(2),
          referenceId: input.orderId,
          transactionDate: today,
          notes: `Return — ${order.orderNumber}: ${input.reason}`,
        })
      }
    }

    // Mark order cancelled
    await tx
      .update(orders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(orders.id, input.orderId))
  })

  return { success: true }
}

// ─── List Orders ────────────────────────────────────────────────────────────

type OrderListFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  paymentStatus?: 'paid' | 'unpaid' | 'partial'
  dateRange?: 'today' | 'this_week' | 'this_month' | 'all'
}

export async function listOrders(filters?: OrderListFilters): Promise<OrderListItem[]> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: customers.name,
      orderDate: orders.orderDate,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount,
      amountPaid: orders.amountPaid,
      paymentMethod: paymentsReceived.paymentMethod,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(paymentsReceived, eq(paymentsReceived.orderId, orders.id))
    .where(
      and(
        eq(orders.businessId, businessId),
        filters?.search
          ? or(
              ilike(orders.orderNumber, `%${filters.search}%`),
              ilike(customers.name, `%${filters.search}%`),
            )
          : undefined,
        filters?.paymentStatus ? eq(orders.paymentStatus, filters.paymentStatus) : undefined,
        (() => {
          if (!filters?.dateRange || filters.dateRange === 'all') return undefined
          const today = new Date()
          const todayStr = today.toISOString().split('T')[0]
          if (filters.dateRange === 'today') return eq(orders.orderDate, todayStr)
          if (filters.dateRange === 'this_week') {
            const dayOfWeek = today.getDay()
            const startOfWeek = new Date(today)
            startOfWeek.setDate(today.getDate() - dayOfWeek)
            return and(
              gte(orders.orderDate, startOfWeek.toISOString().split('T')[0]),
              lte(orders.orderDate, todayStr),
            )
          }
          if (filters.dateRange === 'this_month') {
            const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
            return and(gte(orders.orderDate, startOfMonth), lte(orders.orderDate, todayStr))
          }
          return undefined
        })(),
      ),
    )
    .orderBy(desc(orders.orderDate), desc(orders.createdAt))

  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    orderDate: r.orderDate,
    status: r.status,
    paymentStatus: r.paymentStatus,
    totalAmount: r.totalAmount,
    amountPaid: r.amountPaid,
    paymentMethod: r.paymentMethod,
  }))
}

// ─── Get Order By ID ────────────────────────────────────────────────────────

export async function getOrderById(id: string): Promise<OrderDetail> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.businessId, businessId)))

  if (!order) throw new Error('Order not found')

  // Fetch customer info
  let customer: OrderDetail['customer'] = null
  if (order.customerId) {
    const [cust] = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, order.customerId))
    if (cust) customer = cust
  }

  // Fetch order lines
  const lines = await db
    .select({
      id: orderLines.id,
      description: orderLines.description,
      quantity: orderLines.quantity,
      unitPrice: orderLines.unitPrice,
      unitPriceCurrency: orderLines.unitPriceCurrency,
      discountAmount: orderLines.discountAmount,
      lineTotal: orderLines.lineTotal,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, id))

  // Fetch most recent payment record
  let payment: OrderDetail['payment'] = null
  const [paymentRow] = await db
    .select({
      id: paymentsReceived.id,
      paymentMethod: paymentsReceived.paymentMethod,
      momoReference: paymentsReceived.momoReference,
      bankReference: paymentsReceived.bankReference,
      paymentDate: paymentsReceived.paymentDate,
    })
    .from(paymentsReceived)
    .where(eq(paymentsReceived.orderId, id))
    .orderBy(desc(paymentsReceived.createdAt))
    .limit(1)

  if (paymentRow) payment = paymentRow

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    localOrderNumber: order.localOrderNumber,
    customer,
    orderDate: order.orderDate,
    status: order.status,
    paymentStatus: order.paymentStatus,
    discountType: order.discountType,
    discountValue: order.discountValue,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    totalAmount: order.totalAmount,
    amountPaid: order.amountPaid,
    fxRate: order.fxRate,
    fxRateLockedAt: order.fxRateLockedAt,
    notes: order.notes,
    createdAt: order.createdAt,
    lines,
    payment,
    journalEntryId: order.journalEntryId,
  }
}

// ─── Preview Order Tax ──────────────────────────────────────────────────────

export async function previewOrderTax(amount: number): Promise<TaxCalculationResult> {
  const session = await getServerSession()
  return calculateTax(session.user.businessId, amount)
}
