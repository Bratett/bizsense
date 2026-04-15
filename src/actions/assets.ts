'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { fixedAssets } from '@/db/schema/inventory'
import { accounts } from '@/db/schema/accounts'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { computeMonthlyDepreciation } from '@/lib/depreciation/engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FixedAssetListItem = {
  id: string
  name: string
  category: string | null
  purchaseDate: string
  purchaseCost: string
  usefulLifeMonths: number
  residualValue: string
  depreciationMethod: string
  accumulatedDepreciation: string
  netBookValue: number
  isActive: boolean
  disposalDate: string | null
}

export type FixedAssetDetail = FixedAssetListItem & {
  businessId: string
  assetAccountId: string | null
  depreciationAccountId: string | null
  accDepreciationAccountId: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateAssetInput = {
  name: string
  category?: string
  purchaseDate: string
  purchaseCost: number
  usefulLifeMonths: number
  residualValue?: number
  notes?: string
}

export type UpdateAssetInput = {
  name?: string
  category?: string
  usefulLifeMonths?: number
  residualValue?: number
  notes?: string
}

export type AssetActionResult =
  | { success: true; assetId: string }
  | { success: false; error: string }

export type DepreciationScheduleRow = {
  month: string // YYYY-MM
  amount: number
  accumulated: number
  nbv: number
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function fetchAccountByCode(businessId: string, code: string) {
  const [acct] = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, code)))
  if (!acct)
    throw new Error(`Required account ${code} not found. Please complete business setup.`)
  return acct
}

async function resolveAssetAccounts(
  businessId: string,
): Promise<{ assetAccountId: string; depreciationAccountId: string; accDepreciationAccountId: string }> {
  const codes = ['1500', '6008', '1510']
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, codes)))

  const map = Object.fromEntries(rows.map((a) => [a.code, a.id])) as Record<string, string>

  for (const code of codes) {
    if (!map[code]) {
      throw new Error(`Required asset account ${code} not found. Please complete business setup.`)
    }
  }

  return {
    assetAccountId: map['1500'],
    depreciationAccountId: map['6008'],
    accDepreciationAccountId: map['1510'],
  }
}

// ─── listFixedAssets ──────────────────────────────────────────────────────────

export async function listFixedAssets(): Promise<FixedAssetListItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const rows = await db
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.businessId, businessId))
    .orderBy(desc(fixedAssets.createdAt))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    purchaseDate: r.purchaseDate,
    purchaseCost: r.purchaseCost,
    usefulLifeMonths: r.usefulLifeMonths,
    residualValue: r.residualValue,
    depreciationMethod: r.depreciationMethod,
    accumulatedDepreciation: r.accumulatedDepreciation,
    netBookValue:
      Math.round((Number(r.purchaseCost) - Number(r.accumulatedDepreciation)) * 100) / 100,
    isActive: r.isActive,
    disposalDate: r.disposalDate,
  }))
}

// ─── getFixedAssetById ────────────────────────────────────────────────────────

export async function getFixedAssetById(id: string): Promise<FixedAssetDetail | null> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

  if (!row) return null

  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    category: row.category,
    purchaseDate: row.purchaseDate,
    purchaseCost: row.purchaseCost,
    usefulLifeMonths: row.usefulLifeMonths,
    residualValue: row.residualValue,
    depreciationMethod: row.depreciationMethod,
    accumulatedDepreciation: row.accumulatedDepreciation,
    netBookValue:
      Math.round((Number(row.purchaseCost) - Number(row.accumulatedDepreciation)) * 100) / 100,
    isActive: row.isActive,
    disposalDate: row.disposalDate,
    assetAccountId: row.assetAccountId,
    depreciationAccountId: row.depreciationAccountId,
    accDepreciationAccountId: row.accDepreciationAccountId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ─── createFixedAsset ─────────────────────────────────────────────────────────

