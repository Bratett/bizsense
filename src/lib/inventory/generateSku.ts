/**
 * Generate a SKU from a product name and existing SKUs.
 *
 * Algorithm:
 * 1. Extract first 3 consonants from the name (uppercase), pad with 'X' if fewer
 * 2. Find the next available sequence number for that prefix
 * 3. Return PREFIX-NNN (e.g. "RCB-001")
 */
export function generateSku(
  productName: string,
  existingSkus: string[],
): string {
  const consonants = productName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/[AEIOU]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X')

  const prefix = consonants
  const existing = existingSkus.filter((s) => s.startsWith(`${prefix}-`))
  const next = existing.length + 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}
