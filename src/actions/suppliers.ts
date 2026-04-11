'use server'

import { and, eq, ne, or, ilike, asc, sql, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { suppliers, purchaseOrders, goodsReceivedNotes, supplierPayments } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { normaliseGhanaPhone } from '@/lib/csvImport'
import { getSupplierApBalance } from '@/lib/suppliers/apBalance'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplierActionResult =
  | { success: true; supplierId?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type SupplierListItem = {
  id: string
  name: string
  phone: string | null
  location: string | null
  isActive: boolean
  creditTermsDays: number
  outstandingPayable: number
  openPoCount: number
}

export type SupplierWithBalance = {
  id: string
  businessId: string
  name: string
  phone: string | null
  email: string | null
  location: string | null
  momoNumber: string | null
  bankName: string | null
  bankAccount: string | null
  creditTermsDays: number
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  outstandingPayable: number
}

type SupplierListFilters = {
  search?: string
  isActive?: boolean
}

// ─── Create Supplier ─────────────────────────────────────────────────────────

export async function createSupplier(
  _prevState: SupplierActionResult,
  formData: FormData,
): Promise<SupplierActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const businessId = user.businessId

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const phoneRaw = (formData.get('phone') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const momoNumber = (formData.get('momoNumber') as string | null)?.trim() || null
  const bankName = (formData.get('bankName') as string | null)?.trim() || null
  const bankAccount = (formData.get('bankAccount') as string | null)?.trim() || null
  const creditTermsRaw = (formData.get('creditTermsDays') as string | null)?.trim() || '0'
  const notes = (formData.get('notes') as string | null)?.trim() || null

  // ── Validate ────────────────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {}

  if (!name) fieldErrors.name = 'Supplier name is required'
  else if (name.length < 2) fieldErrors.name = 'Name must be at least 2 characters'

  if (!phoneRaw) {
    fieldErrors.phone = 'Phone number is required'
  } else {
    const normalised = normaliseGhanaPhone(phoneRaw)
    if (!normalised) {
      fieldErrors.phone = 'Enter a valid Ghana phone number (e.g. 0241234567)'
    }
  }

  const creditTermsDays = Number(creditTermsRaw)
  if (isNaN(creditTermsDays) || creditTermsDays < 0) {
    fieldErrors.creditTermsDays = 'Credit terms must be 0 or more days'
  } else if (!Number.isInteger(creditTermsDays)) {
    fieldErrors.creditTermsDays = 'Credit terms must be a whole number of days'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const phone = normaliseGhanaPhone(phoneRaw)!

  // ── Phone uniqueness ────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.businessId, businessId), eq(suppliers.phone, phone)))
    .limit(1)

  if (existing.length > 0) {
    return {
      success: false,
      error: 'Please fix the errors below',
      fieldErrors: { phone: 'A supplier with this phone number already exists' },
    }
  }

  // ── Insert ──────────────────────────────────────────────────────────────────
  const [created] = await db
    .insert(suppliers)
    .values({
      businessId,
      name,
      phone,
      email,
      location,
      momoNumber,
      bankName,
      bankAccount,
      creditTermsDays,
      notes,
    })
    .returning({ id: suppliers.id })

  return { success: true, supplierId: created.id }
}

// ─── Update Supplier ─────────────────────────────────────────────────────────

export async function updateSupplier(
  _prevState: SupplierActionResult,
  formData: FormData,
): Promise<SupplierActionResult> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const businessId = user.businessId

  const id = formData.get('id') as string | null
  if (!id) return { success: false, error: 'Supplier ID is required' }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const phoneRaw = (formData.get('phone') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const momoNumber = (formData.get('momoNumber') as string | null)?.trim() || null
  const bankName = (formData.get('bankName') as string | null)?.trim() || null
  const bankAccount = (formData.get('bankAccount') as string | null)?.trim() || null
  const creditTermsRaw = (formData.get('creditTermsDays') as string | null)?.trim() || '0'
  const notes = (formData.get('notes') as string | null)?.trim() || null

  // ── Ownership check ─────────────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, businessId)))

  if (!existing) return { success: false, error: 'Supplier not found' }

  // ── Validate ────────────────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {}

  if (!name) fieldErrors.name = 'Supplier name is required'
  else if (name.length < 2) fieldErrors.name = 'Name must be at least 2 characters'

  if (!phoneRaw) {
    fieldErrors.phone = 'Phone number is required'
  } else {
    const normalised = normaliseGhanaPhone(phoneRaw)
    if (!normalised) {
      fieldErrors.phone = 'Enter a valid Ghana phone number (e.g. 0241234567)'
    }
  }

  const creditTermsDays = Number(creditTermsRaw)
  if (isNaN(creditTermsDays) || creditTermsDays < 0) {
    fieldErrors.creditTermsDays = 'Credit terms must be 0 or more days'
  } else if (!Number.isInteger(creditTermsDays)) {
    fieldErrors.creditTermsDays = 'Credit terms must be a whole number of days'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const phone = normaliseGhanaPhone(phoneRaw)!

  // ── Phone uniqueness (exclude self) ─────────────────────────────────────────
  const duplicate = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(eq(suppliers.businessId, businessId), eq(suppliers.phone, phone), ne(suppliers.id, id)),
    )
    .limit(1)

  if (duplicate.length > 0) {
    return {
      success: false,
      error: 'Please fix the errors below',
      fieldErrors: { phone: 'A supplier with this phone number already exists' },
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  await db
    .update(suppliers)
    .set({
      name,
      phone,
      email,
      location,
      momoNumber,
      bankName,
      bankAccount,
      creditTermsDays,
      notes,
      updatedAt: new Date(),
    })
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, businessId)))

  return { success: true }
}

// ─── Deactivate Supplier ─────────────────────────────────────────────────────

export async function deactivateSupplier(id: string): Promise<SupplierActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const businessId = user.businessId

  // ── Ownership check ─────────────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, businessId)))

  if (!existing) return { success: false, error: 'Supplier not found' }

  // ── Check outstanding AP balance (GRN totals minus payments made) ───────────
  const outstandingAp = await getSupplierApBalance(id, businessId)
  if (outstandingAp > 0) {
    const formatted = outstandingAp.toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return {
      success: false,
      error: `This supplier has an outstanding balance of GHS ${formatted}. Settle all payables before deactivating.`,
    }
  }

  // ── Check open POs ──────────────────────────────────────────────────────────
  const openPOs = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, id),
        eq(purchaseOrders.businessId, businessId),
        inArray(purchaseOrders.status, ['draft', 'sent', 'partially_received']),
      ),
    )

  if (openPOs.length > 0) {
    return {
      success: false,
      error: `This supplier has ${openPOs.length} open purchase order(s). Cancel or complete them before deactivating.`,
    }
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────
  await db
    .update(suppliers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, businessId)))

  return { success: true }
}

