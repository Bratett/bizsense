import { pgTable, uuid, text, date, boolean, numeric, timestamp } from 'drizzle-orm/pg-core'
import { businesses, users } from './core'
import { accounts } from './accounts'

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  entryDate: date('entry_date').notNull(),
  reference: text('reference'),
  description: text('description'),
  sourceType: text('source_type').notNull(),
  // order | expense | payment | payroll | manual | ai_recorded | reversal | opening_balance | depreciation | grn
  sourceId: uuid('source_id'),
  reversalOf: uuid('reversal_of'), // FK to journal_entries.id if this is a reversal
  createdBy: uuid('created_by').references(() => users.id),
  aiGenerated: boolean('ai_generated').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalEntryId: uuid('journal_entry_id')
    .notNull()
    .references(() => journalEntries.id),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  debitAmount: numeric('debit_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  creditAmount: numeric('credit_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  currency: text('currency').default('GHS').notNull(),
  fxRate: numeric('fx_rate', { precision: 10, scale: 4 }).default('1').notNull(),
  // LOCKED at transaction time — never derived retrospectively from fx_rates table
  fxRateLockedAt: timestamp('fx_rate_locked_at'),
  memo: text('memo'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
