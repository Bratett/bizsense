// ─── Hubtel MoMo Webhook Handler ─────────────────────────────────────────────
//
// SECURITY CRITICAL — read before editing:
//
// 1. businessId is NEVER read from the webhook payload.
//    It is resolved by looking up the clientReference in hubtelPaymentLinks.
//    The webhook payload is untrusted input — only the DB record is trusted.
//
// 2. Idempotency is enforced by the unique constraint on
//    hubtel_webhook_events.client_reference.
//    We INSERT before processing. A duplicate INSERT (Postgres code 23505)
//    means we already processed this webhook — return 200 immediately.
//
// 3. Payment + journal entry are written inside atomicTransactionWrite.
//    If the DB write fails, the webhook event is marked 'failed' for manual
//    investigation. We return 200 regardless — returning 5xx would cause Hubtel
//    to retry, which would hit the idempotency gate and re-attempt, wasting
//    resources and creating noise in the integrity log.
//
// 4. The HMAC-SHA512 signature is verified on the raw body BEFORE any DB access.

import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  hubtelPaymentLinks,
  hubtelWebhookEvents,
  orders,
  paymentsReceived,
  accounts,
} from '@/db/schema'
import { atomicTransactionWrite } from '@/lib/atomic'
import { verifyHubtelWebhookSignature, HUBTEL_SIGNATURE_HEADER } from '@/lib/hubtel/client'
import type { PostJournalEntryInput } from '@/lib/ledger'

// ─── Hubtel payload shape ─────────────────────────────────────────────────────

interface HubtelWebhookPayload {
  ResponseCode: string // '0000' = success
  Status: string // 'Success'
  ClientReference: string
  Data?: {
    ClientReference?: string
    Amount?: number
    Currency?: string
    CustomerPhoneNumber?: string
    TransactionId?: string // Hubtel's MoMo transaction reference
    Network?: string // 'MTN' | 'VODAFONE' | 'AIRTELTIGO'
    Description?: string
    PaymentType?: string
  }
}

// ─── Payment method mapping ───────────────────────────────────────────────────
// Aligned with the existing payments.ts account codes and method names.
// MTN → momo_mtn (account 1002)
// VODAFONE (Telecel Ghana, formerly Vodafone) → momo_telecel (account 1003)
// AIRTELTIGO → momo_airtel (account 1004)

const NETWORK_TO_PAYMENT_METHOD: Record<string, string> = {
  MTN: 'momo_mtn',
  VODAFONE: 'momo_telecel',
  AIRTELTIGO: 'momo_airtel',
}

const PAYMENT_ACCOUNT_CODES: Record<string, string> = {
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
}

const AR_ACCOUNT_CODE = '1100'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isUniqueConstraintError(err: unknown): boolean {
  // PostgreSQL unique_violation error code
  return (err as { code?: string }).code === '23505'
}

