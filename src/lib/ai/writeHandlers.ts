import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { pendingAiActions } from '@/db/schema/ai'
import { customers, orders } from '@/db/schema/transactions'
import { products, inventoryTransactions, suppliers } from '@/db/schema/inventory'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleWriteTool(
  toolName: string,
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId?: string,
): Promise<string> {
  switch (toolName) {
    case 'record_sale':
      return stageRecordSale(input, businessId, userId, sessionId)
    case 'record_expense':
      return stageRecordExpense(input, businessId, userId, sessionId)
    case 'record_payment_received':
      return stageRecordPayment(input, businessId, userId, sessionId)
    case 'add_customer':
      return stageAddCustomer(input, businessId, userId, sessionId)
    case 'update_customer':
      return stageUpdateCustomer(input, businessId, userId, sessionId)
    case 'add_supplier':
      return stageAddSupplier(input, businessId, userId, sessionId)
    case 'adjust_stock':
      return stageAdjustStock(input, businessId, userId, sessionId)
    default:
      return JSON.stringify({ error: `Unknown write tool: ${toolName}` })
  }
}

// ── Shared staging helper ─────────────────────────────────────────────────────

async function createStagingRecord(params: {
  businessId: string
  userId: string
  sessionId: string | undefined
  actionType: string
  proposedData: Record<string, unknown>
  humanReadable: string
}): Promise<string> {
  const [inserted] = await db
    .insert(pendingAiActions)
    .values({
      businessId: params.businessId,
      userId: params.userId,
      sessionId: params.sessionId,
      actionType: params.actionType,
      proposedData: params.proposedData,
      humanReadable: params.humanReadable,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    })
    .returning({ id: pendingAiActions.id })

  return JSON.stringify({
    stagingId: inserted.id,
    humanReadable: params.humanReadable,
    actionType: params.actionType,
    proposedData: params.proposedData,
    status: 'pending_confirmation',
  })
}

// ── Category resolver ─────────────────────────────────────────────────────────

function resolveExpenseCategory(
  input: string,
): (typeof EXPENSE_CATEGORIES)[number] | null {
  const lower = input.toLowerCase().trim()

  // 1. Exact key match (e.g. 'transport')
  const byKey = EXPENSE_CATEGORIES.find((c) => c.key === lower)
  if (byKey) return byKey

  // 2. Key slug match (e.g. 'bank charges' matches key 'bank_charges')
  const bySlug = EXPENSE_CATEGORIES.find((c) =>
    lower.includes(c.key.replace(/_/g, ' ')),
  )
  if (bySlug) return bySlug

  // 3. Label word match (e.g. 'fuel' matches 'Transport & Fuel')
  const byLabel = EXPENSE_CATEGORIES.find((c) => {
    const words = c.label
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
    return words.some((w) => lower.includes(w))
  })
  return byLabel ?? null
}

// ── Customer lookup helper ────────────────────────────────────────────────────

type CustomerMatch = { id: string; name: string; phone: string | null }

async function resolveCustomer(
  identifier: string,
  businessId: string,
): Promise<{ error: string } | { matches: CustomerMatch[] }> {
  const matches = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        eq(customers.isActive, true),
        or(
          ilike(customers.name, `%${identifier}%`),
          eq(customers.phone, identifier),
        ),
      ),
    )
    .limit(5)

  return { matches }
}

// ── record_sale ───────────────────────────────────────────────────────────────

