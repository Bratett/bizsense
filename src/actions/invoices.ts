'use server'

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, customers, orders } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getOrderById } from '@/actions/orders'
import { calculateTax } from '@/lib/tax'
import type {
  InvoiceData,
  InvoiceLineItem,
  InvoiceTaxBreakdown,
  InvoicePayment,
  InvoiceBusiness,
  InvoiceCustomer,
} from '@/lib/pdf/types'

// ─── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel Cash',
  momo_airtel: 'AirtelTigo Money',
  bank: 'Bank Transfer',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateDDMMYYYY(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

// ─── Get Invoice Data ───────────────────────────────────────────────────────

export async function getInvoiceData(orderId: string): Promise<InvoiceData> {
  const session = await getServerSession()
  const { businessId } = session.user

  // 1. Fetch order (reuse existing action — validates ownership via session)
  const order = await getOrderById(orderId)

  // 2. Fetch business info
  const [biz] = await db
    .select({
      name: businesses.name,
      address: businesses.address,
      phone: businesses.phone,
      email: businesses.email,
      logoUrl: businesses.logoUrl,
      tin: businesses.tin,
      vatNumber: businesses.vatNumber,
      vatRegistered: businesses.vatRegistered,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  if (!biz) throw new Error('Business not found')

  // 3. Fetch customer location (getOrderById only returns id/name/phone)
  let customer: InvoiceCustomer | null = null
  if (order.customer) {
    const [cust] = await db
      .select({ location: customers.location })
      .from(customers)
      .where(eq(customers.id, order.customer.id))

    customer = {
      name: order.customer.name,
      phone: order.customer.phone,
      location: cust?.location ?? null,
    }
  }

  // 4. Build line items
  const lines: InvoiceLineItem[] = order.lines.map((line, i) => ({
    index: i + 1,
    description: line.description ?? '',
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    unitPriceCurrency: line.unitPriceCurrency as 'GHS' | 'USD',
    discountAmount: Number(line.discountAmount),
    lineTotal: Number(line.lineTotal),
  }))

  const hasUsdLines = lines.some((l) => l.unitPriceCurrency === 'USD')

  // 5. Compute totals
  const subtotal = Number(order.subtotal ?? 0)
  const discountAmount = Number(order.discountAmount ?? 0)
  const taxAmount = Number(order.taxAmount ?? 0)
  const totalAmount = Number(order.totalAmount ?? 0)
  const amountPaid = Number(order.amountPaid)
  const taxableAmount = Math.round((subtotal - discountAmount) * 100) / 100

  // 6. Build tax breakdown
  let taxBreakdown: InvoiceTaxBreakdown[] = []

  if (biz.vatRegistered && taxAmount > 0) {
    const recalculated = await calculateTax(businessId, taxableAmount)

    if (
      recalculated.totalTaxAmount > 0 &&
      Math.abs(recalculated.totalTaxAmount - taxAmount) > 0.01
    ) {
      // Tax rates changed since order creation — scale proportionally
      const scaleFactor = taxAmount / recalculated.totalTaxAmount
      taxBreakdown = recalculated.breakdown.map((b) => ({
        componentCode: b.componentCode,
        componentName: b.componentName,
        rate: b.rate,
        taxAmount: Math.round(b.taxAmount * scaleFactor * 100) / 100,
      }))
    } else {
      taxBreakdown = recalculated.breakdown.map((b) => ({
        componentCode: b.componentCode,
        componentName: b.componentName,
        rate: b.rate,
        taxAmount: b.taxAmount,
      }))
    }
  }

  // 7. Build discount label
  let discountLabel: string | null = null
  if (discountAmount > 0) {
    if (order.discountType === 'percentage' && order.discountValue) {
      discountLabel = `${Number(order.discountValue)}%`
    }
  }

  // 8. Build payment
  let payment: InvoicePayment | null = null
  if (order.payment) {
    payment = {
      paymentMethod: order.payment.paymentMethod,
      paymentMethodLabel:
        PAYMENT_METHOD_LABELS[order.payment.paymentMethod] ?? order.payment.paymentMethod,
      momoReference: order.payment.momoReference,
      bankReference: order.payment.bankReference,
      amountPaid,
      paymentDate: formatDateDDMMYYYY(order.payment.paymentDate),
    }
  }

  // 9. Assemble InvoiceData
  const business: InvoiceBusiness = {
    name: biz.name,
    address: biz.address,
    phone: biz.phone,
    email: biz.email,
    logoUrl: biz.logoUrl,
    tin: biz.tin,
    vatNumber: biz.vatNumber,
    vatRegistered: biz.vatRegistered,
  }

  return {
    invoiceNumber: order.orderNumber,
    invoiceDate: formatDateDDMMYYYY(order.orderDate),
    invoiceLabel: biz.vatRegistered ? 'TAX INVOICE' : 'INVOICE',

    business,
    customer,

    lines,

    fxRate: order.fxRate ? Number(order.fxRate) : null,
    hasUsdLines,

    subtotal,
    discountAmount,
    discountLabel,
    taxableAmount,
    taxBreakdown,
    taxAmount,
    totalAmount,

    payment,
    balanceDue: Math.round((totalAmount - amountPaid) * 100) / 100,

    footerBusinessName: biz.name,
    footerBusinessPhone: biz.phone,
  }
}
