// SERVER-SIDE ONLY — never import in .client.tsx files or browser-rendered code.
// This module reads process.env credentials and uses Node.js crypto.

import crypto from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────────────

// Hubtel's webhook signature header (lowercase — Next.js normalises header names)
export const HUBTEL_SIGNATURE_HEADER = 'x-hubtel-signature'

const HUBTEL_SANDBOX_URL = 'https://payproxyapi.hubtel.com/items/initiate'
const HUBTEL_PRODUCTION_URL = 'https://payproxyapi.hubtel.com/items/initiate'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HubtelCheckoutParams {
  clientReference: string
  amount: number
  currency: string
  customerPhone?: string
  customerName?: string
  description: string
  callbackUrl: string
  returnUrl?: string
  cancellationUrl?: string
}

export interface HubtelCheckoutResult {
  checkoutId: string
  checkoutUrl: string
}

// ─── createHubtelCheckout ─────────────────────────────────────────────────────

/**
 * Initiate a Hubtel MoMo payment checkout session.
 * Returns the checkoutId and the URL to send to the customer.
 *
 * Throws if:
 *  - HUBTEL_CLIENT_ID or HUBTEL_CLIENT_SECRET is not set
 *  - The Hubtel API returns a non-2xx response
 *  - The Hubtel API returns a non-success response code
 */
export async function createHubtelCheckout(
  params: HubtelCheckoutParams,
): Promise<HubtelCheckoutResult> {
  const clientId = process.env.HUBTEL_CLIENT_ID
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET
  const merchantAccountNumber = process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER

  if (!clientId || !clientSecret) {
    throw new Error(
      'Hubtel credentials not configured. Set HUBTEL_CLIENT_ID and HUBTEL_CLIENT_SECRET in environment variables.',
    )
  }

  // HTTP Basic Auth: base64(clientId:clientSecret)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const baseUrl =
    process.env.HUBTEL_ENV === 'production' ? HUBTEL_PRODUCTION_URL : HUBTEL_SANDBOX_URL

  const body: Record<string, unknown> = {
    MerchantAccountNumber: merchantAccountNumber,
    ReturnUrl: params.returnUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/orders`,
    CancellationUrl: params.cancellationUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/orders`,
    ClientReference: params.clientReference,
    Description: params.description,
    TotalAmount: params.amount,
    Currency: params.currency,
    CallbackUrl: params.callbackUrl,
  }

  if (params.customerPhone) {
    body.CustomerPhoneNumber = params.customerPhone
    body.CustomerName = params.customerName ?? 'Customer'
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Hubtel API error ${response.status}: ${text}`)
  }

  const json = (await response.json()) as {
    ResponseCode?: string
    status?: string
    Data?: { CheckoutId?: string; CheckoutUrl?: string }
    message?: string
  }

  if (json.ResponseCode !== '0000' || !json.Data) {
    throw new Error(`Hubtel rejected the request: ${json.message ?? JSON.stringify(json)}`)
  }

  const checkoutId = json.Data.CheckoutId
  const checkoutUrl = json.Data.CheckoutUrl

  if (!checkoutId || !checkoutUrl) {
    throw new Error('Hubtel response missing CheckoutId or CheckoutUrl')
  }

  return { checkoutId, checkoutUrl }
}

// ─── verifyHubtelWebhookSignature ─────────────────────────────────────────────

/**
 * Verify that an incoming webhook request is genuinely from Hubtel.
 * Hubtel signs requests with HMAC-SHA512 over the raw request body.
 *
 * Security rules:
 *  - In production: HUBTEL_WEBHOOK_SECRET MUST be set — throws if missing.
 *  - In non-production (sandbox/dev): skips verification if secret not set.
 *  - Uses constant-time comparison to prevent timing attacks.
 *
 * @param rawBody   The raw request body string (from request.text())
 * @param signature The value of the x-hubtel-signature header (or null)
 * @returns true if signature is valid, false otherwise
 */
export function verifyHubtelWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.HUBTEL_WEBHOOK_SECRET

  if (!secret) {
    if (process.env.HUBTEL_ENV === 'production') {
      // A missing webhook secret in production is a configuration error, not
      // a graceful skip — it means every incoming request would be accepted.
      throw new Error(
        'HUBTEL_WEBHOOK_SECRET is not set. This is required in production to verify webhook authenticity.',
      )
    }
    // Non-production: skip verification (Hubtel sandbox may not send signatures)
    console.warn(
      '[Hubtel] HUBTEL_WEBHOOK_SECRET not set — signature verification skipped (non-production)',
    )
    return true
  }

  if (!signature) return false

  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')

  // Guard against length mismatch — timingSafeEqual throws on different buffer lengths
  if (signature.length !== expected.length) return false

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    // Buffer.from('hex') throws on invalid hex strings — treat as invalid signature
    return false
  }
}
