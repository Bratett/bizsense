'use server'

import { and, eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { fxRates } from '@/db/schema'
import { getServerSession } from '@/lib/session'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FxRate = {
  id: string
  businessId: string
  fromCurrency: string
  toCurrency: string
  rate: string
  rateDate: string
  source: string
  createdAt: Date
  updatedAt: Date
}

export type RecordFxRateInput = {
  fromCurrency: string
  rate: number
  rateDate: string // YYYY-MM-DD
}

// ─── Record FX Rate (upsert) ────────────────────────────────────────────────

export async function recordFxRate(input: RecordFxRateInput): Promise<FxRate> {
  const session = await getServerSession()
  const { businessId } = session.user

  if (!input.fromCurrency?.trim()) {
    throw new Error('fromCurrency is required')
  }
  if (!input.rate || input.rate <= 0) {
    throw new Error('rate must be greater than 0')
  }
  if (!input.rateDate?.trim()) {
    throw new Error('rateDate is required')
  }

  const now = new Date()

  const [saved] = await db
    .insert(fxRates)
    .values({
      businessId,
      fromCurrency: input.fromCurrency,
      toCurrency: 'GHS',
      rate: input.rate.toFixed(4),
      rateDate: input.rateDate,
      source: 'manual',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [fxRates.businessId, fxRates.fromCurrency, fxRates.toCurrency, fxRates.rateDate],
      set: {
        rate: input.rate.toFixed(4),
        source: 'manual',
        updatedAt: now,
      },
    })
    .returning()

  return saved
}

// ─── Get Latest FX Rate ─────────────────────────────────────────────────────

export async function getLatestFxRate(fromCurrency: string): Promise<FxRate | null> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.businessId, businessId),
        eq(fxRates.fromCurrency, fromCurrency),
        eq(fxRates.toCurrency, 'GHS'),
      ),
    )
    .orderBy(desc(fxRates.rateDate))
    .limit(1)

  return row ?? null
}
