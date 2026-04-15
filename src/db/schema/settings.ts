import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { businesses } from './core'

export const businessSettings = pgTable(
  'business_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    // Inventory behaviour
    allowNegativeStock: boolean('allow_negative_stock').default(false).notNull(),
    lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
    // Sales defaults
    defaultPaymentTermsDays: integer('default_payment_terms_days').default(0).notNull(),
    defaultCreditLimit: numeric('default_credit_limit', { precision: 15, scale: 2 })
      .default('0')
      .notNull(),
    // Invoice customisation
    invoiceFooterText: text('invoice_footer_text'),
    // Mobile Money account references
    momoMtnNumber: text('momo_mtn_number'),
    momoTelecelNumber: text('momo_telecel_number'),
    momoAirtelNumber: text('momo_airtel_number'),
    // WhatsApp notification preferences
    whatsappBusinessNumber: text('whatsapp_business_number'),
    whatsappNotifyInvoice: boolean('whatsapp_notify_invoice').default(false).notNull(),
    whatsappNotifyPayment: boolean('whatsapp_notify_payment').default(false).notNull(),
    whatsappNotifyLowStock: boolean('whatsapp_notify_low_stock').default(false).notNull(),
    whatsappNotifyOverdue: boolean('whatsapp_notify_overdue').default(false).notNull(),
    whatsappNotifyPayroll: boolean('whatsapp_notify_payroll').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('business_settings_business_id_idx').on(table.businessId)],
)
