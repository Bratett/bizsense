import { pgTable, uuid, text, boolean, timestamp, jsonb, date } from 'drizzle-orm/pg-core'

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  industry: text('industry'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  logoUrl: text('logo_url'),
  baseCurrency: text('base_currency').default('GHS').notNull(),
  vatRegistered: boolean('vat_registered').default(false).notNull(),
  vatNumber: text('vat_number'),
  tin: text('tin'),
  ssnitNumber: text('ssnit_number'),
  seededAccountIds: jsonb('seeded_account_ids'),
  openingBalanceDate: date('opening_balance_date'),
  financialYearStart: text('financial_year_start'),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // matches Supabase auth.users id
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  fullName: text('full_name'),
  phone: text('phone'),
  role: text('role').notNull(), // owner | manager | cashier | accountant
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
