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

export const syncConflicts = pgTable('sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  localValue: jsonb('local_value').notNull(),
  serverValue: jsonb('server_value').notNull(),
  conflictedAt: timestamp('conflicted_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  resolution: text('resolution'), // 'server_kept' | 'manually_corrected'
  notes: text('notes'),
})

export const userInvitations = pgTable('user_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  email: text('email').notNull(),
  role: text('role').notNull(), // manager | cashier | accountant
  token: text('token').notNull().unique(),
  invitedBy: uuid('invited_by').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow(),
})
