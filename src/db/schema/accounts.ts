import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { businesses } from './core'

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  // asset | liability | equity | revenue | expense | cogs
  subtype: text('subtype'),
  parentId: uuid('parent_id'),
  isSystem: boolean('is_system').default(false).notNull(),
  currency: text('currency').default('GHS').notNull(),
  cashFlowActivity: text('cash_flow_activity'),
  // operating | investing | financing | none
  // REQUIRED on all accounts — used by Cash Flow Statement query
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
