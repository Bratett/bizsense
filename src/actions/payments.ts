'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, orders, paymentsReceived } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { atomicTransactionWrite } from '@/lib/atomic'
import type { JournalLineInput, PostJournalEntryInput } from '@/lib/ledger'
import type { PaymentMethod } from './orders'

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordPaymentInput = {
  orderId: string
  amount: number           // GHS amount received
  paymentMethod: string
  paymentDate: string
  momoReference?: string
  bankReference?: string
  notes?: string
}

export type RecordPaymentResult =
  | { success: true; paymentId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

// ─── Payment List Item ──────────────────────────────────────────────────────

export type PaymentListItem = {
  id: string
  amount: string
  paymentMethod: string
  paymentDate: string
  momoReference: string | null
  bankReference: string | null
  createdAt: Date
}

export async function listPaymentsForOrder(
  orderId: string,
): Promise<PaymentListItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .select({
      id: paymentsReceived.id,
      amount: paymentsReceived.amount,
      paymentMethod: paymentsReceived.paymentMethod,
      paymentDate: paymentsReceived.paymentDate,
      momoReference: paymentsReceived.momoReference,
      bankReference: paymentsReceived.bankReference,
      createdAt: paymentsReceived.createdAt,
    })
    .from(paymentsReceived)
    .where(
      and(
        eq(paymentsReceived.orderId, orderId),
        eq(paymentsReceived.businessId, businessId),
      ),
    )
    .orderBy(paymentsReceived.paymentDate)

  return rows
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<PaymentMethod, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

const AR_ACCOUNT_CODE = '1100'
// FX gain/loss account — reserved for v2 when accepting foreign currency cash
const FX_GAIN_LOSS_ACCOUNT_CODE = '4003'

const VALID_PAYMENT_METHODS = Object.keys(PAYMENT_ACCOUNT_CODES) as PaymentMethod[]

// ─── Record Payment Received ─────────────────────────────────────────────────

export async function recordPaymentReceived(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  // 1. Session — all roles allowed
  const session = await getServerSession()
  const { businessId, id: userId } = session.user

  // 2. Validate payment method
  const fieldErrors: Record<string, string> = {}

  if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod as PaymentMethod)) {
    return { success: false, error: 'Invalid payment method.' }
  }
  if (
    (input.paymentMethod as string).startsWith('momo_') &&
    !input.momoReference?.trim()
  ) {
    fieldErrors.momoReference = 'MoMo reference is required for mobile money payments'
  }
  if (input.paymentMethod === 'bank' && !input.bankReference?.trim()) {
    fieldErrors.bankReference = 'Bank reference is required for bank payments'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // 3. Fetch and validate order
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.businessId, businessId)))

  if (!order) return { success: false, error: 'Order not found.' }
  if (order.status !== 'fulfilled') {
    return { success: false, error: 'Only fulfilled orders can receive payments.' }
  }
  if (order.paymentStatus === 'paid') {
    return { success: false, error: 'This order is already fully paid.' }
  }
  if (!['unpaid', 'partial'].includes(order.paymentStatus)) {
    return { success: false, error: 'This order is not eligible for payment.' }
  }

  // 4. Compute remaining balance and validate amount
  const totalAmount = Number(order.totalAmount)
  const alreadyPaid = Number(order.amountPaid)
  const remainingBalance = Math.round((totalAmount - alreadyPaid) * 100) / 100

  if (input.amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than 0.' }
  }
  if (input.amount > remainingBalance + 0.001) {
    return {
      success: false,
      error: `Payment amount (GHS ${input.amount.toFixed(2)}) exceeds remaining balance (GHS ${remainingBalance.toFixed(2)}).`,
    }
  }

  // 5. Compute new payment status
  const newAmountPaid = Math.round((alreadyPaid + input.amount) * 100) / 100
  const newPaymentStatus =
    newAmountPaid >= totalAmount - 0.001 ? 'paid' : 'partial'

  // 6. FX gain/loss (MVP: all amounts stored in GHS so fxDifference = 0)
  // v2: when customer pays foreign currency at current rate that differs from
  // the locked rate on order.fxRate, compute the GHS difference here.
  const fxDifference = 0

  // 7. Resolve GL accounts
  const paymentAccountCode = PAYMENT_ACCOUNT_CODES[input.paymentMethod as PaymentMethod]
  const neededCodes = [paymentAccountCode, AR_ACCOUNT_CODE]
  if (fxDifference !== 0) neededCodes.push(FX_GAIN_LOSS_ACCOUNT_CODE)

  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(
      and(eq(accounts.businessId, businessId), inArray(accounts.code, neededCodes)),
    )
  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))

  const paymentAccountId = accountMap[paymentAccountCode]
  const arAccountId = accountMap[AR_ACCOUNT_CODE]

  if (!paymentAccountId) {
    return {
      success: false,
      error: `Payment account (${paymentAccountCode}) not found. Please complete business setup.`,
    }
  }
  if (!arAccountId) {
    return {
      success: false,
      error: 'Accounts Receivable (1100) not found. Please complete business setup.',
    }
  }

  // 8. Build journal lines
  const journalLines: JournalLineInput[] = []

  if (fxDifference === 0) {
    // Simple: Dr Payment Account / Cr 1100 AR
    journalLines.push({
      accountId: paymentAccountId,
      debitAmount: input.amount,
      creditAmount: 0,
      memo: `Payment received — ${order.orderNumber}`,
    })
    journalLines.push({
      accountId: arAccountId,
      debitAmount: 0,
      creditAmount: input.amount,
      memo: `AR cleared — ${order.orderNumber}`,
    })
  } else if (fxDifference > 0) {
    // FX Gain: Dr Payment / Cr AR (remaining) / Cr FX Gain
    const fxAccountId = accountMap[FX_GAIN_LOSS_ACCOUNT_CODE]
    journalLines.push({ accountId: paymentAccountId, debitAmount: input.amount, creditAmount: 0 })
    journalLines.push({ accountId: arAccountId, debitAmount: 0, creditAmount: remainingBalance })
    if (fxAccountId) {
      journalLines.push({ accountId: fxAccountId, debitAmount: 0, creditAmount: fxDifference })
    }
  } else {
    // FX Loss: Dr Payment + Dr FX Loss / Cr AR (remaining)
    const fxAccountId = accountMap[FX_GAIN_LOSS_ACCOUNT_CODE]
    journalLines.push({ accountId: paymentAccountId, debitAmount: input.amount, creditAmount: 0 })
    if (fxAccountId) {
      journalLines.push({
        accountId: fxAccountId,
        debitAmount: Math.abs(fxDifference),
        creditAmount: 0,
      })
    }
    journalLines.push({ accountId: arAccountId, debitAmount: 0, creditAmount: remainingBalance })
  }

  // 9. Pre-generate payment UUID so we can use it as sourceId
  const paymentId = crypto.randomUUID()

  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: input.paymentDate,
    reference: order.orderNumber,
    description: `Payment received — ${order.orderNumber}`,
    sourceType: 'payment',
    sourceId: paymentId,
    createdBy: userId,
    lines: journalLines,
  }

  // 10. Atomic write: payment record + journal entry + order update
  await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    // Insert payment record
    await tx.insert(paymentsReceived).values({
      id: paymentId,
      businessId,
      orderId: input.orderId,
      customerId: order.customerId ?? null,
      amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate,
      momoReference: input.momoReference ?? null,
      bankReference: input.bankReference ?? null,
      notes: input.notes ?? null,
      journalEntryId,
      createdBy: userId,
    })

    // Update order amountPaid and paymentStatus
    await tx
      .update(orders)
      .set({
        amountPaid: newAmountPaid.toFixed(2),
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, input.orderId))

    return paymentId
  })

  return { success: true, paymentId }
}
