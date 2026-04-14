import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  accounts,
  orders,
  orderLines,
  expenses,
  customers,
  inventoryTransactions,
} from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { atomicTransactionWrite } from '@/lib/atomic'
import type { PostJournalEntryInput } from '@/lib/ledger'

// ─── Request / response types ─────────────────────────────────────────────────

type DeferredJournalLine = {
  accountCode: string
  debitAmount: number
  creditAmount: number
  currency: string
  fxRate: number
}

type SyncPushItem = {
  syncQueueId: number
  tableName: string
  recordId: string
  operation: 'upsert'
  payload: Record<string, unknown>
  deferredJournal?: {
    deferredJournalId: string
    proposedEntry: {
      entryDate: string
      description: string
      sourceType: string
      lines: DeferredJournalLine[]
    }
  } | null
}

type SyncResult =
  | { syncQueueId: number; recordId: string; success: true; journalEntryId: string | null }
  | { syncQueueId: number; recordId: string; success: false; error: string }

// ─── Table routing ────────────────────────────────────────────────────────────

type SupportedTable = 'orders' | 'order_lines' | 'expenses' | 'customers' | 'inventory_transactions'

const SUPPORTED_TABLES = new Set<string>([
  'orders',
  'order_lines',
  'expenses',
  'customers',
  'inventory_transactions',
])

function isSupportedTable(name: string): name is SupportedTable {
  return SUPPORTED_TABLES.has(name)
}

// ─── POST /api/sync — receive batched upserts from the sync processor ─────────

export async function POST(request: Request) {
  let session
  try {
    session = await getServerSession()
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { businessId, id: userId } = session.user

  let body: { items: SyncPushItem[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { items } = body
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const results: SyncResult[] = []

  for (const item of items) {
    // Security: reject any item whose payload claims a different businessId
    const payloadBusinessId = item.payload.businessId as string | undefined
    if (payloadBusinessId && payloadBusinessId !== businessId) {
      results.push({
        syncQueueId: item.syncQueueId,
        recordId: item.recordId,
        success: false,
        error: 'Business ID mismatch — rejected',
      })
      continue
    }

    if (!isSupportedTable(item.tableName)) {
      results.push({
        syncQueueId: item.syncQueueId,
        recordId: item.recordId,
        success: false,
        error: `Unsupported table: ${item.tableName}`,
      })
      continue
    }

    try {
      if (item.deferredJournal) {
        // ── Journal-promoted upsert (orders, expenses) ───────────────────────
        const journalEntryId = await processWithJournal(
          item,
          businessId,
          userId,
          item.deferredJournal,
        )
        results.push({
          syncQueueId: item.syncQueueId,
          recordId: item.recordId,
          success: true,
          journalEntryId,
        })
      } else {
        // ── Plain upsert ─────────────────────────────────────────────────────
        await processPlainUpsert(item, businessId, userId)
        results.push({
          syncQueueId: item.syncQueueId,
          recordId: item.recordId,
          success: true,
          journalEntryId: null,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      results.push({
        syncQueueId: item.syncQueueId,
        recordId: item.recordId,
        success: false,
        error: message,
      })
    }
  }

  return NextResponse.json({ results })
}

// ─── Plain upsert (no journal) ────────────────────────────────────────────────

async function processPlainUpsert(
  item: SyncPushItem,
  businessId: string,
  userId: string,
): Promise<void> {
  const payload: Record<string, unknown> = { ...item.payload, businessId } // enforce businessId

  switch (item.tableName as SupportedTable) {
    case 'customers': {
      const val = {
        id: item.recordId,
        businessId,
        name: String(payload.name ?? ''),
        phone: payload.phone != null ? String(payload.phone) : null,
        email: payload.email != null ? String(payload.email) : null,
        location: payload.location != null ? String(payload.location) : null,
        momoNumber: payload.momoNumber != null ? String(payload.momoNumber) : null,
        creditLimit: String(payload.creditLimit ?? '0'),
        paymentTermsDays: Number(payload.paymentTermsDays ?? 30),
        notes: payload.notes != null ? String(payload.notes) : null,
        isActive: Boolean(payload.isActive ?? true),
        updatedAt: new Date(),
      }
      await db
        .insert(customers)
        .values(val)
        .onConflictDoUpdate({ target: customers.id, set: { ...val, id: undefined } })
      break
    }

    case 'order_lines': {
      const val = {
        id: item.recordId,
        orderId: String(payload.orderId ?? ''),
        productId: payload.productId != null ? String(payload.productId) : null,
        description: payload.description != null ? String(payload.description) : null,
        quantity: String(payload.quantity ?? '0'),
        unitPrice: String(payload.unitPrice ?? '0'),
        unitPriceCurrency: String(payload.unitPriceCurrency ?? 'GHS'),
        discountAmount: String(payload.discountAmount ?? '0'),
        lineTotal: String(payload.lineTotal ?? '0'),
        updatedAt: new Date(),
      }
      await db
        .insert(orderLines)
        .values(val)
        .onConflictDoUpdate({ target: orderLines.id, set: { ...val, id: undefined } })
      break
    }

    case 'inventory_transactions': {
      const val = {
        id: item.recordId,
        businessId,
        productId: String(payload.productId ?? ''),
        transactionType: String(payload.transactionType ?? 'sale'),
        quantity: String(payload.quantity ?? '0'),
        unitCost: String(payload.unitCost ?? '0'),
        referenceId: payload.referenceId != null ? String(payload.referenceId) : null,
        transactionDate: String(payload.transactionDate ?? ''),
        updatedAt: new Date(),
      }
      await db
        .insert(inventoryTransactions)
        .values(val)
        .onConflictDoUpdate({ target: inventoryTransactions.id, set: { ...val, id: undefined } })
      break
    }

    case 'orders': {
      // Orders without deferred journals are already-approved (synced online path mirrored)
      const val = buildOrderValues(item.recordId, businessId, payload)
      await db
        .insert(orders)
        .values(val)
        .onConflictDoUpdate({ target: orders.id, set: { ...val, id: undefined } })
      break
    }

    case 'expenses': {
      const val = buildExpenseValues(item.recordId, businessId, userId, payload)
      await db
        .insert(expenses)
        .values(val)
        .onConflictDoUpdate({ target: expenses.id, set: { ...val, id: undefined } })
      break
    }
  }
}

// ─── Journal-promoted upsert ──────────────────────────────────────────────────

async function processWithJournal(
  item: SyncPushItem,
  businessId: string,
  userId: string,
  deferredJournal: NonNullable<SyncPushItem['deferredJournal']>,
): Promise<string> {
  const { proposedEntry } = deferredJournal

  // Resolve account codes → UUIDs for this business
  const neededCodes = [...new Set(proposedEntry.lines.map((l) => l.accountCode))]
  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, neededCodes)))

  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))

  for (const code of neededCodes) {
    if (!accountMap[code]) {
      throw new Error(`Account ${code} not found for business`)
    }
  }

  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: proposedEntry.entryDate,
    description: proposedEntry.description,
    sourceType: proposedEntry.sourceType,
    sourceId: item.recordId,
    createdBy: userId,
    lines: proposedEntry.lines.map((l) => ({
      accountId: accountMap[l.accountCode],
      debitAmount: l.debitAmount,
      creditAmount: l.creditAmount,
      currency: l.currency,
      fxRate: l.fxRate !== 1 ? l.fxRate : undefined,
    })),
  }

  const journalEntryId = await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    const payload = item.payload

    if (item.tableName === 'orders') {
      const val = buildOrderValues(item.recordId, businessId, payload, journalEntryId)
      await tx
        .insert(orders)
        .values(val)
        .onConflictDoUpdate({ target: orders.id, set: { ...val, id: undefined } })
    } else if (item.tableName === 'expenses') {
      const expenseAccountCode =
        proposedEntry.lines.find((l) => l.debitAmount > 0 && l.accountCode !== '1101')
          ?.accountCode ?? '6009'
      const accountId = accountMap[expenseAccountCode] ?? ''
      const val = buildExpenseValues(
        item.recordId,
        businessId,
        userId,
        payload,
        journalEntryId,
        accountId,
      )
      await tx
        .insert(expenses)
        .values(val)
        .onConflictDoUpdate({ target: expenses.id, set: { ...val, id: undefined } })
    }

    return journalEntryId
  })

  return journalEntryId
}

