// BROWSER ONLY
// Mirrors server-written records to Dexie after successful online writes.
// Server Actions return minimal results (only IDs), so we construct the Dexie
// record from form data the client already has, plus the server-issued IDs.
import { localDb } from '@/db/local/dexie'
import { normaliseGhanaPhone } from '@/lib/csvImport'
import type { CreateOrderInput } from '@/actions/orders'
import type { CreateExpenseInput } from '@/actions/expenses'
import { categoryToAccountCode, FIXED_ASSETS_ACCOUNT_CODE } from '@/lib/expenses/categories'

// ─── Order mirror ─────────────────────────────────────────────────────────────

export type OrderMirrorComputed = {
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
}

export async function mirrorOrderToDexie(
  result: { orderId: string; orderNumber: string },
  input: CreateOrderInput,
  computed: OrderMirrorComputed,
): Promise<void> {
  const now = new Date().toISOString()
  const paymentStatus = input.paymentStatus ?? 'paid'
  const fxRate = input.fxRate ?? null

  const order = {
    id: result.orderId,
    businessId: '', // filled below
    orderNumber: result.orderNumber,
    localOrderNumber: null,
    customerId: input.customerId ?? null,
    orderDate: input.orderDate,
    status: 'fulfilled',
    paymentStatus,
    subtotal: computed.subtotal,
    discountAmount: computed.discountAmount,
    taxAmount: computed.taxAmount,
    totalAmount: computed.totalAmount,
    amountPaid: computed.amountPaid,
    paymentMethod: input.paymentMethod ?? null,
    fxRate,
    notes: input.notes ?? null,
    journalEntryId: null, // unknown client-side; next pull fills it in
    aiGenerated: false,
    syncStatus: 'synced' as const,
    updatedAt: now,
  }

  // Reconstruct line totals (same arithmetic as the server action)
  const orderLines = input.lines.map((l) => {
    const effectiveFxRate = fxRate ?? 1
    const unitPriceGhs = l.unitPriceCurrency === 'USD' ? l.unitPrice * effectiveFxRate : l.unitPrice
    const gross = Math.round(unitPriceGhs * l.quantity * 100) / 100
    const discount = Math.round((l.discountAmount ?? 0) * 100) / 100
    const lineTotal = Math.round((gross - discount) * 100) / 100
    return {
      id: crypto.randomUUID(),
      orderId: result.orderId,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: unitPriceGhs,
      unitPriceCurrency: 'GHS' as const,
      discountAmount: discount,
      lineTotal,
    }
  })

  // businessId is not available in CreateOrderInput; read from existing Dexie meta
  // (it was set by AppInitialiser and lives on the business record)
  const businesses = await localDb.businesses.toArray()
  const businessId = businesses[0]?.id ?? ''

  await localDb.transaction('rw', [localDb.orders, localDb.orderLines], async () => {
    await localDb.orders.put({ ...order, businessId })
    await localDb.orderLines.bulkPut(orderLines)
  })
}

// ─── Expense mirror ───────────────────────────────────────────────────────────

export async function mirrorExpenseToDexie(
  result: { expenseId: string },
  input: CreateExpenseInput,
  approvalStatus: 'pending_approval' | 'approved',
): Promise<void> {
  const now = new Date().toISOString()

  const accountCode = input.isCapitalExpense
    ? FIXED_ASSETS_ACCOUNT_CODE
    : (categoryToAccountCode(input.category) ?? '6009')

  // Look up accountId from Dexie accounts (available after bootstrap)
  const accountRow = await localDb.accounts.where('code').equals(accountCode).first()

  const expense = {
    id: result.expenseId,
    businessId: '', // filled below
    expenseDate: input.expenseDate,
    category: input.category ?? null,
    accountId: accountRow?.id ?? null,
    amount: input.amount,
    paymentMethod: input.paymentMethod ?? null,
    description: input.description,
    receiptUrl: input.receiptUrl ?? null,
    isCapitalExpense: input.isCapitalExpense ?? false,
    approvalStatus,
    journalEntryId: null,
    aiGenerated: false,
    syncStatus: 'synced' as const,
    updatedAt: now,
  }

  const businesses = await localDb.businesses.toArray()
  const businessId = businesses[0]?.id ?? ''

  await localDb.expenses.put({ ...expense, businessId })
}

// ─── Customer mirror ──────────────────────────────────────────────────────────

export type CustomerMirrorInput = {
  name: string
  phone: string
  email?: string | null
  location?: string | null
  momoNumber?: string | null
  creditLimit: number
  notes?: string | null
}

export async function mirrorCustomerToDexie(
  result: { customerId: string },
  formValues: CustomerMirrorInput,
): Promise<void> {
  const now = new Date().toISOString()
  const normalisedPhone = normaliseGhanaPhone(formValues.phone) ?? formValues.phone

  const businesses = await localDb.businesses.toArray()
  const businessId = businesses[0]?.id ?? ''

  await localDb.customers.put({
    id: result.customerId,
    businessId,
    name: formValues.name.trim(),
    phone: normalisedPhone,
    email: formValues.email ?? null,
    location: formValues.location ?? null,
    momoNumber: formValues.momoNumber ?? null,
    creditLimit: formValues.creditLimit,
    paymentTermsDays: 30,
    isActive: true,
    syncStatus: 'synced',
    updatedAt: now,
  })
}
