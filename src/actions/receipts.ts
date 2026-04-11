'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { expenses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── Types ───────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const STORAGE_BUCKET = 'receipts'

type UploadReceiptInput = {
  expenseId: string
  fileBase64: string
  mimeType: string
  fileExtension: string
}

type UploadResult =
  | { success: true; path: string; signedUrl: string }
  | { success: false; error: string }

type SignedUrlResult = { success: true; signedUrl: string } | { success: false; error: string }

type DeleteResult = { success: true } | { success: false; error: string }

// ─── Upload Receipt ──────────────────────────────────────────────────────────

export async function uploadReceipt(input: UploadReceiptInput): Promise<UploadResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Validate expense belongs to this business
  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, input.expenseId), eq(expenses.businessId, businessId)))

  if (!expense) {
    return { success: false, error: 'Expense not found' }
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMimeType)) {
    return { success: false, error: 'Invalid file type. Accepted: JPEG, PNG, WebP' }
  }

  // Decode base64 → Buffer
  const buffer = Buffer.from(input.fileBase64, 'base64')

  // Enforce 5MB limit on decoded bytes
  if (buffer.length > MAX_FILE_BYTES) {
    return { success: false, error: 'File too large. Maximum size is 5MB' }
  }

  // Build storage path: receipts/{businessId}/{YYYY}/{MM}/{expenseId}.{ext}
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const ext = MIME_TO_EXT[input.mimeType as AllowedMimeType] ?? input.fileExtension
  const storagePath = `${STORAGE_BUCKET}/${businessId}/${year}/${month}/${input.expenseId}.${ext}`

  // Upload to Supabase Storage
  const supabase = await createSupabaseServerClient()
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: input.mimeType,
      upsert: true,
    })

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` }
  }

  // Generate 365-day signed URL for immediate viewing
  const { data: signedData, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 365 * 24 * 60 * 60)

  if (signError || !signedData?.signedUrl) {
    return { success: false, error: `Failed to create signed URL: ${signError?.message}` }
  }

  // Store the path (not the signed URL) on the expense record
  await db
    .update(expenses)
    .set({ receiptUrl: storagePath, updatedAt: now })
    .where(eq(expenses.id, input.expenseId))

  return { success: true, path: storagePath, signedUrl: signedData.signedUrl }
}

// ─── Get Receipt Signed URL ──────────────────────────────────────────────────

export async function getReceiptSignedUrl(expenseId: string): Promise<SignedUrlResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [expense] = await db
    .select({ receiptUrl: expenses.receiptUrl })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))

  if (!expense) {
    return { success: false, error: 'Expense not found' }
  }

  if (!expense.receiptUrl) {
    return { success: false, error: 'No receipt attached' }
  }

  const supabase = await createSupabaseServerClient()
  const { data: signedData, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(expense.receiptUrl, 3600) // 1-hour expiry for viewing

  if (signError || !signedData?.signedUrl) {
    return { success: false, error: `Failed to create signed URL: ${signError?.message}` }
  }

  return { success: true, signedUrl: signedData.signedUrl }
}

// ─── Delete Receipt ──────────────────────────────────────────────────────────

export async function deleteReceipt(expenseId: string): Promise<DeleteResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [expense] = await db
    .select({ receiptUrl: expenses.receiptUrl })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))

  if (!expense) {
    return { success: false, error: 'Expense not found' }
  }

  if (!expense.receiptUrl) {
    return { success: false, error: 'No receipt to delete' }
  }

  const supabase = await createSupabaseServerClient()
  const { error: removeError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([expense.receiptUrl])

  if (removeError) {
    return { success: false, error: `Failed to delete receipt: ${removeError.message}` }
  }

  await db
    .update(expenses)
    .set({ receiptUrl: null, updatedAt: new Date() })
    .where(eq(expenses.id, expenseId))

  return { success: true }
}
