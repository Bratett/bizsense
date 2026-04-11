import { eq } from 'drizzle-orm'
import { taxComponents } from '@/db/schema'
import type { DrizzleTransaction } from '@/lib/ledger'

type TaxComponentSeed = {
  code: string
  name: string
  rate: string
  calculationOrder: number
  isCompounded: boolean
  appliesTo: string
}

export const DEFAULT_TAX_COMPONENTS: TaxComponentSeed[] = [
  {
    code: 'NHIL',
    name: 'National Health Insurance Levy',
    rate: '0.0250',
    calculationOrder: 1,
    isCompounded: false,
    appliesTo: 'standard',
  },
  {
    code: 'GETFUND',
    name: 'GETFund Levy',
    rate: '0.0250',
    calculationOrder: 2,
    isCompounded: false,
    appliesTo: 'standard',
  },
  {
    code: 'COVID',
    name: 'COVID-19 Levy',
    rate: '0.0100',
    calculationOrder: 3,
    isCompounded: false,
    appliesTo: 'standard',
  },
  {
    code: 'VAT',
    name: 'Value Added Tax',
    rate: '0.1500',
    calculationOrder: 4,
    isCompounded: true,
    appliesTo: 'standard',
  },
]

/**
 * Seeds Ghana's GRA levy structure for a VAT-registered business.
 *
 * Called inside a Drizzle transaction during onboarding Step 1 (only if
 * vatRegistered = true). Idempotent — existing components (matched by
 * businessId + code) are skipped.
 *
 * @param vatAccountId - ID of account 2100 (VAT Payable). All tax components
 *   credit this account. Obtain from the SeededAccounts map returned by
 *   seedChartOfAccounts.
 * @param effectiveFrom - The date from which these tax components are effective.
 */
export async function seedTaxComponents(
  tx: DrizzleTransaction,
  businessId: string,
  vatAccountId: string,
  effectiveFrom: Date,
): Promise<void> {
  const existing = await tx
    .select({ code: taxComponents.code })
    .from(taxComponents)
    .where(eq(taxComponents.businessId, businessId))

  const existingCodes = new Set(existing.map((r) => r.code))

  const toInsert = DEFAULT_TAX_COMPONENTS.filter((c) => !existingCodes.has(c.code))

  if (toInsert.length === 0) return

  await tx.insert(taxComponents).values(
    toInsert.map((c) => ({
      businessId,
      name: c.name,
      code: c.code,
      rate: c.rate,
      calculationOrder: c.calculationOrder,
      isCompounded: c.isCompounded,
      appliesTo: c.appliesTo,
      accountId: vatAccountId,
      isActive: true,
      effectiveFrom,
    })),
  )
}
