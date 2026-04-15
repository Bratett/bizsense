'use server'

import { and, desc, eq, ne, or, ilike, asc, sql } from 'drizzle-orm'
import { db } from '@/db'
import { customers, orders, paymentsReceived } from '@/db/schema'
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

export type CustomerStats = {
  totalOrders: number
  ordersThisMonth: number
  totalPaid: number
  lifetimeValue: number
}

export type CustomerTransaction = {
  id: string
  type: 'invoice' | 'payment'
  reference: string
  date: string
  amount: number
  status: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'completed'
  orderId?: string
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
      and(eq(customers.businessId, businessId), eq(customers.phone, phone), ne(customers.id, id)),
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

export async function listCustomers(filters?: CustomerListFilters): Promise<CustomerListItem[]> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const conditions = [eq(customers.businessId, businessId)]

  // Default to active-only unless explicitly set
  const isActive = filters?.isActive ?? true
  conditions.push(eq(customers.isActive, isActive))

  if (filters?.search) {
    const term = `%${filters.search}%`
    conditions.push(or(ilike(customers.name, term), ilike(customers.phone, term))!)
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

// ─── Get Customer Stats ───────────────────────────────────────────────────────

export async function getCustomerStats(customerId: string): Promise<CustomerStats> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const now = new Date()
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [result] = await db
    .select({
      totalOrders: sql<string>`COUNT(*)`,
      ordersThisMonth: sql<string>`COUNT(*) FILTER (WHERE ${orders.orderDate} >= ${startOfMonth}::date)`,
      totalPaid: sql<string>`COALESCE(SUM(CAST(${orders.amountPaid} AS numeric)), 0)`,
      lifetimeValue: sql<string>`COALESCE(SUM(CAST(${orders.totalAmount} AS numeric)), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.businessId, businessId)))

  return {
    totalOrders: Number(result?.totalOrders ?? '0'),
    ordersThisMonth: Number(result?.ordersThisMonth ?? '0'),
    totalPaid: Number(result?.totalPaid ?? '0'),
    lifetimeValue: Number(result?.lifetimeValue ?? '0'),
  }
}

// ─── Get Customer Recent Transactions ────────────────────────────────────────

export async function getCustomerRecentTransactions(
  customerId: string,
): Promise<CustomerTransaction[]> {
  const session = await getServerSession()
  const businessId = session.user.businessId

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [orderRows, paymentRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        paymentStatus: orders.paymentStatus,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.businessId, businessId)))
      .orderBy(desc(orders.orderDate))
      .limit(10),
    db
      .select({
        id: paymentsReceived.id,
        amount: paymentsReceived.amount,
        paymentDate: paymentsReceived.paymentDate,
        paymentMethod: paymentsReceived.paymentMethod,
        momoReference: paymentsReceived.momoReference,
        bankReference: paymentsReceived.bankReference,
      })
      .from(paymentsReceived)
      .where(
        and(
          eq(paymentsReceived.customerId, customerId),
          eq(paymentsReceived.businessId, businessId),
        ),
      )
      .orderBy(desc(paymentsReceived.paymentDate))
      .limit(10),
  ])

  const invoices: CustomerTransaction[] = orderRows.map((o) => ({
    id: o.id,
    type: 'invoice',
    reference: o.orderNumber,
    date: o.orderDate,
    amount: Number(o.totalAmount ?? '0'),
    status: deriveOrderStatus(o.paymentStatus, o.orderDate, thirtyDaysAgo),
    orderId: o.id,
  }))

  const payments: CustomerTransaction[] = paymentRows.map((p) => ({
    id: p.id,
    type: 'payment',
    reference: p.momoReference ?? p.bankReference ?? p.paymentMethod,
    date: p.paymentDate,
    amount: Number(p.amount),
    status: 'completed',
  }))

  return [...invoices, ...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
}

function deriveOrderStatus(
  paymentStatus: string,
  orderDate: string,
  thirtyDaysAgo: string,
): CustomerTransaction['status'] {
  if (paymentStatus === 'paid') return 'paid'
  if (paymentStatus === 'partial') return 'partial'
  if (orderDate < thirtyDaysAgo) return 'overdue'
  return 'unpaid'
}
