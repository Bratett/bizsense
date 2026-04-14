// BROWSER ONLY — uses the Supabase browser client for Realtime subscriptions.
// Do not import in Server Actions or API routes.

import { createBrowserClient } from '@supabase/ssr'
import { localDb } from '@/db/local/dexie'
import type { DexieOrder, DexieExpense, DexieCustomer } from '@/db/local/dexie'

// Single channel reference — prevents duplicate subscriptions across re-renders.
let realtimeChannel: ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null = null

// ── Map functions: snake_case Postgres payload → camelCase Dexie record ───────
// Realtime payloads arrive as plain JSON with snake_case column names.

function mapServerOrderToDexie(r: Record<string, unknown>): DexieOrder {
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    orderNumber: r['order_number'] as string,
    localOrderNumber: (r['local_order_number'] as string | null) ?? null,
    customerId: (r['customer_id'] as string | null) ?? null,
    orderDate: r['order_date'] as string,
    status: r['status'] as string,
    paymentStatus: r['payment_status'] as string,
    subtotal: Number(r['subtotal'] ?? 0),
    discountAmount: Number(r['discount_amount'] ?? 0),
    taxAmount: Number(r['tax_amount'] ?? 0),
    totalAmount: Number(r['total_amount'] ?? 0),
    amountPaid: Number(r['amount_paid'] ?? 0),
    paymentMethod: (r['payment_method'] as string | null) ?? null,
    fxRate: r['fx_rate'] != null ? Number(r['fx_rate']) : null,
    notes: (r['notes'] as string | null) ?? null,
    journalEntryId: (r['journal_entry_id'] as string | null) ?? null,
    aiGenerated: Boolean(r['ai_generated']),
    syncStatus: 'synced',
    updatedAt: r['updated_at'] as string,
  }
}

function mapServerExpenseToDexie(r: Record<string, unknown>): DexieExpense {
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    expenseDate: r['expense_date'] as string,
    category: (r['category'] as string | null) ?? null,
    accountId: (r['account_id'] as string | null) ?? null,
    amount: Number(r['amount'] ?? 0),
    paymentMethod: (r['payment_method'] as string | null) ?? null,
    description: r['description'] as string,
    receiptUrl: (r['receipt_url'] as string | null) ?? null,
    isCapitalExpense: Boolean(r['is_capital_expense']),
    approvalStatus: r['approval_status'] as string,
    journalEntryId: (r['journal_entry_id'] as string | null) ?? null,
    aiGenerated: Boolean(r['ai_generated']),
    syncStatus: 'synced',
    updatedAt: r['updated_at'] as string,
  }
}

function mapServerCustomerToDexie(r: Record<string, unknown>): DexieCustomer {
  return {
    id: r['id'] as string,
    businessId: r['business_id'] as string,
    name: r['name'] as string,
    phone: (r['phone'] as string) ?? '',
    email: (r['email'] as string | null) ?? null,
    location: (r['location'] as string | null) ?? null,
    momoNumber: (r['momo_number'] as string | null) ?? null,
    creditLimit: Number(r['credit_limit'] ?? 0),
    paymentTermsDays: Number(r['payment_terms_days'] ?? 0),
    isActive: Boolean(r['is_active'] ?? true),
    syncStatus: 'synced',
    updatedAt: r['updated_at'] as string,
  }
}

// ── Subscription ──────────────────────────────────────────────────────────────

export function startRealtimeSubscription(businessId: string): void {
  if (realtimeChannel) return // already subscribed

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  realtimeChannel = supabase
    .channel(`business:${businessId}`)

    // ── Orders ──────────────────────────────────────────────────────────────
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${businessId}`,
      },
      async (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
        const record = payload.new as Record<string, unknown>
        const local = await localDb.orders.get(record['id'] as string)
        const serverTime = record['updated_at']
          ? new Date(record['updated_at'] as string).getTime()
          : 0
        const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0
        // Skip if local pending write is newer — it hasn't synced yet
        if (local?.syncStatus === 'pending') return
        if (!local || serverTime > localTime) {
          await localDb.orders.put(mapServerOrderToDexie(record))
        }
      },
    )

    // ── Expenses ─────────────────────────────────────────────────────────────
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'expenses',
        filter: `business_id=eq.${businessId}`,
      },
      async (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
        const record = payload.new as Record<string, unknown>
        const local = await localDb.expenses.get(record['id'] as string)
        const serverTime = record['updated_at']
          ? new Date(record['updated_at'] as string).getTime()
          : 0
        const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0
        if (local?.syncStatus === 'pending') return
        if (!local || serverTime > localTime) {
          await localDb.expenses.put(mapServerExpenseToDexie(record))
        }
      },
    )

    // ── Customers ────────────────────────────────────────────────────────────
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'customers',
        filter: `business_id=eq.${businessId}`,
      },
      async (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
        const record = payload.new as Record<string, unknown>
        const local = await localDb.customers.get(record['id'] as string)
        // Don't overwrite a locally-pending customer creation with stale server data
        if (local?.syncStatus === 'pending') return
        await localDb.customers.put(mapServerCustomerToDexie(record))
      },
    )

    .subscribe()
}

export function stopRealtimeSubscription(): void {
  realtimeChannel?.unsubscribe()
  realtimeChannel = null
}