// ─── List Suppliers ──────────────────────────────────────────────────────────

export async function listSuppliers(filters?: SupplierListFilters): Promise<SupplierListItem[]> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const businessId = user.businessId

  const conditions = [eq(suppliers.businessId, businessId)]

  const isActive = filters?.isActive ?? true
  conditions.push(eq(suppliers.isActive, isActive))

  if (filters?.search) {
    const term = `%${filters.search}%`
    conditions.push(or(ilike(suppliers.name, term), ilike(suppliers.phone, term))!)
  }

  // Fetch suppliers with outstanding payable and open PO count via subqueries
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      location: suppliers.location,
      isActive: suppliers.isActive,
      creditTermsDays: suppliers.creditTermsDays,
      outstandingPayable: sql<string>`COALESCE((
        SELECT SUM(CAST(${goodsReceivedNotes.totalCost} AS numeric))
        FROM ${goodsReceivedNotes}
        WHERE ${goodsReceivedNotes.supplierId} = ${suppliers.id}
          AND ${goodsReceivedNotes.businessId} = ${suppliers.businessId}
          AND ${goodsReceivedNotes.status} = 'confirmed'
      ), 0) - COALESCE((
        SELECT SUM(CAST(${supplierPayments.amount} AS numeric))
        FROM ${supplierPayments}
        WHERE ${supplierPayments.supplierId} = ${suppliers.id}
          AND ${supplierPayments.businessId} = ${suppliers.businessId}
      ), 0)`,
      openPoCount: sql<string>`COALESCE((
        SELECT COUNT(*)
        FROM ${purchaseOrders}
        WHERE ${purchaseOrders.supplierId} = ${suppliers.id}
          AND ${purchaseOrders.businessId} = ${suppliers.businessId}
          AND ${purchaseOrders.status} IN ('draft', 'sent', 'partially_received')
      ), 0)`,
    })
    .from(suppliers)
    .where(and(...conditions))
    .orderBy(asc(suppliers.name))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    location: r.location,
    isActive: r.isActive,
    creditTermsDays: r.creditTermsDays,
    outstandingPayable: Number(r.outstandingPayable),
    openPoCount: Number(r.openPoCount),
  }))
}

// ─── Get Supplier By ID ──────────────────────────────────────────────────────

export async function getSupplierById(id: string): Promise<SupplierWithBalance> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const businessId = user.businessId

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, businessId)))

  if (!supplier) throw new Error('Supplier not found')

  const outstandingPayable = await getSupplierApBalance(id, businessId)

  return {
    ...supplier,
    outstandingPayable,
  }
}
