import { calculateTax } from '@/lib/tax'

/**
 * Reverse-calculates VAT from a gross (VAT-inclusive) amount.
 *
 * Uses calculateTax with a probe amount to extract the effective rate,
 * then divides gross by (1 + effectiveRate) to get the net amount.
 *
 * This avoids duplicating the tax component stacking logic and automatically
 * adapts when Ghana's GRA changes levy rates.
 */
export async function reverseCalculateVat(
  businessId: string,
  grossAmount: number,
): Promise<{ netAmount: number; vatAmount: number; effectiveRate: number }> {
  // Probe with a known amount to extract the effective rate
  const probe = await calculateTax(businessId, 1000)

  if (probe.effectiveRate === 0) {
    return { netAmount: grossAmount, vatAmount: 0, effectiveRate: 0 }
  }

  const netAmount = Math.round((grossAmount / (1 + probe.effectiveRate)) * 100) / 100
  const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100

  return { netAmount, vatAmount, effectiveRate: probe.effectiveRate }
}