async function stageRecordSale(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  let resolvedCustomerId: string | undefined
  let resolvedCustomerName: string | undefined

  const identifier = input.customer_name_or_phone as string | undefined

  if (identifier) {
    const result = await resolveCustomer(identifier, businessId)
    const { matches } = result as { matches: CustomerMatch[] }

    if (matches.length === 0) {
      return JSON.stringify({
        error: 'customer_not_found',
        message: `No customer found matching "${identifier}". Check the name/phone or add them first.`,
      })
    }
    if (matches.length > 1) {
      return JSON.stringify({
        error: 'ambiguous_customer',
        candidates: matches.map((c) => ({ name: c.name, phone: c.phone ?? '' })),
        message: 'Multiple customers match. Ask the user to clarify which customer.',
      })
    }

    resolvedCustomerId = matches[0].id
    resolvedCustomerName = matches[0].name
  }

  const items =
    (input.items as Array<{ name: string; qty: number; unit_price: number }>) ?? []
  const discount = (input.discount_amount as number | undefined) ?? 0
  const total = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const net = total - discount

  const itemLines = items
    .map((i) => `  • ${i.qty}x ${i.name} @ GHS ${i.unit_price.toFixed(2)}`)
    .join('\n')

  const humanReadable = [
    `Sale on ${(input.order_date as string) ?? new Date().toISOString().slice(0, 10)}`,
    identifier
      ? `Customer: ${resolvedCustomerName ?? identifier}`
      : 'Walk-in customer',
    `Items:\n${itemLines}`,
    discount > 0 ? `Discount: GHS ${discount.toFixed(2)}` : null,
    `Total: GHS ${net.toFixed(2)}`,
    `Payment: ${input.payment_method as string}`,
    input.notes ? `Notes: ${input.notes as string}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'record_sale',
    proposedData: {
      customerId: resolvedCustomerId,
      customerName: resolvedCustomerName ?? identifier,
      orderDate: (input.order_date as string) ?? new Date().toISOString().slice(0, 10),
      items,
      discountAmount: discount,
      paymentMethod: input.payment_method,
      notes: input.notes,
      estimatedTotal: net,
    },
    humanReadable,
  })
}

// ── record_expense ────────────────────────────────────────────────────────────

async function stageRecordExpense(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const categoryInput = input.category as string
  const category = resolveExpenseCategory(categoryInput)

  if (!category) {
    return JSON.stringify({
      error: 'unknown_category',
      message: `"${categoryInput}" does not match any known expense category.`,
      validCategories: EXPENSE_CATEGORIES.map((c) => c.key),
    })
  }

  const amount = Number(input.amount)
  const isCapital = category.accountCode === '1500'
  const expenseDate =
    (input.expense_date as string) ?? new Date().toISOString().slice(0, 10)

  const humanReadable = [
    `Expense on ${expenseDate}`,
    `Category: ${category.label}`,
    `Amount: GHS ${amount.toFixed(2)}${input.includes_vat ? ' (includes VAT)' : ''}`,
    `Payment: ${input.payment_method as string}`,
    `Description: ${input.description as string}`,
    isCapital ? 'This will be recorded as a Fixed Asset, not an expense.' : null,
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'record_expense',
    proposedData: {
      categoryKey: category.key,
      categoryLabel: category.label,
      accountCode: category.accountCode,
      isCapital,
      amount,
      paymentMethod: input.payment_method,
      description: input.description,
      expenseDate,
      includesVat: Boolean(input.includes_vat),
      supplierName: input.supplier_name,
    },
    humanReadable,
  })
}

// ── record_payment_received ───────────────────────────────────────────────────

async function stageRecordPayment(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const identifier = input.customer_name_or_phone as string
  const amount = Number(input.amount)
  const paymentMethod = input.payment_method as string
  const paymentDate =
    (input.payment_date as string) ?? new Date().toISOString().slice(0, 10)
  const invoiceNumber = input.invoice_number as string | undefined

  // Resolve customer
  const result = await resolveCustomer(identifier, businessId)
  const { matches } = result as { matches: CustomerMatch[] }

  if (matches.length === 0) {
    return JSON.stringify({
      error: 'customer_not_found',
      message: `No customer found matching "${identifier}".`,
    })
  }
  if (matches.length > 1) {
    return JSON.stringify({
      error: 'ambiguous_customer',
      candidates: matches.map((c) => ({ name: c.name, phone: c.phone ?? '' })),
      message: 'Multiple customers match. Ask the user to clarify which customer.',
    })
  }

  const customer = matches[0]

  // Find open invoices (FIFO: oldest first)
  const openInvoices = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalAmount: orders.totalAmount,
      amountPaid: orders.amountPaid,
      orderDate: orders.orderDate,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.customerId, customer.id),
        inArray(orders.paymentStatus, ['unpaid', 'partial']),
        inArray(orders.status, ['confirmed', 'fulfilled']),
      ),
    )
    .orderBy(asc(orders.orderDate))

  if (openInvoices.length === 0) {
    return JSON.stringify({
      error: 'no_open_invoices',
      message: `${customer.name} has no outstanding invoices.`,
    })
  }

  // Apply to specific invoice if requested, else oldest
  const targetInvoice = invoiceNumber
    ? (openInvoices.find((o) => o.orderNumber === invoiceNumber) ?? openInvoices[0])
    : openInvoices[0]

  const remaining =
    Number(targetInvoice.totalAmount) - Number(targetInvoice.amountPaid)
  const overpaymentWarning = amount > remaining

  const humanReadable = [
    `Payment from ${customer.name} on ${paymentDate}`,
    `Invoice: ${targetInvoice.orderNumber} (outstanding: GHS ${remaining.toFixed(2)})`,
    `Amount received: GHS ${amount.toFixed(2)}`,
    `Payment method: ${paymentMethod}`,
    overpaymentWarning
      ? `Payment exceeds balance by GHS ${(amount - remaining).toFixed(2)}`
      : null,
    openInvoices.length > 1
      ? `Note: ${customer.name} has ${openInvoices.length} open invoices. Payment applied to oldest.`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'record_payment_received',
    proposedData: {
      customerId: customer.id,
      customerName: customer.name,
      orderId: targetInvoice.id,
      orderNumber: targetInvoice.orderNumber,
      amount,
      paymentMethod,
      paymentDate,
      remaining,
      overpaymentWarning,
    },
    humanReadable,
  })
}

// ── add_customer ──────────────────────────────────────────────────────────────

async function stageAddCustomer(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const name = input.name as string
  const phone = input.phone as string

  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.phone, phone)))
    .limit(1)

  if (existing.length > 0) {
    return JSON.stringify({
      error: 'duplicate_phone',
      message: `A customer with phone ${phone} already exists.`,
    })
  }

  const creditLimit = Number(input.credit_limit ?? 0)
  const humanReadable = [
    `Add new customer: ${name}`,
    `Phone: ${phone}`,
    input.location ? `Location: ${input.location as string}` : null,
    creditLimit > 0
      ? `Credit limit: GHS ${creditLimit.toFixed(2)}`
      : 'No credit (cash only)',
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'add_customer',
    proposedData: {
      name,
      phone,
      location: input.location,
      creditLimit,
    },
    humanReadable,
  })
}

// ── update_customer ───────────────────────────────────────────────────────────

async function stageUpdateCustomer(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const identifier = input.identifier as string
  const field = input.field as string
  const value = input.value as string

  const matches = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        ilike(customers.name, `%${identifier}%`),
      ),
    )
    .limit(3)

  if (matches.length === 0) {
    return JSON.stringify({
      error: 'not_found',
      message: `No customer found matching "${identifier}".`,
    })
  }
  if (matches.length > 1) {
    return JSON.stringify({
      error: 'ambiguous',
      candidates: matches.map((c) => c.name),
      message: 'Multiple customers match. Ask the user to clarify.',
    })
  }

  const customer = matches[0]
  const humanReadable = `Update ${customer.name}: set ${field} to "${value}"`

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'update_customer',
    proposedData: {
      customerId: customer.id,
      customerName: customer.name,
      field,
      value,
    },
    humanReadable,
  })
}

// ── add_supplier ──────────────────────────────────────────────────────────────

async function stageAddSupplier(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const name = input.name as string
  const phone = input.phone as string

  const existing = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.businessId, businessId),
        eq(suppliers.phone, phone),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    return JSON.stringify({
      error: 'duplicate_phone',
      message: `A supplier with phone ${phone} already exists.`,
    })
  }

  const humanReadable = [
    `Add new supplier: ${name}`,
    `Phone: ${phone}`,
    input.location ? `Location: ${input.location as string}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'add_supplier',
    proposedData: {
      name,
      phone,
      location: input.location,
    },
    humanReadable,
  })
}

