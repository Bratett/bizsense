'use server'

import { db } from '@/db'
import { userFeedback } from '@/db/schema'
import { getServerSession } from '@/lib/session'

export type FeedbackType = 'bug' | 'suggestion' | 'confusion'

export interface SubmitFeedbackInput {
  type: FeedbackType
  message: string
  route: string
}

export type FeedbackResult = { success: true } | { success: false; error: string }

export async function submitFeedback(input: SubmitFeedbackInput): Promise<FeedbackResult> {
  const session = await getServerSession()
  const { id: userId, businessId } = session.user

  if (!input.type || !['bug', 'suggestion', 'confusion'].includes(input.type)) {
    return { success: false, error: 'Invalid feedback type' }
  }

  if (!input.message || input.message.trim().length < 10) {
    return { success: false, error: 'Message must be at least 10 characters' }
  }

  await db.insert(userFeedback).values({
    businessId,
    userId,
    type: input.type,
    message: input.message.trim(),
    route: input.route || null,
  })

  return { success: true }
}
