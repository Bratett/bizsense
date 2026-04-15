import { describe, it, expect } from 'vitest'
import {
  invoiceTemplate,
  paymentReminderTemplate,
  lowStockAlertTemplate,
  overdueInvoicesTemplate,
  purchaseOrderTemplate,
} from '../templates'

describe('invoiceTemplate', () => {
  it('contains order number, formatted amount, and invoice URL', () => {
    const result = invoiceTemplate({
      businessName: 'Acme Traders',
      customerName: 'Kofi Mensah',
      orderNumber: 'ORD-0042',
      totalAmount: 250,
      dueDate: '2026-04-30',
      invoiceUrl: 'https://example.com/invoice.pdf',
    })
    expect(result).toContain('ORD-0042')
    expect(result).toContain('GHS 250.00')
    expect(result).toContain('https://example.com/invoice.pdf')
  })
})

describe('paymentReminderTemplate', () => {
  it('uses past tense "was due on" when invoice is overdue', () => {
    const result = paymentReminderTemplate({
      businessName: 'Acme Traders',
      customerName: 'Ama Owusu',
      orderNumber: 'ORD-0010',
      outstanding: 500,
      dueDate: '2025-01-01', // clearly in the past
      businessPhone: '0244000000',
    })
    expect(result).toContain('was due on')
  })

  it('uses future tense "is due on" when invoice is not yet overdue', () => {
    const result = paymentReminderTemplate({
      businessName: 'Acme Traders',
      customerName: 'Ama Owusu',
      orderNumber: 'ORD-0011',
      outstanding: 500,
      dueDate: '2030-12-31', // far future
      businessPhone: '0244000000',
    })
    expect(result).toContain('is due on')
  })
})

describe('lowStockAlertTemplate', () => {
  it('lists each product with name, current stock, and reorder level', () => {
    const result = lowStockAlertTemplate({
      businessName: 'Acme Traders',
      products: [
        { name: 'Cement 50kg', currentStock: 3, reorderLevel: 10, unit: 'bags' },
        { name: 'Steel Rods', currentStock: 1, reorderLevel: 5, unit: 'bundles' },
      ],
    })
    expect(result).toContain('Cement 50kg')
    expect(result).toContain('3 bags remaining')
    expect(result).toContain('reorder at 10')
    expect(result).toContain('Steel Rods')
    expect(result).toContain('1 bundles remaining')
    expect(result).toContain('reorder at 5')
  })
})

describe('overdueInvoicesTemplate', () => {
  it('total outstanding equals the sum of individual invoice amounts', () => {
    const invoices = [
      { customerName: 'Kwame Asante', orderNumber: 'ORD-001', outstanding: 300, daysOverdue: 45 },
      { customerName: 'Abena Boateng', orderNumber: 'ORD-002', outstanding: 700, daysOverdue: 60 },
    ]
    const total = invoices.reduce((s, i) => s + i.outstanding, 0) // 1000

    const result = overdueInvoicesTemplate({
      businessName: 'Acme Traders',
      invoices,
      totalOutstanding: total,
    })

    expect(result).toContain('GHS 1,000.00')
    expect(result).toContain('Kwame Asante')
    expect(result).toContain('Abena Boateng')
  })
})

describe('purchaseOrderTemplate', () => {
  it('contains all line items', () => {
    const result = purchaseOrderTemplate({
      supplierName: 'BuildCo Ltd',
      businessName: 'Acme Traders',
      poNumber: 'PO-0005',
      lines: [
        { description: 'Cement 50kg', quantity: 20, unitCost: 85 },
        { description: 'Sand (ton)', quantity: 5, unitCost: 200 },
      ],
      totalAmount: 2700,
    })
    expect(result).toContain('Cement 50kg')
    expect(result).toContain('qty: 20')
    expect(result).toContain('Sand (ton)')
    expect(result).toContain('qty: 5')
    expect(result).toContain('PO-0005')
  })
})
