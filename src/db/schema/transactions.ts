import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  numeric,
  timestamp,
  integer,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { businesses, users } from './core'
import { journalEntries } from './journal'
import { accounts } from './accounts'

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  location: text('location'),
  momoNumber: text('momo_number'),
  creditLimit: numeric('credit_limit', { precision: 15, scale: 2 }).default('0').notNull(),
  paymentTermsDays: integer('payment_terms_days').default(30).notNull(),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  orderNumber: text('order_number').notNull(),
  // Server-assigned sequential number e.g. ORD-0001
  localOrderNumber: text('local_order_number'),
  // Offline-generated number e.g. ORD-A3F2-0001 — retained for traceability
  customerId: uuid('customer_id').references(() => customers.id),
  orderDate: date('order_date').notNull(),
  status: text('status').notNull(),
  // draft | confirmed | fulfilled | cancelled
  paymentStatus: text('payment_status').notNull(),
  // unpaid | partial | paid
  discountType: text('discount_type'),
  discountValue: numeric('discount_value', { precision: 15, scale: 2 }),
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }),
  discountAmount: numeric('discount_amount', { precision: 15, scale: 2 }),
  taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }),
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }),
  amountPaid: numeric('amount_paid', { precision: 15, scale: 2 }).default('0').notNull(),
  fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
  fxRateLockedAt: timestamp('fx_rate_locked_at'),
  notes: text('notes'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  productId: uuid('product_id'),
  // soft ref to products — nullable for custom/service line items
  description: text('description'),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).notNull(),
  unitPriceCurrency: text('unit_price_currency').default('GHS').notNull(),
  discountAmount: numeric('discount_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  lineTotal: numeric('line_total', { precision: 15, scale: 2 }).notNull(),
  // always stored in GHS regardless of unitPriceCurrency
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const paymentsReceived = pgTable('payments_received', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  orderId: uuid('order_id').references(() => orders.id),
  customerId: uuid('customer_id').references(() => customers.id),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  // cash | momo_mtn | momo_telecel | momo_airtel | bank | other
  paymentDate: date('payment_date').notNull(),
  momoReference: text('momo_reference'),
  bankReference: text('bank_reference'),
  notes: text('notes'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  expenseDate: date('expense_date').notNull(),
  category: text('category'),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  supplierId: uuid('supplier_id'),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  description: text('description').notNull(),
  receiptUrl: text('receipt_url'),
  isRecurring: boolean('is_recurring').default(false).notNull(),
  recurrenceRule: text('recurrence_rule'),
  parentExpenseId: uuid('parent_expense_id').references((): AnyPgColumn => expenses.id),
  approvalStatus: text('approval_status').default('approved').notNull(),
  // pending_approval | approved | rejected
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  isCapitalExpense: boolean('is_capital_expense').default(false).notNull(),
  includesVat: boolean('includes_vat').default(false).notNull(),
  notes: text('notes'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  aiGenerated: boolean('ai_generated').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const expenseBudgets = pgTable('expense_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  category: text('category').notNull(),
  monthlyBudget: numeric('monthly_budget', { precision: 15, scale: 2 }).notNull(),
  alertThreshold: numeric('alert_threshold', { precision: 5, scale: 2 }).default('0.80'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
