'use server'

import { and, eq, ne, or, ilike, asc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { customers, orders } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { normaliseGhanaPhone } from '@/lib/csvImport'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CustomerActionResult =
  | { success: true; customerId?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type CustomerListItem = {
  id: string
  name: string
  phone: string | null
  location: string | null
  isActive: boolean
  creditLimit: string
}

export type CustomerWithBalance = {
  id: string
  businessId: string
  name: string
  phone: string | null
  email: string | null
  location: string | null
  momoNumber: string | null
  creditLimit: string
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  outstandingBalance: number
}

type CustomerListFilters = {
  search?: string
  isActive?: boolean
}

// ─── Create Customer ─────────────────────────────────────────────────────────

export async function createCustomer(
  _prevState: CustomerActionResult,
  formData: FormData,
): Promise<CustomerActionResult> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const phoneRaw = (formData.get('phone') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const momoNumber = (formData.get('momoNumber') as string | null)?.trim() || null
  const creditLimitRaw = (formData.get('creditLimit') as string | null)?.trim() || '0'
  const notes = (formData.get('notes') as string | null)?.trim() || null

  // ── Validate ────────────────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {}

  if (!name) fieldErrors.name = 'Customer name is required'
  else if (name.length < 2) fieldErrors.name = 'Name must be at least 2 characters'

  if (!phoneRaw) {
    fieldErrors.phone = 'Phone number is required'
  } else {
    const normalised = normaliseGhanaPhone(phoneRaw)
    if (!normalised) {
      fieldErrors.phone = 'Enter a valid Ghana phone number (e.g. 0241234567)'
    }
  }

  const creditLimit = Number(creditLimitRaw)
  if (isNaN(creditLimit) || creditLimit < 0) {
    fieldErrors.creditLimit = 'Credit limit must be a number 0 or greater'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const phone = normaliseGhanaPhone(phoneRaw)!

  // ── Phone uniqueness ────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.phone, phone)))
    .limit(1)

  if (existing.length > 0) {
    return {
      success: false,
      error: 'Please fix the errors below',
      fieldErrors: { phone: 'A customer with this phone number already exists' },
    }
  }

  // ── Insert ──────────────────────────────────────────────────────────────────
  const [created] = await db
    .insert(customers)
    .values({
      businessId,
      name,
      phone,
      email,
      location,
      momoNumber,
      creditLimit: creditLimitRaw,
      notes,
    })
    .returning({ id: customers.id })

  return { success: true, customerId: created.id }
}

// ─── Update Customer ─────────────────────────────────────────────────────────

export async function updateCustomer(
  _prevState: CustomerActionResult,
  formData: FormData,
): Promise<CustomerActionResult> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const id = formData.get('id') as string | null
  if (!id) return { success: false, error: 'Customer ID is required' }

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const phoneRaw = (formData.get('phone') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const momoNumber = (formData.get('momoNumber') as string | null)?.trim() || null
  const creditLimitRaw = (formData.get('creditLimit') as string | null)?.trim() || '0'
  const notes = (formData.get('notes') as string | null)?.trim() || null

  // ── Ownership check ─────────────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))

  if (!existing) return { success: false, error: 'Customer not found' }

  // ── Validate ────────────────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {}

  if (!name) fieldErrors.name = 'Customer name is required'
  else if (name.length < 2) fieldErrors.name = 'Name must be at least 2 characters'

  if (!phoneRaw) {
    fieldErrors.phone = 'Phone number is required'
  } else {
    const normalised = normaliseGhanaPhone(phoneRaw)
    if (!normalised) {
      fieldErrors.phone = 'Enter a valid Ghana phone number (e.g. 0241234567)'
    }
  }

  const creditLimit = Number(creditLimitRaw)
  if (isNaN(creditLimit) || creditLimit < 0) {
    fieldErrors.creditLimit = 'Credit limit must be a number 0 or greater'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  const phone = normaliseGhanaPhone(phoneRaw)!

  // ── Phone uniqueness (exclude self) ─────────────────────────────────────────
  const duplicate = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        eq(customers.phone, phone),
        ne(customers.id, id),
      ),
    )
    .limit(1)

  if (duplicate.length > 0) {
    return {
      success: false,
      error: 'Please fix the errors below',
      fieldErrors: { phone: 'A customer with this phone number already exists' },
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  await db
    .update(customers)
    .set({
      name,
      phone,
      email,
      location,
      momoNumber,
      creditLimit: creditLimitRaw,
      notes,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))

  return { success: true }
}

// ─── Deactivate Customer ─────────────────────────────────────────────────────

export async function deactivateCustomer(id: string): Promise<CustomerActionResult> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  // ── Ownership check ─────────────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))

  if (!existing) return { success: false, error: 'Customer not found' }

  // ── Check for unpaid orders ─────────────────────────────────────────────────
  const unpaidOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, id),
        eq(orders.businessId, businessId),
        ne(orders.paymentStatus, 'paid'),
      ),
    )

  if (unpaidOrders.length > 0) {
    return {
      success: false,
      error: `This customer has ${unpaidOrders.length} unpaid invoice(s). Settle all balances before deactivating.`,
    }
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────
  await db
    .update(customers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))

  return { success: true }
}

// ─── List Customers ──────────────────────────────────────────────────────────

export async function listCustomers(
  filters?: CustomerListFilters,
): Promise<CustomerListItem[]> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const conditions = [eq(customers.businessId, businessId)]

  // Default to active-only unless explicitly set
  const isActive = filters?.isActive ?? true
  conditions.push(eq(customers.isActive, isActive))

  if (filters?.search) {
    const term = `%${filters.search}%`
    conditions.push(
      or(ilike(customers.name, term), ilike(customers.phone, term))!,
    )
  }

  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      location: customers.location,
      isActive: customers.isActive,
      creditLimit: customers.creditLimit,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name))
}

// ─── Get Customer By ID ──────────────────────────────────────────────────────

export async function getCustomerById(id: string): Promise<CustomerWithBalance> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)))

  if (!customer) throw new Error('Customer not found')

  // Compute outstanding balance from unpaid/partial orders
  const [balanceResult] = await db
    .select({
      outstanding: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric) - CAST(${orders.amountPaid} AS numeric)), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.customerId, id),
        eq(orders.businessId, businessId),
        ne(orders.paymentStatus, 'paid'),
      ),
    )

  return {
    ...customer,
    outstandingBalance: Number(balanceResult?.outstanding ?? '0'),
  }
}
