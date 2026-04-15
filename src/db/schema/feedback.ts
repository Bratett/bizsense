import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { businesses, users } from './core'

export const userFeedback = pgTable('user_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  userId: uuid('user_id').references(() => users.id),
  type: text('type').notNull(), // 'bug' | 'suggestion' | 'confusion'
  message: text('message').notNull(),
  route: text('route'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
