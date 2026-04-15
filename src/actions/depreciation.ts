'use server'

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { fixedAssets } from '@/db/schema/inventory'
import { accounts } from '@/db/schema/accounts'
import { journalEntries } from '@/db/schema/journal'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { postJournalEntry } from '@/lib/ledger'
import { computeMonthlyDepreciation } from '@/lib/depreciation/engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepreciationRunResult = {
  processed: number
  skipped: number
  alreadyRun: number
  errors: Array<{ assetId: string; name: string; error: string }>
}

export type UnrunDepreciationCheck = {
  hasActiveAssets: boolean
  needsRun: boolean
  currentMonth: string // YYYY-MM
  lastRunMonth: string | null
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function fetchAccountByCode(businessId: string, code: string) {
  const [acct] = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, code)))
  if (!acct) throw new Error(`Required account ${code} not found. Please complete business setup.`)
  return acct
}

// ─── runMonthlyDepreciation ───────────────────────────────────────────────────

export async function runMonthlyDepreciation(input: {
  year: number
  month: number // 1–12
}): Promise<DepreciationRunResult> {
  const { businessId } = await requireRole(['owner', 'accountant'])

  const { year, month } = input

  if (month < 1 || month > 12) throw new Error('Month must be between 1 and 12.')

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  // Last day of month: new Date(Date.UTC(year, month, 0)) gives the 0th day of month+1 = last day of month
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  // Fetch all active assets for this business
  const assets = await db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.businessId, businessId), eq(fixedAssets.isActive, true)))

  if (assets.length === 0) {
    return { processed: 0, skipped: 0, alreadyRun: 0, errors: [] }
  }

  // Resolve fallback account IDs once (used if asset FKs are null)
  const [depExpAcct, accDepAcct] = await Promise.all([
    fetchAccountByCode(businessId, '6008'), // Depreciation Expense
    fetchAccountByCode(businessId, '1510'), // Accumulated Depreciation
  ])

  let processed = 0
  let skipped = 0
  let alreadyRun = 0
  const errors: Array<{ assetId: string; name: string; error: string }> = []

  for (const asset of assets) {
    // ── Idempotency check ──────────────────────────────────────────────────
    const [existingEntry] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.businessId, businessId),
          eq(journalEntries.sourceType, 'depreciation'),
          eq(journalEntries.sourceId, asset.id),
          gte(journalEntries.entryDate, monthStart),
          lte(journalEntries.entryDate, monthEnd),
        ),
      )
      .limit(1)

    if (existingEntry) {
      alreadyRun++
      continue
    }

    // ── Compute depreciation ───────────────────────────────────────────────
    const result = computeMonthlyDepreciation(
      {
        assetId: asset.id,
        purchaseDate: asset.purchaseDate,
        purchaseCost: Number(asset.purchaseCost),
        residualValue: Number(asset.residualValue),
        usefulLifeMonths: asset.usefulLifeMonths,
        accumulatedDepreciation: Number(asset.accumulatedDepreciation),
        depreciationMethod: asset.depreciationMethod,
      },
      year,
      month,
    )

    if (result.skip) {
      skipped++
      continue
    }

    // ── Post journal entry atomically ──────────────────────────────────────
    // Use asset's own account FKs if set; fall back to code-resolved IDs.
    const depAccountId = asset.depreciationAccountId ?? depExpAcct.id
    const accDepAccountId = asset.accDepreciationAccountId ?? accDepAcct.id

    const reference = `DEP-${asset.id.slice(0, 8).toUpperCase()}-${year}${String(month).padStart(2, '0')}`
    const description = `Depreciation — ${asset.name} — ${year}/${String(month).padStart(2, '0')}`

    try {
      await db.transaction(async (tx) => {
        await postJournalEntry(tx, {
          businessId,
          entryDate: monthEnd,
          reference,
          description,
          sourceType: 'depreciation',
          sourceId: asset.id,
          lines: [
            {
              accountId: depAccountId,
              debitAmount: result.monthlyAmount,
              creditAmount: 0,
              currency: 'GHS',
              fxRate: 1,
              memo: `Depreciation — ${asset.name}`,
            },
            {
              accountId: accDepAccountId,
              debitAmount: 0,
              creditAmount: result.monthlyAmount,
              currency: 'GHS',
              fxRate: 1,
              memo: `Accum. depreciation — ${asset.name}`,
            },
          ],
        })

        await tx
          .update(fixedAssets)
          .set({
            accumulatedDepreciation: String(result.newAccumulatedDepreciation),
            isActive: !result.willBeFullyDepreciated,
            updatedAt: new Date(),
          })
          .where(eq(fixedAssets.id, asset.id))
      })

      processed++
    } catch (err) {
      errors.push({
        assetId: asset.id,
        name: asset.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { processed, skipped, alreadyRun, errors }
}

// ─── checkUnrunDepreciation ───────────────────────────────────────────────────

export async function checkUnrunDepreciation(): Promise<UnrunDepreciationCheck> {
  const session = await getServerSession()
  const { businessId, role } = session.user

  const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

  // Only relevant for owner/accountant — return safe default for other roles
  if (!['owner', 'accountant'].includes(role)) {
    return { hasActiveAssets: false, needsRun: false, currentMonth, lastRunMonth: null }
  }

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fixedAssets)
    .where(and(eq(fixedAssets.businessId, businessId), eq(fixedAssets.isActive, true)))

  const activeCount = Number(countResult?.count ?? 0)

  if (activeCount === 0) {
    return { hasActiveAssets: false, needsRun: false, currentMonth, lastRunMonth: null }
  }

  const [lastEntry] = await db
    .select({ entryDate: journalEntries.entryDate })
    .from(journalEntries)
    .where(
      and(eq(journalEntries.businessId, businessId), eq(journalEntries.sourceType, 'depreciation')),
    )
    .orderBy(desc(journalEntries.entryDate))
    .limit(1)

  const lastRunMonth = lastEntry ? lastEntry.entryDate.slice(0, 7) : null
  const needsRun = lastRunMonth !== currentMonth

  return { hasActiveAssets: true, needsRun, currentMonth, lastRunMonth }
}
