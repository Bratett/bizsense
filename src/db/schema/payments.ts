import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core'
import { businesses } from './core'
import { orders } from './transactions'
import { paymentsReceived } from './transactions'

// ─── hubtel_payment_links ─────────────────────────────────────────────────────
//
// Tracks every Hubtel MoMo checkout link generated for an invoice.
// The clientReference stored here is the idempotency key used to look up
// businessId when Hubtel's webhook arrives — it is never trusted from the
// webhook payload itself.

export const hubtelPaymentLinks = pgTable('hubtel_payment_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),

  // Our generated reference — the lookup key on webhook arrival.
  // Format: BSG-{businessId[0..8]}-{orderId[0..8]}-{timestamp_base36}
  // Must be globally unique (Hubtel requires unique ClientReference per merchant).
  clientReference: text('client_reference').notNull().unique(),

  hubtelCheckoutId: text('hubtel_checkout_id'), // returned by Hubtel on creation
  checkoutUrl: text('checkout_url'), // the URL sent to customer

  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('GHS').notNull(),

  customerPhone: text('customer_phone'),
  customerName: text('customer_name'),

  // pending | paid | expired | cancelled
  status: text('status').notNull().default('pending'),

  expiresAt: timestamp('expires_at'), // 24 hours from creation
  paidAt: timestamp('paid_at'),

  momoNetwork: text('momo_network'), // MTN | VODAFONE | AIRTELTIGO (raw from Hubtel)
  momoReference: text('momo_reference'), // Hubtel's transaction reference

  // Set when the webhook auto-records the payment_received row
  resultPaymentReceived: uuid('result_payment_received').references(() => paymentsReceived.id),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── hubtel_webhook_events ────────────────────────────────────────────────────
//
// Idempotency log. One record is written per unique clientReference BEFORE
// any payment processing begins. The unique constraint on clientReference
// is the gate that prevents duplicate payments if Hubtel retries delivery.
//
// Flow:
//   1. Webhook arrives → INSERT here (unique constraint fires on duplicate)
//   2. Process payment atomically
//   3. UPDATE status → 'processed'
//
// If step 2 fails: status stays 'failed', error is recorded for investigation.

export const hubtelWebhookEvents = pgTable('hubtel_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Unique constraint enforces exactly-once processing.
  clientReference: text('client_reference').notNull().unique(),

  rawPayload: text('raw_payload').notNull(), // full JSON body from Hubtel
  status: text('status').notNull().default('received'), // received | processed | failed
  processedAt: timestamp('processed_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── momo_reconciliation_snapshots ───────────────────────────────────────────
//
// Optional history of manual reconciliation checks. One row per "Save Snapshot"
// action. The lines column is a JSON-serialised array of per-account readings,
// stored as text to avoid introducing a jsonb import dependency.
//
// Not a financial transaction — no journal entry required.

export const momoReconciliationSnapshots = pgTable('momo_reconciliation_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  snapshotDate: text('snapshot_date').notNull(), // ISO "YYYY-MM-DD"
  lines: text('lines').notNull(), // JSON: {accountCode, bookBalance, actualBalance, variance}[]
  totalBookBalance: numeric('total_book_balance', { precision: 15, scale: 2 }).notNull(),
  totalActualBalance: numeric('total_actual_balance', { precision: 15, scale: 2 }).notNull(),
  netVariance: numeric('net_variance', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
