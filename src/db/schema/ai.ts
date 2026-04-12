import { pgTable, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { businesses, users } from './core'

export const pendingAiActions = pgTable('pending_ai_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  sessionId: uuid('session_id'),
  userId: uuid('user_id').references(() => users.id),
  actionType: text('action_type').notNull(),
  proposedData: jsonb('proposed_data').notNull(),
  humanReadable: text('human_readable').notNull(),
  status: text('status').default('pending').notNull(),
  // pending | confirmed | rejected | expired
  confirmedAt: timestamp('confirmed_at'),
  rejectedAt: timestamp('rejected_at'),
  expiresAt: timestamp('expires_at').notNull(),
  resultId: uuid('result_id'),
  resultTable: text('result_table'),
  // Reversal tracking — set when an owner/manager reverses a confirmed action
  reversedAt: timestamp('reversed_at'),
  reversedBy: uuid('reversed_by').references(() => users.id),
  reversalReason: text('reversal_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const aiConversationLogs = pgTable('ai_conversation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id),
  userId: uuid('user_id').references(() => users.id),
  sessionId: uuid('session_id'),
  userMessage: text('user_message').notNull(),
  aiResponse: text('ai_response'),
  toolCalls: jsonb('tool_calls'),
  actionsTaken: jsonb('actions_taken'),
  requiresReview: boolean('requires_review').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
