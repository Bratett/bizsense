// All types are plain serializable objects (no Date, no functions) for Web Worker transfer.

export type InvoiceLineItem = {
  index: number
  description: string
  quantity: number
  unitPrice: number
  unitPriceCurrency: 'GHS' | 'USD'
  discountAmount: number
  lineTotal: number
}

export type InvoiceTaxBreakdown = {
  componentCode: string
  componentName: string
  rate: number
  taxAmount: number
}

export type InvoicePayment = {
  paymentMethod: string
  paymentMethodLabel: string
  momoReference: string | null
  bankReference: string | null
  amountPaid: number
  paymentDate: string
}

export type InvoiceBusiness = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
  tin: string | null
  vatNumber: string | null
  vatRegistered: boolean
}

export type InvoiceCustomer = {
  name: string
  phone: string | null
  location: string | null
}

export type InvoiceData = {
  invoiceNumber: string
  invoiceDate: string
  invoiceLabel: 'TAX INVOICE' | 'INVOICE'

  business: InvoiceBusiness
  customer: InvoiceCustomer | null

  lines: InvoiceLineItem[]

  fxRate: number | null
  hasUsdLines: boolean

  subtotal: number
  discountAmount: number
  discountLabel: string | null
  taxableAmount: number
  taxBreakdown: InvoiceTaxBreakdown[]
  taxAmount: number
  totalAmount: number

  payment: InvoicePayment | null
  balanceDue: number

  footerBusinessName: string
  footerBusinessPhone: string | null
}
