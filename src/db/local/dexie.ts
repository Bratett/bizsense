// BROWSER ONLY — do not import in server-side code
import Dexie, { type Table } from 'dexie'

// ── Type definitions aligned to Supabase schema ───────────────────────────
// These are the subset of fields needed for offline reads and writes.
// Not all Supabase columns need to be in Dexie — only those used offline.

export interface DexieBusiness {
  id: string
  name: string
  vatRegistered: boolean
  vatNumber: string | null
  tin: string | null
  baseCurrency: string
  financialYearStart: number
}

export interface DexieAccount {
  id: string
  businessId: string
  code: string
  name: string
  type: string
  subtype: string | null
  cashFlowActivity: string | null
  isSystem: boolean
}

export interface DexieTaxComponent {
  id: string
  businessId: string
  name: string
  code: string
  rate: number
  calculationOrder: number
  isCompounded: boolean
  appliesTo: string
  isActive: boolean
}

export interface DexieJournalEntry {
  id: string
  businessId: string
  entryDate: string
  reference: string | null
  description: string | null
  sourceType: string
  sourceId: string | null
  aiGenerated: boolean
  syncStatus: 'synced' | 'pending' | 'failed'
  updatedAt: string
}

export interface DexieJournalLine {
  id: string
  journalEntryId: string
  accountId: string
  debitAmount: number
  creditAmount: number
  currency: string
  fxRate: number
  memo: string | null
}

export interface DexieCustomer {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  location: string | null
  momoNumber: string | null
  creditLimit: number
  paymentTermsDays: number
  isActive: boolean
  syncStatus: 'synced' | 'pending' | 'failed'
  updatedAt: string
}

export interface DexieOrder {
  id: string
  businessId: string
  orderNumber: string
  localOrderNumber: string | null
  customerId: string | null
  orderDate: string
  status: string
  paymentStatus: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  amountPaid: number
  paymentMethod: string | null
  fxRate: number | null
  notes: string | null
  journalEntryId: string | null
  aiGenerated: boolean
  syncStatus: 'synced' | 'pending' | 'failed'
  updatedAt: string
}

export interface DexieOrderLine {
  id: string
  orderId: string
  productId: string | null
  description: string
  quantity: number
  unitPrice: number
  unitPriceCurrency: string
  discountAmount: number
  lineTotal: number
}

export interface DexieExpense {
  id: string
  businessId: string
  expenseDate: string
  category: string | null
  accountId: string | null
  amount: number
  paymentMethod: string | null
  description: string
  receiptUrl: string | null
  isCapitalExpense: boolean
  approvalStatus: string
  journalEntryId: string | null
  aiGenerated: boolean
  syncStatus: 'synced' | 'pending' | 'failed'
  updatedAt: string
}

export interface DexieProduct {
  id: string
  businessId: string
  sku: string | null
  name: string
  category: string | null
  unit: string | null
  costPrice: number
  sellingPrice: number
  sellingPriceUsd: number | null
  trackInventory: boolean
  reorderLevel: number
  isActive: boolean
  updatedAt: string
}

export interface DexieInventoryTransaction {
  id: string
  businessId: string
  productId: string
  transactionType: string
  quantity: number
  unitCost: number
  referenceId: string | null
  transactionDate: string
  updatedAt: string
}

export interface DexieSupplier {
  id: string
  businessId: string
  name: string
  phone: string | null
  isActive: boolean
  updatedAt: string
}

export interface DexieFxRate {
  id: string
  businessId: string
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: string
}

// Deferred journal marker — written offline when a real journal entry
// cannot be posted immediately. The sync processor promotes these to
// real journal entries via Drizzle atomic writes.
export interface DexieDeferredJournal {
  id: string // local UUID
  businessId: string
  sourceTable: string // 'orders' | 'expenses'
  sourceId: string // Dexie record ID of the source
  proposedEntry: {
    // enough data to reconstruct the journal entry
    entryDate: string
    description: string
    sourceType: string
    lines: Array<{
      accountCode: string // use code, not UUID — UUID unknown before sync
      debitAmount: number
      creditAmount: number
      currency: string
      fxRate: number
    }>
  }
  status: 'pending' | 'promoted' | 'failed'
  createdAt: string
}

export interface DexieSyncQueueItem {
  id?: number // auto-increment primary key
  tableName: string
  recordId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> // the full record to upsert
  createdAt: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  attempts: number
  lastError: string | null
}

export interface DexieMeta {
  key: string
  value: string | number
}

