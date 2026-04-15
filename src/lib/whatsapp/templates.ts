import { formatGhs, formatDate } from '@/lib/format'

// ── Customer-facing templates ──────────────────────────────────────────────

/**
 * Invoice notification sent to customer when an invoice is created.
 * Includes the Supabase Storage signed URL for the PDF.
 */
export function invoiceTemplate(params: {
  businessName: string
  customerName: string
  orderNumber: string
  totalAmount: number
  dueDate: string // ISO date
  invoiceUrl?: string // signed PDF URL — optional; omitted if blank
  businessPhone?: string
}): string {
  return [
    `Dear ${params.customerName},`,
    ``,
    `Please find your invoice from ${params.businessName}:`,
    ``,
    `Invoice No: ${params.orderNumber}`,
    `Amount Due: ${formatGhs(params.totalAmount)}`,
    `Due Date: ${formatDate(params.dueDate)}`,
    ``,
    params.invoiceUrl ? `View invoice: ${params.invoiceUrl}` : '',
    params.invoiceUrl ? `` : '',
    `To pay via Mobile Money, please use the following reference: ${params.orderNumber}`,
    params.businessPhone ? `\nFor enquiries, call: ${params.businessPhone}` : '',
    ``,
    `Thank you for your business.`,
    `${params.businessName}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Hubtel MoMo payment link sent to customer.
 * Replaces the PDF link with a direct payment link.
 */
export function paymentLinkTemplate(params: {
  businessName: string
  customerName: string
  orderNumber: string
  totalAmount: number
  paymentUrl: string // Hubtel checkout URL
}): string {
  return [
    `Dear ${params.customerName},`,
    ``,
    `Your invoice ${params.orderNumber} for ${formatGhs(params.totalAmount)} is ready.`,
    ``,
    `Pay securely via Mobile Money here:`,
    params.paymentUrl,
    ``,
    `This link expires in 24 hours.`,
    ``,
    `Thank you,`,
    `${params.businessName}`,
  ]
    .join('\n')
    .trim()
}

/**
 * Payment reminder for overdue invoice.
 */
export function paymentReminderTemplate(params: {
  businessName: string
  customerName: string
  orderNumber: string
  outstanding: number
  dueDate: string // ISO date — may be in the past
  businessPhone: string
}): string {
  const overdue = new Date(params.dueDate) < new Date()
  return [
    `Dear ${params.customerName},`,
    ``,
    overdue
      ? `This is a reminder that Invoice ${params.orderNumber} for ${formatGhs(params.outstanding)} was due on ${formatDate(params.dueDate)} and remains outstanding.`
      : `This is a friendly reminder that Invoice ${params.orderNumber} for ${formatGhs(params.outstanding)} is due on ${formatDate(params.dueDate)}.`,
    ``,
    `Please arrange payment at your earliest convenience.`,
    ``,
    `For any queries, please contact us on ${params.businessPhone}.`,
    ``,
    `Thank you,`,
    `${params.businessName}`,
  ]
    .join('\n')
    .trim()
}

/**
 * Customer account statement summary.
 * Sent when business owner shares a customer's statement.
 */
export function customerStatementTemplate(params: {
  businessName: string
  customerName: string
  outstandingTotal: number
  invoiceCount?: number
  oldestDueDate?: string
  statementUrl?: string
}): string {
  return [
    `Dear ${params.customerName},`,
    ``,
    `Your account statement from ${params.businessName}:`,
    ``,
    `Outstanding balance: ${formatGhs(params.outstandingTotal)}`,
    params.invoiceCount != null ? `Open invoices: ${params.invoiceCount}` : '',
    params.oldestDueDate ? `Oldest due date: ${formatDate(params.oldestDueDate)}` : '',
    ``,
    params.statementUrl ? `View full statement: ${params.statementUrl}` : '',
    params.statementUrl ? `` : '',
    `Please contact us to arrange payment.`,
    `${params.businessName}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Owner-facing templates ─────────────────────────────────────────────────

/**
 * Payment received notification to the business owner.
 * Sent by BizSense to the owner's own WhatsApp as a transaction alert.
 */
export function paymentReceivedOwnerTemplate(params: {
  customerName: string
  amount: number
  paymentMethod: string
  orderNumber: string
  momoReference?: string
  timestamp: string // ISO
}): string {
  const methodLabel: Record<string, string> = {
    cash: 'Cash',
    mtn_momo: 'MTN MoMo',
    telecel: 'Telecel Cash',
    airteltigo: 'AirtelTigo Money',
    bank: 'Bank Transfer',
  }
  return [
    `💰 Payment received`,
    ``,
    `From: ${params.customerName}`,
    `Amount: ${formatGhs(params.amount)}`,
    `Method: ${methodLabel[params.paymentMethod] ?? params.paymentMethod}`,
    `Invoice: ${params.orderNumber}`,
    params.momoReference ? `MoMo Ref: ${params.momoReference}` : '',
    `Time: ${new Date(params.timestamp).toLocaleString('en-GH')}`,
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * Low stock alert to business owner.
 * Lists products below reorder level.
 */
export function lowStockAlertTemplate(params: {
  businessName: string
  products: Array<{
    name: string
    currentStock: number
    reorderLevel: number
    unit: string
  }>
}): string {
  const lines = params.products.map(
    (p) => `• ${p.name}: ${p.currentStock} ${p.unit} remaining (reorder at ${p.reorderLevel})`,
  )
  return [
    `⚠️ Low stock alert — ${params.businessName}`,
    ``,
    `The following products need restocking:`,
    ``,
    ...lines,
    ``,
    `Log in to BizSense to create a purchase order.`,
  ]
    .join('\n')
    .trim()
}

/**
 * Overdue invoices digest — sent to business owner.
 * Lists customers with invoices overdue > 30 days.
 */
export function overdueInvoicesTemplate(params: {
  businessName: string
  invoices: Array<{
    customerName: string
    orderNumber: string
    outstanding: number
    daysOverdue: number
  }>
  totalOutstanding: number
}): string {
  const lines = params.invoices.map(
    (i) =>
      `• ${i.customerName} — ${formatGhs(i.outstanding)} (${i.orderNumber}, ${i.daysOverdue} days overdue)`,
  )
  return [
    `📋 Overdue invoices — ${params.businessName}`,
    ``,
    `The following invoices are more than 30 days overdue:`,
    ``,
    ...lines,
    ``,
    `Total outstanding: ${formatGhs(params.totalOutstanding)}`,
    ``,
    `Log in to BizSense to send reminders or record payments.`,
  ]
    .join('\n')
    .trim()
}

/**
 * Supplier PO summary — sent to supplier via WhatsApp.
 * Consolidated from Sprint 6.
 */
export function purchaseOrderTemplate(params: {
  supplierName: string
  businessName: string
  poNumber: string
  lines: Array<{ description: string; quantity: number; unitCost: number }>
  totalAmount: number
  expectedDate?: string
}): string {
  const lineItems = params.lines.map(
    (l) => `  ${l.description} — qty: ${l.quantity} @ ${formatGhs(l.unitCost)}`,
  )
  return [
    `Dear ${params.supplierName},`,
    ``,
    `Please find our Purchase Order from ${params.businessName}:`,
    ``,
    `PO Number: ${params.poNumber}`,
    params.expectedDate ? `Expected delivery: ${formatDate(params.expectedDate)}` : '',
    ``,
    `Items:`,
    ...lineItems,
    ``,
    `Total: ${formatGhs(params.totalAmount)}`,
    ``,
    `Please confirm receipt of this order.`,
    `${params.businessName}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