// ── adjust_stock ──────────────────────────────────────────────────────────────

async function stageAdjustStock(
  input: Record<string, unknown>,
  businessId: string,
  userId: string,
  sessionId: string | undefined,
): Promise<string> {
  const productName = input.product_name as string
  const quantityChange = Number(input.quantity_change)
  const reason = input.reason as string

  // Resolve product
  const matched = await db
    .select({ id: products.id, name: products.name, unit: products.unit })
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        ilike(products.name, `%${productName}%`),
        eq(products.isActive, true),
      ),
    )
    .limit(5)

  if (matched.length === 0) {
    return JSON.stringify({
      error: 'product_not_found',
      message: `No product found matching "${productName}".`,
    })
  }
  if (matched.length > 1) {
    return JSON.stringify({
      error: 'ambiguous_product',
      candidates: matched.map((p) => p.name),
      message: 'Multiple products match. Ask the user to clarify.',
    })
  }

  const product = matched[0]

  // Get current stock
  const [stockRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.businessId, businessId),
        eq(inventoryTransactions.productId, product.id),
      ),
    )

  const currentStock = Number(stockRow?.total ?? 0)

  // Guard against negative stock for removal
  if (quantityChange < 0 && currentStock + quantityChange < 0) {
    return JSON.stringify({
      error: 'insufficient_stock',
      currentStock,
      requested: Math.abs(quantityChange),
      message: `Cannot remove ${Math.abs(quantityChange)} units — only ${currentStock} in stock.`,
    })
  }

  const sign = quantityChange > 0 ? '+' : ''
  const newStock = currentStock + quantityChange
  const humanReadable = [
    `Stock adjustment for ${product.name}`,
    `Change: ${sign}${quantityChange} ${product.unit ?? 'units'} (${reason})`,
    `Stock: ${currentStock} → ${newStock}`,
    input.notes ? `Notes: ${input.notes as string}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return createStagingRecord({
    businessId,
    userId,
    sessionId,
    actionType: 'adjust_stock',
    proposedData: {
      productId: product.id,
      productName: product.name,
      quantityChange,
      reason,
      currentStock,
      notes: input.notes,
    },
    humanReadable,
  })
}
