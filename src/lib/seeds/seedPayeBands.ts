import { and, eq, isNull } from 'drizzle-orm'
import { payeBands } from '@/db/schema'
import type { DrizzleTransaction } from '@/lib/ledger'

type PayeBandSeed = {
  lowerBound: string
  upperBound: string | null
  rate: string
}

// Ghana GRA 2024 annual PAYE schedule
// Thresholds are annual amounts in GHS.
// computeMonthlyPaye() annualises the monthly gross before applying these bands.
// Update effectiveTo on existing rows and insert new rows when GRA revises rates.
const DEFAULT_PAYE_BANDS: PayeBandSeed[] = [
  { lowerBound: '0', upperBound: '4380', rate: '0.000000' },
  { lowerBound: '4380', upperBound: '5100', rate: '0.050000' },
  { lowerBound: '5100', upperBound: '6420', rate: '0.100000' },
  { lowerBound: '6420', upperBound: '47880', rate: '0.175000' },
  { lowerBound: '47880', upperBound: '240000', rate: '0.250000' },
  { lowerBound: '240000', upperBound: null, rate: '0.300000' },
]

/**
 * Seeds the default GRA PAYE bands for a new business.
 *
 * Called once inside a Drizzle transaction during onboarding Step 1.
 * Idempotent — if active bands already exist for this business, does nothing.
 */
export async function seedPayeBands(tx: DrizzleTransaction, businessId: string): Promise<void> {
  // Check idempotency — if any active (effectiveTo IS NULL) bands exist, skip
  const existing = await tx
    .select({ id: payeBands.id })
    .from(payeBands)
    .where(and(eq(payeBands.businessId, businessId), isNull(payeBands.effectiveTo)))
    .limit(1)

  if (existing.length > 0) return

  await tx.insert(payeBands).values(
    DEFAULT_PAYE_BANDS.map((band) => ({
      businessId,
      lowerBound: band.lowerBound,
      upperBound: band.upperBound,
      rate: band.rate,
      effectiveFrom: '2024-01-01',
      effectiveTo: null,
    })),
  )
}
