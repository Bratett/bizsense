'use server'

import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/db'
import { pendingAiActions, aiConversationLogs } from '@/db/schema/ai'
import { customers } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { createOrder, type PaymentMethod, reverseOrder } from '@/actions/orders'
import { createExpense, reverseExpense } from '@/actions/expenses'
import { recordPaymentReceived } from '@/actions/payments'
import { adjustStock } from '@/actions/inventory'
import {
  createCustomer,
  updateCustomer,
  type CustomerActionResult,
} from '@/actions/customers'
import { createSupplier, type SupplierActionResult } from '@/actions/suppliers'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConfirmAiActionResult =
  | { success: true; resultId?: string; resultTable?: string }
  | { success: false; error: string }

export type PendingActionRow = typeof pendingAiActions.$inferSelect
export type FlaggedLogRow = typeof aiConversationLogs.$inferSelect

// ─── Confirm ──────────────────────────────────────────────────────────────────

export async function confirmAiAction(pendingId: string): Promise<ConfirmAiActionResult> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  // Fetch and validate — triple WHERE enforces tenant isolation
  const [pending] = await db
    .select()
    .from(pendingAiActions)
    .where(
      and(
        eq(pendingAiActions.id, pendingId),
        eq(pendingAiActions.businessId, businessId),
        eq(pendingAiActions.status, 'pending'),
      ),
    )

  if (!pending) {
    return { success: false, error: 'Action not found or already processed' }
  }

  if (pending.expiresAt && new Date(pending.expiresAt) < new Date()) {
    await db
      .update(pendingAiActions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(pendingAiActions.id, pendingId))
    return { success: false, error: 'This action has expired. Please ask again.' }
  }

  const data = pending.proposedData as Record<string, unknown>
  let resultId: string | undefined
  let resultTable: string | undefined

  try {
    switch (pending.actionType) {
      // ── record_sale ───────────────────────────────────────────────────────
      case 'record_sale': {
        type ItemShape = {
          productId?: string
          productName: string
          qty: number
          unit_price: number
        }
        // Order number must match ORD-[A-Z2-9]{4}-\d{4,} — BSAI = BizSense AI
        const orderResult = await createOrder({
          orderNumber: `ORD-BSAI-${Date.now()}`,
          customerId: data.customerId as string | undefined,
          orderDate: data.orderDate as string,
          lines: (data.items as ItemShape[]).map((item) => ({
            productId: item.productId,
            description: item.productName,
            quantity: item.qty,
            unitPrice: item.unit_price,
            unitPriceCurrency: 'GHS' as const,
          })),
          discountType: data.discountAmount ? ('fixed' as const) : undefined,
          discountValue: Number(data.discountAmount ?? 0),
          paymentMethod: data.paymentMethod as PaymentMethod | undefined,
          paymentStatus:
            data.paymentMethod === 'credit'
              ? ('unpaid' as const)
              : ('paid' as const),
          applyVat: false,
        })

        if (!orderResult.success) throw new Error(orderResult.error)
        resultId = orderResult.orderId
        resultTable = 'orders'
        break
      }

      // ── record_expense ────────────────────────────────────────────────────
      case 'record_expense': {
        const expenseResult = await createExpense({
          expenseDate: data.expenseDate as string,
          category: data.category as string,
          amount: Number(data.amount),
          paymentMethod: data.paymentMethod as
            | 'cash'
            | 'momo_mtn'
            | 'momo_telecel'
            | 'momo_airtel'
            | 'bank',
          description: data.description as string,
          includesVat: Boolean(data.includesVat),
          isCapitalExpense: Boolean(data.isCapitalExpense),
        })

        if (!expenseResult.success) throw new Error(expenseResult.error)
        resultId = expenseResult.expenseId
        resultTable = 'expenses'
        break
      }

      // ── record_payment_received ───────────────────────────────────────────
      case 'record_payment_received': {
        const paymentResult = await recordPaymentReceived({
          orderId: data.orderId as string,
          amount: Number(data.amount),
          paymentMethod: data.paymentMethod as string,
          paymentDate: data.paymentDate as string,
        })

        if (!paymentResult.success) throw new Error(paymentResult.error)
        resultId = paymentResult.paymentId
        resultTable = 'payments_received'
        break
      }

      // ── add_customer ──────────────────────────────────────────────────────
      case 'add_customer': {
        const fd = new FormData()
        fd.append('name', data.name as string)
        fd.append('phone', data.phone as string)
        if (data.location) fd.append('location', data.location as string)
        if (data.creditLimit) fd.append('creditLimit', String(data.creditLimit))

        const customerResult = await createCustomer({} as CustomerActionResult, fd)
        if (!customerResult.success) {
          throw new Error(customerResult.error ?? 'Failed to create customer')
        }
        resultId = customerResult.customerId
        resultTable = 'customers'
        break
      }

      // ── update_customer ───────────────────────────────────────────────────
      case 'update_customer': {
        const customerId = data.customerId as string

        // Fetch current record to merge with the proposed single-field update
        const [current] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))

        if (!current) throw new Error('Customer not found')

        const fields: Record<string, string> = {
          id: customerId,
          name: current.name,
          phone: current.phone ?? '',
          email: current.email ?? '',
          location: current.location ?? '',
          momoNumber: current.momoNumber ?? '',
          creditLimit: String(current.creditLimit),
          notes: current.notes ?? '',
        }

        // Apply the proposed change (one field update)
        const fieldName = data.field as string
        if (fieldName in fields) {
          fields[fieldName] = String(data.value)
        }

        const fd = new FormData()
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v))

        const updateResult = await updateCustomer({} as CustomerActionResult, fd)
        if (!updateResult.success) {
          throw new Error(updateResult.error ?? 'Failed to update customer')
        }
        resultId = customerId
        resultTable = 'customers'
        break
      }

      // ── add_supplier ──────────────────────────────────────────────────────
      case 'add_supplier': {
        const fd = new FormData()
        fd.append('name', data.name as string)
        fd.append('phone', data.phone as string)

        const supplierResult = await createSupplier({} as SupplierActionResult, fd)
        if (!supplierResult.success) {
          throw new Error(supplierResult.error ?? 'Failed to create supplier')
        }
        resultId = supplierResult.supplierId
        resultTable = 'suppliers'
        break
      }

      // ── adjust_stock ──────────────────────────────────────────────────────
      case 'adjust_stock': {
        const quantityChange = Number(data.quantityChange)
        const stockResult = await adjustStock({
          productId: data.productId as string,
          adjustmentType: quantityChange > 0 ? 'add' : 'remove',
          quantity: Math.abs(quantityChange),
          reason: data.reason as string,
          notes: data.notes as string | undefined,
        })

        if (!stockResult.success) throw new Error(stockResult.error)
        resultId = stockResult.transactionId
        resultTable = 'inventory_transactions'
        break
      }

      default:
        return { success: false, error: `Unknown action type: ${pending.actionType}` }
    }

    // Mark as confirmed — only reached if the switch succeeded
    await db
      .update(pendingAiActions)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        resultId: resultId ?? null,
        resultTable: resultTable ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pendingAiActions.id, pendingId))

    return { success: true, resultId, resultTable }
  } catch (err) {
    // Status stays 'pending' — user can retry or ask the AI again
    const message = err instanceof Error ? err.message : 'Promotion failed'
    return { success: false, error: message }
  }
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectAiAction(pendingId: string): Promise<void> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  await db
    .update(pendingAiActions)
    .set({ status: 'rejected', rejectedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pendingAiActions.id, pendingId),
        eq(pendingAiActions.businessId, businessId),
        eq(pendingAiActions.status, 'pending'),
      ),
    )
}