async function markWebhookFailed(clientReference: string, error: string): Promise<void> {
  try {
    await db
      .update(hubtelWebhookEvents)
      .set({ status: 'failed', error, processedAt: new Date() })
      .where(eq(hubtelWebhookEvents.clientReference, clientReference))
  } catch {
    // Best-effort — don't mask the original error
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Read raw body (must happen before any other body access) ─────────────
  const rawBody = await request.text()
  const signature = request.headers.get(HUBTEL_SIGNATURE_HEADER)

  // ── 2. Verify Hubtel HMAC signature ─────────────────────────────────────────
  let isValid: boolean
  try {
    isValid = verifyHubtelWebhookSignature(rawBody, signature)
  } catch (err) {
    // verifyHubtelWebhookSignature throws in production when HUBTEL_WEBHOOK_SECRET is unset
    console.error('[Hubtel webhook] Signature verification error:', err)
    return NextResponse.json(null, { status: 500 })
  }

  if (!isValid) {
    // Do not reveal why — don't help attackers tune their forgeries
    return NextResponse.json(null, { status: 401 })
  }

  // ── 3. Parse payload ─────────────────────────────────────────────────────────
  let payload: HubtelWebhookPayload
  try {
    payload = JSON.parse(rawBody) as HubtelWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 4. Only process successful payment events ────────────────────────────────
  if (payload.ResponseCode !== '0000' || payload.Status !== 'Success') {
    // Non-payment events (pending, failed, etc.) — log and ack so Hubtel doesn't retry
    console.log('[Hubtel webhook] Non-success event:', payload.ResponseCode, payload.Status)
    return NextResponse.json({ received: true })
  }

  const clientReference = payload.ClientReference ?? payload.Data?.ClientReference
  if (!clientReference) {
    return NextResponse.json({ error: 'Missing ClientReference' }, { status: 400 })
  }

  // ── 5. Idempotency gate: insert webhook event BEFORE processing ──────────────
  // If a duplicate webhook arrives, the unique constraint on clientReference
  // fires and we return 200 immediately with no DB writes.
  try {
    await db.insert(hubtelWebhookEvents).values({
      clientReference,
      rawPayload: rawBody,
      status: 'received',
    })
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      console.log('[Hubtel webhook] Duplicate event ignored:', clientReference)
      return NextResponse.json({ received: true })
    }
    throw err // unexpected DB error — let it propagate to the error handler
  }

  // ── 6. Resolve businessId from our DB — NEVER from the payload ──────────────
  const [link] = await db
    .select()
    .from(hubtelPaymentLinks)
    .where(eq(hubtelPaymentLinks.clientReference, clientReference))

  if (!link) {
    await markWebhookFailed(clientReference, 'ClientReference not found in hubtel_payment_links')
    console.warn('[Hubtel webhook] Unknown clientReference:', clientReference)
    return NextResponse.json({ received: true })
  }

  // businessId is authoritative from our own DB record — never from payload
  const businessId = link.businessId

  // ── 7. Fetch the order ───────────────────────────────────────────────────────
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalAmount: orders.totalAmount,
      amountPaid: orders.amountPaid,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, link.orderId), eq(orders.businessId, businessId)))

  if (!order) {
    await markWebhookFailed(clientReference, `Order ${link.orderId} not found`)
    return NextResponse.json({ received: true })
  }

  // ── 8. Compute payment amounts ───────────────────────────────────────────────
  const paymentAmount = Number(payload.Data?.Amount ?? link.amount)
  const newAmountPaid =
    Math.round((Number(order.amountPaid) + paymentAmount) * 100) / 100
  const newPaymentStatus =
    newAmountPaid >= Number(order.totalAmount) - 0.001 ? 'paid' : 'partial'

  // ── 9. Map Hubtel network code to our payment method ────────────────────────
  const network = (payload.Data?.Network ?? '').toUpperCase()
  const paymentMethod = NETWORK_TO_PAYMENT_METHOD[network] ?? 'momo_mtn'
  const paymentAccountCode = PAYMENT_ACCOUNT_CODES[paymentMethod] ?? '1002'

  // ── 10. Resolve GL account IDs ───────────────────────────────────────────────
  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(
      and(
        eq(accounts.businessId, businessId),
        inArray(accounts.code, [paymentAccountCode, AR_ACCOUNT_CODE]),
      ),
    )
  const accountMap = Object.fromEntries(accountRows.map((a) => [a.code, a.id]))

  const paymentAccountId = accountMap[paymentAccountCode]
  const arAccountId = accountMap[AR_ACCOUNT_CODE]

  if (!paymentAccountId || !arAccountId) {
    const missing = [
      !paymentAccountId ? paymentAccountCode : null,
      !arAccountId ? AR_ACCOUNT_CODE : null,
    ]
      .filter(Boolean)
      .join(', ')
    await markWebhookFailed(
      clientReference,
      `Required accounts not found: ${missing} for businessId ${businessId}`,
    )
    return NextResponse.json({ received: true })
  }

  // ── 11. Pre-generate payment UUID (needed as sourceId in journal entry) ──────
  const paymentId = crypto.randomUUID()
  const today = new Date().toISOString().split('T')[0]
  const momoReference = payload.Data?.TransactionId ?? null
  const momoNetwork = payload.Data?.Network ?? null

  // ── 12. Build journal entry ──────────────────────────────────────────────────
  // Dr MoMo account (cash in) / Cr Accounts Receivable (AR cleared)
  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: today,
    reference: order.orderNumber,
    description: `MoMo payment received — ${order.orderNumber}`,
    sourceType: 'payment',
    sourceId: paymentId,
    lines: [
      {
        accountId: paymentAccountId,
        debitAmount: paymentAmount,
        creditAmount: 0,
        currency: 'GHS',
        fxRate: 1,
        memo: `Hubtel MoMo — ${momoReference ?? clientReference}`,
      },
      {
        accountId: arAccountId,
        debitAmount: 0,
        creditAmount: paymentAmount,
        currency: 'GHS',
        fxRate: 1,
        memo: `AR cleared — ${order.orderNumber}`,
      },
    ],
  }

  // ── 13. Atomic write: payment_received + journal + order update ───────────────
  // Uses atomicTransactionWrite per CLAUDE.md §4.2.
  // On failure: mark event as 'failed', return 200 (don't trigger Hubtel retry).
  try {
    await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
      // Insert payment_received record.
      // customerId from order — NOT from hubtelPaymentLinks (no such column) and
      // NEVER from the webhook payload.
      await tx.insert(paymentsReceived).values({
        id: paymentId,
        businessId,
        orderId: link.orderId,
        customerId: order.customerId ?? null,
        amount: paymentAmount.toFixed(2),
        paymentMethod,
        paymentDate: today,
        momoReference,
        notes: `Auto-recorded via Hubtel webhook. Checkout ID: ${link.hubtelCheckoutId ?? 'unknown'}`,
        journalEntryId,
      })

      // Update order payment status
      await tx
        .update(orders)
        .set({
          amountPaid: newAmountPaid.toFixed(2),
          paymentStatus: newPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, link.orderId))

      // Update the payment link record
      await tx
        .update(hubtelPaymentLinks)
        .set({
          status: 'paid',
          paidAt: new Date(),
          momoNetwork,
          momoReference,
          resultPaymentReceived: paymentId,
          updatedAt: new Date(),
        })
        .where(eq(hubtelPaymentLinks.id, link.id))

      return paymentId
    })
  } catch (err) {
    await markWebhookFailed(
      clientReference,
      err instanceof Error ? err.message : 'Unknown error during atomic write',
    )
    console.error('[Hubtel webhook] Atomic write failed for', clientReference, err)
    // Return 200 — we've recorded the failure for investigation.
    // A 5xx response would cause Hubtel to retry, which would hit the idempotency
    // gate and skip processing again, creating noise without resolving the root cause.
    return NextResponse.json({ received: true })
  }

  // ── 14. Mark webhook event as successfully processed ─────────────────────────
  await db
    .update(hubtelWebhookEvents)
    .set({ status: 'processed', processedAt: new Date() })
    .where(eq(hubtelWebhookEvents.clientReference, clientReference))

  return NextResponse.json({ received: true })
}
