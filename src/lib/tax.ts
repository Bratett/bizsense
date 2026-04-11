import { and, asc, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, taxComponents } from '@/db/schema'

export type TaxBreakdown = {
  componentCode: string
  componentName: string
  baseAmount: number
  rate: number
  taxAmount: number
}

export type TaxCalculationResult = {
  supplyAmount: number
  breakdown: TaxBreakdown[]
  totalTaxAmount: number
  totalAmount: number
  effectiveRate: number
}

export async function calculateTax(
  businessId: string,
  supplyAmount: number,
  appliesTo: string = 'standard',
): Promise<TaxCalculationResult> {
  const zeroTax: TaxCalculationResult = {
    supplyAmount,
    breakdown: [],
    totalTaxAmount: 0,
    totalAmount: supplyAmount,
    effectiveRate: 0,
  }

  const [business] = await db
    .select({ vatRegistered: businesses.vatRegistered })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  if (!business?.vatRegistered) {
    return zeroTax
  }

  const now = new Date()

  const components = await db
    .select()
    .from(taxComponents)
    .where(
      and(
        eq(taxComponents.businessId, businessId),
        eq(taxComponents.appliesTo, appliesTo),
        eq(taxComponents.isActive, true),
        or(isNull(taxComponents.effectiveTo), gt(taxComponents.effectiveTo, now)),
      ),
    )
    .orderBy(asc(taxComponents.calculationOrder))

  if (components.length === 0) {
    return zeroTax
  }

  const breakdown: TaxBreakdown[] = []
  let accumulatedTax = 0

  for (const component of components) {
    const rate = Number(component.rate)
    const baseAmount = component.isCompounded ? supplyAmount + accumulatedTax : supplyAmount
    const taxAmount = Math.round(baseAmount * rate * 100) / 100

    breakdown.push({
      componentCode: component.code,
      componentName: component.name,
      baseAmount,
      rate,
      taxAmount,
    })

    accumulatedTax += taxAmount
  }

  const totalTaxAmount = accumulatedTax
  const totalAmount = supplyAmount + totalTaxAmount
  const effectiveRate = Math.round((totalTaxAmount / supplyAmount) * 10000) / 10000

  return {
    supplyAmount,
    breakdown,
    totalTaxAmount,
    totalAmount,
    effectiveRate,
  }
}
