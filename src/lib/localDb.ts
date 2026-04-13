import Dexie from 'dexie'

class BizSenseDb extends Dexie {
  businesses!: Dexie.Table
  accounts!: Dexie.Table
  taxComponents!: Dexie.Table
  journalEntries!: Dexie.Table
  journalLines!: Dexie.Table
  customers!: Dexie.Table
  orders!: Dexie.Table
  orderLines!: Dexie.Table
  paymentsReceived!: Dexie.Table
  expenses!: Dexie.Table
  suppliers!: Dexie.Table
  products!: Dexie.Table
  inventoryTransactions!: Dexie.Table
  purchaseOrders!: Dexie.Table
  purchaseOrderLines!: Dexie.Table
  goodsReceivedNotes!: Dexie.Table
  grnLines!: Dexie.Table
  fixedAssets!: Dexie.Table
  staff!: Dexie.Table
  payrollRuns!: Dexie.Table
  payrollLines!: Dexie.Table
  fxRates!: Dexie.Table
  pendingAiActions!: Dexie.Table
  supplierPayments!: Dexie.Table
  supplierInvoices!: Dexie.Table
  stocktakes!: Dexie.Table
  stocktakeLines!: Dexie.Table
  syncQueue!: Dexie.Table
  aiConversationLogs!: Dexie.Table
  ledgerIntegrityLog!: Dexie.Table
  meta!: Dexie.Table

  constructor() {
    super('bizsense')
    this.version(1).stores({
      businesses: 'id, name',
      accounts: 'id, business_id, code, type, cash_flow_activity',
      taxComponents: 'id, business_id, code, calculation_order, is_active',
      journalEntries: 'id, business_id, entry_date, source_type, [business_id+entry_date]',
      journalLines: 'id, journal_entry_id, account_id',
      customers: 'id, business_id, phone, name',
      orders: 'id, business_id, customer_id, order_date, status, payment_status',
      orderLines: 'id, order_id, product_id',
      paymentsReceived: 'id, business_id, order_id, customer_id, payment_date',
      expenses: 'id, business_id, expense_date, category',
      suppliers: 'id, business_id, name',
      products: 'id, business_id, sku, name, category',
      inventoryTransactions: 'id, business_id, product_id, transaction_date',
      purchaseOrders: 'id, business_id, supplier_id, order_date, status',
      purchaseOrderLines: 'id, po_id, product_id',
      goodsReceivedNotes: 'id, business_id, po_id, supplier_id, received_date, status',
      grnLines: 'id, grn_id, product_id',
      fixedAssets: 'id, business_id, category, is_active',
      staff: 'id, business_id',
      payrollRuns: 'id, business_id, period_start, period_end, status',
      payrollLines: 'id, payroll_run_id, staff_id',
      fxRates: 'id, business_id, rate_date, from_currency',
      pendingAiActions: 'id, business_id, session_id, status, created_at',
      syncQueue: '++id, table_name, record_id, operation, created_at, status',
      aiConversationLogs: 'id, business_id, created_at',
      ledgerIntegrityLog: 'id, business_id, source_table, source_id, resolved_at',
    })
    this.version(2).stores({
      meta: 'key',
    })
    this.version(3).stores({
      supplierPayments: 'id, business_id, supplier_id, grn_id, payment_date',
    })
    this.version(4).stores({
      stocktakes: 'id, business_id, status, created_at',
      stocktakeLines: 'id, stocktake_id, product_id',
    })
    this.version(5).stores({
      supplierInvoices: 'id, business_id, supplier_id, grn_id, invoice_date, status',
      supplierPayments: 'id, business_id, supplier_id, grn_id, supplier_invoice_id, payment_date',
    })
  }
}

export const localDb = new BizSenseDb()
