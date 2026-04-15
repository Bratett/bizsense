import { normaliseGhanaPhone } from './normalise'

export type WhatsAppLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid_phone' | 'no_phone' }

/**
 * Build a wa.me deep link pre-populated with a message.
 * Returns a result object — never throws.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): WhatsAppLinkResult {
  if (!phone) return { ok: false, reason: 'no_phone' }

  const normalised = normaliseGhanaPhone(phone)
  if (!normalised) return { ok: false, reason: 'invalid_phone' }

  const encoded = encodeURIComponent(message.trim())
  return { ok: true, url: `https://wa.me/${normalised}?text=${encoded}` }
}

/**
 * Open a WhatsApp link in a new tab (client-side only).
 * Call this from a Client Component onClick handler.
 */
export function openWhatsApp(
  phone: string | null | undefined,
  message: string,
  onInvalidPhone?: () => void,
): void {
  const result = buildWhatsAppLink(phone, message)
  if (!result.ok) {
    onInvalidPhone?.()
    return
  }
  window.open(result.url, '_blank', 'noopener,noreferrer')
}
