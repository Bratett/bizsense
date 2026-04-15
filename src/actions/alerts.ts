'use server'

import { db } from '@/db'
import { businesses } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '@/lib/auth/requireRole'
import { getDashboardLowStock } from '@/lib/dashboard/queries'
import { getArAging } from '@/lib/reports/arAging'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { lowStockAlertTemplate, overdueInvoicesTemplate } from '@/lib/whatsapp/templates'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LowStockAlertData = {
  whatsAppLink: string | null
  canSend: boolean
  reason?: string
  productCount: number
  ownerPhone: string | null
}

export type OverdueAlertData = {
  whatsAppLink: string | null
  canSend: boolean
  reason?: string
  invoiceCount: number
  totalOutstanding: number
  ownerPhone: string | null
}

// ─── getLowStockAlertData ─────────────────────────────────────────────────────

export async function getLowStockAlertData(): Promise<LowStockAlertData> {
  const { businessId } = await requireRole(['owner', 'manager'])

  const [business] = await db
    .select({ name: businesses.name, phone: businesses.phone })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  const lowStock = await getDashboardLowStock(businessId)

  if (lowStock.count === 0) {
    return {
      whatsAppLink: null,
      canSend: false,
      reason: 'No products below reorder level.',
      productCount: 0,
      ownerPhone: business?.phone ?? null,
    }
  }

  if (!business?.phone) {
    return {
      whatsAppLink: null,
      canSend: false,
      reason: 'Add your phone number in Settings to send alerts.',
      productCount: lowStock.count,
      ownerPhone: null,
    }
  }

  const message = lowStockAlertTemplate({
    businessName: business.name,
    products: lowStock.items.map((p) => ({ ...p, unit: p.unit ?? 'units' })),
  })

  const result = buildWhatsAppLink(business.phone, message)

  return {
    whatsAppLink: result.ok ? result.url : null,
    canSend: result.ok,
    reason: result.ok ? undefined : `Invalid phone number: ${business.phone}`,
    productCount: lowStock.count,
    ownerPhone: business.phone,
  }
}

// ─── getOverdueAlertData ──────────────────────────────────────────────────────

export async function getOverdueAlertData(): Promise<OverdueAlertData> {
  const { businessId } = await requireRole(['owner', 'manager'])

  const [business] = await db
    .select({ name: businesses.name, phone: businesses.phone })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  const today = new Date().toISOString().slice(0, 10)
  const aging = await getArAging(businessId, today)

  const overdueInvoices = aging.customers.flatMap((c) =>
    c.invoices.filter((i) => i.bucket !== 'current' && i.outstanding > 0),
  )

  if (overdueInvoices.length === 0) {
    return {
      whatsAppLink: null,
      canSend: false,
      reason: 'No overdue invoices older than 30 days.',
      invoiceCount: 0,
      totalOutstanding: 0,
      ownerPhone: business?.phone ?? null,
    }
  }

  if (!business?.phone) {
    return {
      whatsAppLink: null,
      canSend: false,
      reason: 'Add your phone number in Settings to send alerts.',
      invoiceCount: overdueInvoices.length,
      totalOutstanding: overdueInvoices.reduce((s, i) => s + i.outstanding, 0),
      ownerPhone: null,
    }
  }

  const totalOutstanding = overdueInvoices.reduce((s, i) => s + i.outstanding, 0)

  const message = overdueInvoicesTemplate({
    businessName: business.name,
    invoices: overdueInvoices.slice(0, 10).map((i) => ({
      customerName: i.customerName,
      orderNumber: i.orderNumber,
      outstanding: i.outstanding,
      daysOverdue: i.ageDays,
    })),
    totalOutstanding,
  })

  const result = buildWhatsAppLink(business.phone, message)

  return {
    whatsAppLink: result.ok ? result.url : null,
    canSend: result.ok,
    reason: result.ok ? undefined : `Invalid phone number: ${business.phone}`,
    invoiceCount: overdueInvoices.length,
    totalOutstanding,
    ownerPhone: business.phone,
  }
}
