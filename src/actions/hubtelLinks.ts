'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { hubtelPaymentLinks, orders, customers } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { createHubtelCheckout } from '@/lib/hubtel/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingMomoLink = {
  id: string
  checkoutUrl: string | null
  amount: string
  status: string
  expiresAt: Date | null
  paidAt: Date | null
  momoReference: string | null
}

// ─── generatePaymentLink ──────────────────────────────────────────────────────

/**
 * Generate a Hubtel MoMo checkout link for an unpaid or partially paid order.
 *
 * Security:
 *  - businessId comes from the server-side session, never from the caller.
 *  - DB record is only written AFTER the Hubtel API call succeeds (no orphans).
 */
export async function generatePaymentLink(orderId: string): Promise<{
  checkoutUrl: string
  clientReference: string
  linkId: string
}> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Fetch and validate the order (tenant-scoped)
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalAmount: orders.totalAmount,
      amountPaid: orders.amountPaid,
      customerId: orders.customerId,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.businessId, businessId)))

  if (!order) throw new Error('Order not found')
  if (order.status !== 'fulfilled') {
    throw new Error('Only fulfilled orders can receive a payment link.')
  }
  if (order.paymentStatus === 'paid') {
    throw new Error('This invoice is already fully paid.')
  }

  const outstanding = Math.round((Number(order.totalAmount) - Number(order.amountPaid)) * 100) / 100

  if (outstanding <= 0) throw new Error('No outstanding balance on this invoice.')

  // Fetch customer details for personalisation (optional — order may be walk-in)
  let customerPhone: string | undefined
  let customerName: string | undefined
  if (order.customerId) {
    const [customer] = await db
      .select({ name: customers.name, phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, order.customerId))
    customerPhone = customer?.phone ?? undefined
    customerName = customer?.name ?? undefined
  }

  // Build a globally unique ClientReference.
  // Format: BSG-{businessId[0..8]}-{orderId[0..8]}-{timestamp_base36}
  // The UUID slices are already hex without dashes at positions 0..7.
  const clientReference = [
    'BSG',
    businessId.replace(/-/g, '').slice(0, 8).toUpperCase(),
    orderId.replace(/-/g, '').slice(0, 8).toUpperCase(),
    Date.now().toString(36).toUpperCase(),
  ].join('-')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bizsense.app'

  // Call Hubtel — throws on any API error.
  // DB record is NOT written until this succeeds (no orphan records).
  const hubtelResult = await createHubtelCheckout({
    clientReference,
    amount: outstanding,
    currency: 'GHS',
    customerPhone,
    customerName,
    description: `Payment for ${order.orderNumber}`,
    callbackUrl: `${appUrl}/api/webhooks/hubtel`,
    returnUrl: `${appUrl}/orders/${orderId}?payment=success`,
    cancellationUrl: `${appUrl}/orders/${orderId}?payment=cancelled`,
  })

  // Persist the payment link record
  const [link] = await db
    .insert(hubtelPaymentLinks)
    .values({
      businessId,
      orderId,
      clientReference,
      hubtelCheckoutId: hubtelResult.checkoutId,
      checkoutUrl: hubtelResult.checkoutUrl,
      amount: outstanding.toFixed(2),
      currency: 'GHS',
      customerPhone: customerPhone ?? null,
      customerName: customerName ?? null,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })
    .returning()

  return {
    checkoutUrl: hubtelResult.checkoutUrl,
    clientReference: link.clientReference,
    linkId: link.id,
  }
}

// ─── getPaymentLinkStatus ─────────────────────────────────────────────────────

/**
 * Poll the current status of a Hubtel payment link.
 * Tenant-scoped — requires businessId match.
 */
export async function getPaymentLinkStatus(linkId: string): Promise<{
  status: string
  paidAt: Date | null
  momoReference: string | null
}> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [link] = await db
    .select({
      status: hubtelPaymentLinks.status,
      paidAt: hubtelPaymentLinks.paidAt,
      momoReference: hubtelPaymentLinks.momoReference,
    })
    .from(hubtelPaymentLinks)
    .where(and(eq(hubtelPaymentLinks.id, linkId), eq(hubtelPaymentLinks.businessId, businessId)))

  if (!link) throw new Error('Payment link not found')

  return { status: link.status, paidAt: link.paidAt, momoReference: link.momoReference }
}

// ─── getPendingMomoLinkForOrder ───────────────────────────────────────────────

/**
 * Fetch the most recent active (pending or paid) Hubtel payment link for an order.
 * Returns null if no link has been generated yet, or all links have expired/cancelled.
 */
export async function getPendingMomoLinkForOrder(orderId: string): Promise<PendingMomoLink | null> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .select({
      id: hubtelPaymentLinks.id,
      checkoutUrl: hubtelPaymentLinks.checkoutUrl,
      amount: hubtelPaymentLinks.amount,
      status: hubtelPaymentLinks.status,
      expiresAt: hubtelPaymentLinks.expiresAt,
      paidAt: hubtelPaymentLinks.paidAt,
      momoReference: hubtelPaymentLinks.momoReference,
    })
    .from(hubtelPaymentLinks)
    .where(
      and(
        eq(hubtelPaymentLinks.orderId, orderId),
        eq(hubtelPaymentLinks.businessId, businessId),
        inArray(hubtelPaymentLinks.status, ['pending', 'paid']),
      ),
    )
    .orderBy(desc(hubtelPaymentLinks.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    checkoutUrl: row.checkoutUrl,
    amount: row.amount,
    status: row.status,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt,
    momoReference: row.momoReference,
  }
}