export interface DexieHubtelPaymentLink {
  id: string
  businessId: string
  orderId: string
  clientReference: string
  checkoutUrl: string | null
  amount: number
  status: string // 'pending' | 'paid' | 'expired' | 'cancelled'
  expiresAt: string | null // ISO timestamp string — Dexie indexes strings, not Dates
  paidAt: string | null
  momoReference: string | null
  createdAt: string
}

export interface DexieBusinessSettings {
  id: string
  businessId: string
  allowNegativeStock: boolean
  lowStockThreshold: number
  defaultPaymentTermsDays: number
  defaultCreditLimit: number // server sends numeric as string — parse with Number() at usage site
  invoiceFooterText: string | null
  momoMtnNumber: string | null
  momoTelecelNumber: string | null
  momoAirtelNumber: string | null
  whatsappBusinessNumber: string | null
  whatsappNotifyInvoice: boolean
  whatsappNotifyPayment: boolean
  whatsappNotifyLowStock: boolean
  whatsappNotifyOverdue: boolean
  whatsappNotifyPayroll: boolean
  updatedAt: string
}

// ── Dexie database class ────────────────────────────────────────────────────

class BizSenseLocalDb extends Dexie {
  businesses!: Table<DexieBusiness>
  businessSettings!: Table<DexieBusinessSettings>
  accounts!: Table<DexieAccount>
  taxComponents!: Table<DexieTaxComponent>
  journalEntries!: Table<DexieJournalEntry>
  journalLines!: Table<DexieJournalLine>
  customers!: Table<DexieCustomer>
  orders!: Table<DexieOrder>
  orderLines!: Table<DexieOrderLine>
  expenses!: Table<DexieExpense>
  products!: Table<DexieProduct>
  inventoryTransactions!: Table<DexieInventoryTransaction>
  suppliers!: Table<DexieSupplier>
  fxRates!: Table<DexieFxRate>
  deferredJournals!: Table<DexieDeferredJournal>
  syncQueue!: Table<DexieSyncQueueItem>
  meta!: Table<DexieMeta>
  hubtelPaymentLinks!: Table<DexieHubtelPaymentLink>

  constructor() {
    super('bizsense')

    this.version(1).stores({
      businesses: 'id, name',
      accounts: 'id, businessId, code, type',
      taxComponents: 'id, businessId, code, calculationOrder, isActive',
      journalEntries: 'id, businessId, entryDate, sourceType, syncStatus, [businessId+entryDate]',
      journalLines: 'id, journalEntryId, accountId',
      customers: 'id, businessId, phone, name, isActive, syncStatus',
      orders: 'id, businessId, customerId, orderDate, status, paymentStatus, syncStatus',
      orderLines: 'id, orderId, productId',
      expenses: 'id, businessId, expenseDate, category, approvalStatus, syncStatus',
      products: 'id, businessId, sku, name, category, isActive',
      inventoryTransactions: 'id, businessId, productId, transactionDate',
      suppliers: 'id, businessId, name, isActive',
      fxRates: 'id, businessId, fromCurrency, rateDate',
      deferredJournals: 'id, businessId, sourceTable, sourceId, status',
      syncQueue: '++id, tableName, recordId, operation, status, createdAt',
      meta: 'key',
    })

    // Version 2: add compound index [businessId+paymentStatus] on orders
    // for efficient tab filtering (unpaid, partial) without a full table scan.
    this.version(2).stores({
      orders:
        'id, businessId, customerId, orderDate, status, paymentStatus, syncStatus, [businessId+paymentStatus]',
    })

    // Version 3: add business_settings table for Sprint 12 configurable preferences.
    // One row per business, synced server→client via /api/sync/pull.
    this.version(3).stores({
      businessSettings: 'id, businessId',
    })

    // Version 4: add hubtelPaymentLinks table for Sprint 10 MoMo payment links.
    // Mirrors server-side hubtel_payment_links for offline status checks.
    this.version(4).stores({
      hubtelPaymentLinks: 'id, businessId, orderId, clientReference, status',
    })
  }
}

export const localDb = new BizSenseLocalDb()

// ── Sequence number helpers ─────────────────────────────────────────────────

export async function nextLocalSequence(key: string): Promise<number> {
  const current = await localDb.meta.get(key)
  const next = ((current?.value as number) ?? 0) + 1
  await localDb.meta.put({ key, value: next })
  return next
}

export async function getDevicePrefix(): Promise<string> {
  const stored = await localDb.meta.get('devicePrefix')
  if (stored) return stored.value as string
  const prefix = Math.random().toString(36).slice(2, 6).toUpperCase()
  await localDb.meta.put({ key: 'devicePrefix', value: prefix })
  return prefix
}
