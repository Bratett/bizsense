import { pgTable, uuid, text, boolean, numeric, date, timestamp } from 'drizzle-orm/pg-core'
import { businesses, users } from './core'
import { journalEntries } from './journal'

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  userId: uuid('user_id').references(() => users.id),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  roleTitle: text('role_title'),
  salaryType: text('salary_type'), // monthly | daily | hourly
  baseSalary: numeric('base_salary', { precision: 15, scale: 2 }),
  ssnitNumber: text('ssnit_number'),
  tin: text('tin'),
  bankName: text('bank_name'),
  bankAccount: text('bank_account'),
  momoNumber: text('momo_number'),
  startDate: date('start_date'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const payrollRuns = pgTable('payroll_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: text('status').notNull(), // draft | approved | paid
  totalGross: numeric('total_gross', { precision: 15, scale: 2 }),
  totalDeductions: numeric('total_deductions', { precision: 15, scale: 2 }),
  totalNet: numeric('total_net', { precision: 15, scale: 2 }),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const payrollLines = pgTable('payroll_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  payrollRunId: uuid('payroll_run_id')
    .notNull()
    .references(() => payrollRuns.id),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  grossSalary: numeric('gross_salary', { precision: 15, scale: 2 }).notNull(),
  ssnitEmployee: numeric('ssnit_employee', { precision: 15, scale: 2 }).notNull(),
  ssnitEmployer: numeric('ssnit_employer', { precision: 15, scale: 2 }).notNull(),
  payeTax: numeric('paye_tax', { precision: 15, scale: 2 }).notNull(),
  otherDeductions: numeric('other_deductions', { precision: 15, scale: 2 }).default('0').notNull(),
  netSalary: numeric('net_salary', { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text('payment_method'),
  paymentReference: text('payment_reference'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
