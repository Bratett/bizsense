import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { businesses, users } from './core'

export const ledgerIntegrityLog = pgTable('ledger_integrity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  sourceTable: text('source_table').notNull(),
  sourceId: uuid('source_id').notNull(),
  issue: text('issue').notNull(),
  // missing_journal_entry | debit_credit_mismatch
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