// ─── Value builders ───────────────────────────────────────────────────────────

function buildOrderValues(
  id: string,
  businessId: string,
  payload: Record<string, unknown>,
  journalEntryId?: string,
) {
  return {
    id,
    businessId,
    orderNumber: String(payload.orderNumber ?? ''),
    localOrderNumber: payload.localOrderNumber != null ? String(payload.localOrderNumber) : null,
    customerId: payload.customerId != null ? String(payload.customerId) : null,
    orderDate: String(payload.orderDate ?? ''),
    status: String(payload.status ?? 'fulfilled'),
    paymentStatus: String(payload.paymentStatus ?? 'paid'),
    subtotal: payload.subtotal != null ? String(payload.subtotal) : null,
    discountAmount: payload.discountAmount != null ? String(payload.discountAmount) : null,
    taxAmount: payload.taxAmount != null ? String(payload.taxAmount) : null,
    totalAmount: payload.totalAmount != null ? String(payload.totalAmount) : null,
    amountPaid: String(payload.amountPaid ?? '0'),
    paymentMethod: payload.paymentMethod != null ? String(payload.paymentMethod) : null,
    fxRate: payload.fxRate != null ? String(payload.fxRate) : null,
    notes: payload.notes != null ? String(payload.notes) : null,
    journalEntryId: journalEntryId ?? null,
    aiGenerated: Boolean(payload.aiGenerated ?? false),
    updatedAt: new Date(),
  }
}

function buildExpenseValues(
  id: string,
  businessId: string,
  userId: string,
  payload: Record<string, unknown>,
  journalEntryId?: string,
  resolvedAccountId?: string,
) {
  return {
    id,
    businessId,
    expenseDate: String(payload.expenseDate ?? ''),
    category: payload.category != null ? String(payload.category) : null,
    accountId: resolvedAccountId ?? String(payload.accountId ?? ''),
    amount: String(payload.amount ?? '0'),
    paymentMethod: String(payload.paymentMethod ?? 'cash'),
    description: String(payload.description ?? ''),
    receiptUrl: payload.receiptUrl != null ? String(payload.receiptUrl) : null,
    isCapitalExpense: Boolean(payload.isCapitalExpense ?? false),
    approvalStatus: String(payload.approvalStatus ?? 'pending_approval'),
    journalEntryId: journalEntryId ?? null,
    aiGenerated: Boolean(payload.aiGenerated ?? false),
    createdBy: userId,
    updatedAt: new Date(),
  }
}