export async function createFixedAsset(input: CreateAssetInput): Promise<AssetActionResult> {
  try {
    const { businessId } = await requireRole(['owner', 'manager', 'accountant'])

    if (!input.name.trim()) return { success: false, error: 'Asset name is required.' }
    if (input.purchaseCost <= 0)
      return { success: false, error: 'Purchase cost must be greater than zero.' }
    if (input.usefulLifeMonths < 1)
      return { success: false, error: 'Useful life must be at least 1 month.' }

    const residualValue = input.residualValue ?? 0
    if (residualValue < 0) return { success: false, error: 'Residual value cannot be negative.' }
    if (residualValue >= input.purchaseCost)
      return {
        success: false,
        error: 'Residual value cannot equal or exceed purchase cost.',
      }

    const { assetAccountId, depreciationAccountId, accDepreciationAccountId } =
      await resolveAssetAccounts(businessId)

    const [asset] = await db
      .insert(fixedAssets)
      .values({
        businessId,
        name: input.name.trim(),
        category: input.category?.trim() ?? null,
        purchaseDate: input.purchaseDate,
        purchaseCost: String(input.purchaseCost),
        usefulLifeMonths: input.usefulLifeMonths,
        residualValue: String(residualValue),
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: '0',
        assetAccountId,
        depreciationAccountId,
        accDepreciationAccountId,
        notes: input.notes?.trim() ?? null,
      })
      .returning({ id: fixedAssets.id })

    return { success: true, assetId: asset.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error.' }
  }
}

// ─── updateFixedAsset ─────────────────────────────────────────────────────────

export async function updateFixedAsset(
  id: string,
  input: UpdateAssetInput,
): Promise<AssetActionResult> {
  try {
    const { businessId } = await requireRole(['owner', 'manager', 'accountant'])

    const [existing] = await db
      .select({ id: fixedAssets.id, purchaseCost: fixedAssets.purchaseCost })
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

    if (!existing) return { success: false, error: 'Asset not found.' }

    if (input.usefulLifeMonths !== undefined && input.usefulLifeMonths < 1)
      return { success: false, error: 'Useful life must be at least 1 month.' }

    if (input.residualValue !== undefined) {
      if (input.residualValue < 0)
        return { success: false, error: 'Residual value cannot be negative.' }
      if (input.residualValue >= Number(existing.purchaseCost))
        return {
          success: false,
          error: 'Residual value cannot equal or exceed purchase cost.',
        }
    }

    await db
      .update(fixedAssets)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
        ...(input.usefulLifeMonths !== undefined
          ? { usefulLifeMonths: input.usefulLifeMonths }
          : {}),
        ...(input.residualValue !== undefined
          ? { residualValue: String(input.residualValue) }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

    return { success: true, assetId: id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error.' }
  }
}

// ─── disposeFixedAsset ────────────────────────────────────────────────────────

export async function disposeFixedAsset(
  id: string,
  disposalDate: string,
): Promise<AssetActionResult> {
  try {
    const { businessId } = await requireRole(['owner', 'accountant'])

    const [existing] = await db
      .select({ id: fixedAssets.id })
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

    if (!existing) return { success: false, error: 'Asset not found.' }

    await db
      .update(fixedAssets)
      .set({ isActive: false, disposalDate, updatedAt: new Date() })
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

    return { success: true, assetId: id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error.' }
  }
}

// ─── getDepreciationSchedule ──────────────────────────────────────────────────

export async function getDepreciationSchedule(id: string): Promise<DepreciationScheduleRow[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.businessId, businessId)))

  if (!row) return []

  const purchaseCost = Number(row.purchaseCost)
  const residualValue = Number(row.residualValue)
  const usefulLifeMonths = row.usefulLifeMonths
  const purchaseParts = row.purchaseDate.split('-').map(Number)

  const schedule: DepreciationScheduleRow[] = []
  let accumulated = 0
  let year = purchaseParts[0]
  let month = purchaseParts[1] // 1-based

  for (let i = 0; i < usefulLifeMonths + 1 && accumulated < purchaseCost - residualValue - 0.01; i++) {
    const result = computeMonthlyDepreciation(
      {
        assetId: row.id,
        purchaseDate: row.purchaseDate,
        purchaseCost,
        residualValue,
        usefulLifeMonths,
        accumulatedDepreciation: accumulated,
        depreciationMethod: row.depreciationMethod,
      },
      year,
      month,
    )

    if (!result.skip) {
      accumulated = result.newAccumulatedDepreciation
      schedule.push({
        month: `${year}-${String(month).padStart(2, '0')}`,
        amount: result.monthlyAmount,
        accumulated,
        nbv: Math.round((purchaseCost - accumulated) * 100) / 100,
      })
    }

    // advance to next month
    month++
    if (month > 12) {
      month = 1
      year++
    }

    if (schedule.length >= 600) break // safety cap (50 years)
  }

  return schedule
}

// Keep fetchAccountByCode accessible for tests
export { fetchAccountByCode }
