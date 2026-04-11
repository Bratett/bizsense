import { pgTable, uuid, text, numeric, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { businesses } from './core'

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: numeric('rate', { precision: 10, scale: 4 }).notNull(),
    rateDate: date('rate_date').notNull(),
    source: text('source').notNull(), // manual | api
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('fx_rates_biz_currency_date_idx').on(
      table.businessId,
      table.fromCurrency,
      table.toCurrency,
      table.rateDate,
    ),
  ],
)