// ─── Reverse ──────────────────────────────────────────────────────────────────

/**
 * Reverse a confirmed AI action.  Only owners and managers may reverse.
 * Calls the existing reverseOrder / reverseExpense action for the underlying
 * record, then stamps the pendingAiAction with reversedAt/reversedBy/reason.
 *
 * payments_received reversals are not supported in Phase 1 — instruct the
 * user to record a correcting transaction manually.
 */
export async function reverseAiAction(pendingId: string, reason: string): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId, id: userId } = user

  const [action] = await db
    .select()
    .from(pendingAiActions)
    .where(
      and(
        eq(pendingAiActions.id, pendingId),
        eq(pendingAiActions.businessId, businessId),
        eq(pendingAiActions.status, 'confirmed'),
      ),
    )

  if (!action) {
    throw new Error('Action not found or not reversible')
  }

  const { resultTable, resultId } = action

  if (!resultId) {
    throw new Error('No result record to reverse')
  }

  switch (resultTable) {
    case 'orders': {
      const result = await reverseOrder({ orderId: resultId, reason, restockInventory: true })
      if (!result.success) throw new Error(result.error)
      break
    }
    case 'expenses': {
      const result = await reverseExpense(resultId, reason)
      if (!result.success) throw new Error(result.error)
      break
    }
    default:
      throw new Error(
        `Reversal not supported for ${resultTable ?? 'this action type'} in Phase 1. ` +
          'Please record a correcting transaction manually.',
      )
  }

  await db
    .update(pendingAiActions)
    .set({ reversedAt: new Date(), reversedBy: userId, reversalReason: reason, updatedAt: new Date() })
    .where(eq(pendingAiActions.id, pendingId))
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export async function getAiActivityLog(filters: {
  status?: 'all' | 'confirmed' | 'rejected' | 'pending' | 'expired'
  dateFrom?: string
  dateTo?: string
}): Promise<{ actions: PendingActionRow[]; flaggedLogs: FlaggedLogRow[] }> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Build the WHERE conditions for pendingAiActions
  const conditions = [eq(pendingAiActions.businessId, businessId)]

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(pendingAiActions.status, filters.status))
  }

  if (filters.dateFrom) {
    conditions.push(gte(pendingAiActions.createdAt, new Date(filters.dateFrom)))
  }

  if (filters.dateTo) {
    // Include the full day by adding one day
    const to = new Date(filters.dateTo)
    to.setDate(to.getDate() + 1)
    conditions.push(lte(pendingAiActions.createdAt, to))
  }

  const [actions, flaggedLogs] = await Promise.all([
    db
      .select()
      .from(pendingAiActions)
      .where(and(...(conditions as [ReturnType<typeof eq>])))
      .orderBy(desc(pendingAiActions.createdAt)),
    db
      .select()
      .from(aiConversationLogs)
      .where(
        and(
          eq(aiConversationLogs.businessId, businessId),
          eq(aiConversationLogs.requiresReview, true),
        ),
      )
      .orderBy(desc(aiConversationLogs.createdAt)),
  ])

  return { actions, flaggedLogs }
}
