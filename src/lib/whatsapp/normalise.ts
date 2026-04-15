/**
 * Normalise a Ghana phone number to E.164 format without the '+' prefix.
 * wa.me links require the number without '+'.
 *
 * Input examples:
 *   0244123456   → 233244123456
 *   +233244123456 → 233244123456
 *   233244123456 → 233244123456
 *   0201234567   → 233201234567
 *
 * Returns null if the number cannot be normalised (invalid format).
 */
export function normaliseGhanaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '') // strip all non-digits

  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1)
  if (digits.length === 9) return '233' + digits

  return null // unrecognised format
}
