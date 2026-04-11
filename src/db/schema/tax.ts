import { pgTable, uuid, text, boolean, integer, numeric, timestamp } from 'drizzle-orm/pg-core'
import { businesses } from './core'
import { accounts } from './accounts'

export const taxComponents = pgTable('tax_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  calculationOrder: integer('calculation_order').notNull(),
  isCompounded: boolean('is_compounded').default(false).notNull(),
  // if true: this tax's base = supply amount + sum of all lower-order taxes
  appliesTo: text('applies_to').default('standard').notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  isActive: boolean('is_active').default(true).notNull(),
  effectiveFrom: timestamp('effective_from').notNull(),
  effectiveTo: timestamp('effective_to'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
