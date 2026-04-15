import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
} from 'drizzle-orm/pg-core'
import { businesses, users } from './core'
import { journalEntries } from './journal'
import { accounts } from './accounts'

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  location: text('location'),
  momoNumber: text('momo_number'),
  bankName: text('bank_name'),
  bankAccount: text('bank_account'),
  creditTermsDays: integer('credit_terms_days').default(0).notNull(),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  sku: text('sku'),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  unit: text('unit'),
  costPrice: numeric('cost_price', { precision: 15, scale: 2 }),
  sellingPrice: numeric('selling_price', { precision: 15, scale: 2 }),
  sellingPriceUsd: numeric('selling_price_usd', { precision: 15, scale: 4 }),
  trackInventory: boolean('track_inventory').default(true).notNull(),
  reorderLevel: integer('reorder_level').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const inventoryTransactions = pgTable('inventory_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  transactionType: text('transaction_type').notNull(),
  // purchase | sale | adjustment | opening | return_in | return_out
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  // positive = stock in, negative = stock out
  unitCost: numeric('unit_cost', { precision: 15, scale: 2 }).notNull(),
  referenceId: uuid('reference_id'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  transactionDate: date('transaction_date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  poNumber: text('po_number').notNull(),
  localPoNumber: text('local_po_number'),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  orderDate: date('order_date').notNull(),
  expectedDate: date('expected_date'),
  status: text('status').notNull(),
  // draft | sent | partially_received | received | cancelled
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }),
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }),
  currency: text('currency').default('GHS').notNull(),
  fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
  fxRateLockedAt: timestamp('fx_rate_locked_at'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  poId: uuid('po_id')
    .notNull()
    .references(() => purchaseOrders.id),
  productId: uuid('product_id').references(() => products.id),
  description: text('description'),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 15, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const goodsReceivedNotes = pgTable('goods_received_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  grnNumber: text('grn_number').notNull(),
  localGrnNumber: text('local_grn_number'),
  poId: uuid('po_id').references(() => purchaseOrders.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  receivedDate: date('received_date').notNull(),
  status: text('status').notNull(), // draft | confirmed
  totalCost: numeric('total_cost', { precision: 15, scale: 2 }),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const grnLines = pgTable('grn_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  grnId: uuid('grn_id')
    .notNull()
    .references(() => goodsReceivedNotes.id),
  poLineId: uuid('po_line_id').references(() => purchaseOrderLines.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  quantityOrdered: numeric('quantity_ordered', { precision: 10, scale: 2 }),
  quantityReceived: numeric('quantity_received', { precision: 10, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 15, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const fixedAssets = pgTable('fixed_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  category: text('category'),
  purchaseDate: date('purchase_date').notNull(),
  purchaseCost: numeric('purchase_cost', { precision: 15, scale: 2 }).notNull(),
  usefulLifeMonths: integer('useful_life_months').notNull(),
  residualValue: numeric('residual_value', { precision: 15, scale: 2 }).default('0').notNull(),
  depreciationMethod: text('depreciation_method').default('straight_line').notNull(),
  accumulatedDepreciation: numeric('accumulated_depreciation', { precision: 15, scale: 2 })
    .default('0')
    .notNull(),
  assetAccountId: uuid('asset_account_id').references(() => accounts.id),
  depreciationAccountId: uuid('depreciation_account_id').references(() => accounts.id),
  accDepreciationAccountId: uuid('acc_depreciation_account_id').references(() => accounts.id),
  isActive: boolean('is_active').default(true).notNull(),
  disposalDate: date('disposal_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Stocktaking ─────────────────────────────────────────────────────────────

export const stocktakes = pgTable('stocktakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  status: text('status').notNull(), // in_progress | confirmed | cancelled
  initiatedAt: timestamp('initiated_at').defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at'),
  initiatedBy: uuid('initiated_by').references(() => users.id),
  confirmedBy: uuid('confirmed_by').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const stocktakeLines = pgTable('stocktake_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  stocktakeId: uuid('stocktake_id')
    .notNull()
    .references(() => stocktakes.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  expectedQuantity: numeric('expected_quantity', { precision: 10, scale: 2 }).notNull(),
  countedQuantity: numeric('counted_quantity', { precision: 10, scale: 2 }),
  varianceQuantity: numeric('variance_quantity', { precision: 10, scale: 2 }),
  varianceValue: numeric('variance_value', { precision: 15, scale: 2 }),
  adjustmentPosted: boolean('adjustment_posted').default(false).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Supplier Invoices ───────────────────────────────────────────────────────

export const supplierInvoices = pgTable('supplier_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  grnId: uuid('grn_id').references(() => goodsReceivedNotes.id),
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date').notNull(),
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
  status: text('status').notNull(),
  // draft | approved | paid | cancelled
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Supplier Payments ────────────────────────────────────────────────────────

export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  grnId: uuid('grn_id').references(() => goodsReceivedNotes.id),
  // optional — links payment to a specific GRN; null = unallocated (FIFO on aging)
  supplierInvoiceId: uuid('supplier_invoice_id').references(() => supplierInvoices.id),
  // optional — links payment to a supplier invoice; mutually exclusive with grnId
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  // cash | momo_mtn | momo_telecel | momo_airtel | bank
  paymentDate: date('payment_date').notNull(),
  momoReference: text('momo_reference'),
  bankReference: text('bank_reference'),
  notes: text('notes'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
