'use server'

import { and, asc, eq, desc, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { suppliers, supplierPayments, accounts, goodsReceivedNotes, businesses } from '@/db/schema'
import { requireRole } from '@/lib/auth/requireRole'
import { atomicTransactionWrite } from '@/lib/atomic'
import { getSupplierApBalance } from '@/lib/suppliers/apBalance'
import type { PostJournalEntryInput } from '@/lib/ledger'
import type { SupplierStatementData } from '@/lib/pdf/supplierStatementDocument'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'momo_mtn' | 'momo_telecel' | 'momo_airtel' | 'bank'

export type RecordSupplierPaymentInput = {
  supplierId: string
  grnId?: string
  amount: number
  paymentMethod: PaymentMethod
  paymentDate: string // ISO date YYYY-MM-DD
  momoReference?: string
  bankReference?: string
  notes?: string
}

export type SupplierPaymentRow = {
  id: string
  businessId: string
  supplierId: string
  grnId: string | null
  amount: string
  paymentMethod: string
  paymentDate: string
  momoReference: string | null
  bankReference: string | null
  notes: string | null
  journalEntryId: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type RecordSupplierPaymentResult = {
  payment: SupplierPaymentRow
  warningOverpayment: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<PaymentMethod, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

const AP_ACCOUNT_CODE = '2001'

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'momo_mtn',
  'momo_telecel',
  'momo_airtel',
  'bank',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveAccountIds(
  businessId: string,
  codes: string[],
): Promise<Record<string, string>> {
  const uniqueCodes = [...new Set(codes)]
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, uniqueCodes)))

  return Object.fromEntries(rows.map((a) => [a.code, a.id])) as Record<string, string>
}

// ─── recordSupplierPayment ───────────────────────────────────────────────────

export async function recordSupplierPayment(
  input: RecordSupplierPaymentInput,
): Promise<RecordSupplierPaymentResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId, id: userId } = user

  // ── Validate input ──────────────────────────────────────────────────────────
  if (!input.supplierId) throw new Error('Supplier ID is required')
  if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
    throw new Error(`Invalid payment method: ${input.paymentMethod}`)
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error('Payment amount must be greater than 0')
  }
  if (!input.paymentDate) throw new Error('Payment date is required')

  // ── Verify supplier belongs to this business ────────────────────────────────
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, businessId)))

  if (!supplier) throw new Error('Supplier not found')

  // ── Check outstanding balance ───────────────────────────────────────────────
  const outstanding = await getSupplierApBalance(input.supplierId, businessId)
  const warningOverpayment = input.amount > outstanding

  // ── Resolve account IDs ─────────────────────────────────────────────────────
  const paymentCode = PAYMENT_ACCOUNT_CODES[input.paymentMethod]
  const accountMap = await resolveAccountIds(businessId, [AP_ACCOUNT_CODE, paymentCode])

  const apAccountId = accountMap[AP_ACCOUNT_CODE]
  const paymentAccountId = accountMap[paymentCode]

  if (!apAccountId) throw new Error('Accounts Payable account (2001) not found for this business')
  if (!paymentAccountId) throw new Error(`Payment account (${paymentCode}) not found for this business`)

  // ── Build journal entry ─────────────────────────────────────────────────────
  const amountStr = input.amount.toFixed(2)
  const reference = `SPAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: input.paymentDate,
    reference,
    description: `Supplier payment`,
    sourceType: 'payment',
    createdBy: userId,
    lines: [
      {
        accountId: apAccountId,
        debitAmount: input.amount,
        creditAmount: 0,
        memo: `Payment to supplier — ${reference}`,
      },
      {
        accountId: paymentAccountId,
        debitAmount: 0,
        creditAmount: input.amount,
        memo: `Supplier payment via ${input.paymentMethod}`,
      },
    ],
  }

  // ── Atomic write ────────────────────────────────────────────────────────────
  const payment = await atomicTransactionWrite(
    journalInput,
    async (tx, journalEntryId) => {
      const [inserted] = await tx
        .insert(supplierPayments)
        .values({
          businessId,
          supplierId: input.supplierId,
          grnId: input.grnId ?? null,
          amount: amountStr,
          paymentMethod: input.paymentMethod,
          paymentDate: input.paymentDate,
          momoReference: input.momoReference ?? null,
          bankReference: input.bankReference ?? null,
          notes: input.notes ?? null,
          journalEntryId,
          createdBy: userId,
        })
        .returning()

      return inserted
    },
  )

  return { payment, warningOverpayment }
}

// ─── listSupplierPayments ────────────────────────────────────────────────────

export async function listSupplierPayments(supplierId: string): Promise<SupplierPaymentRow[]> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // Verify supplier belongs to business
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.businessId, businessId)))

  if (!supplier) throw new Error('Supplier not found')

  const rows = await db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.supplierId, supplierId),
        eq(supplierPayments.businessId, businessId),
      ),
    )
    .orderBy(desc(supplierPayments.paymentDate))

  return rows
}

// ─── getSupplierStatementData ────────────────────────────────────────────────

export async function getSupplierStatementData(
  supplierId: string,
): Promise<SupplierStatementData> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // Business info
  const [business] = await db
    .select({ name: businesses.name, address: businesses.address, phone: businesses.phone, tin: businesses.tin })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  // Supplier info
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.businessId, businessId)))

  if (!supplier) throw new Error('Supplier not found')

  // GRNs for this supplier
  const grns = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      receivedDate: goodsReceivedNotes.receivedDate,
      totalCost: goodsReceivedNotes.totalCost,
    })
    .from(goodsReceivedNotes)
    .where(
      and(
        eq(goodsReceivedNotes.supplierId, supplierId),
        eq(goodsReceivedNotes.businessId, businessId),
        eq(goodsReceivedNotes.status, 'confirmed'),
      ),
    )
    .orderBy(asc(goodsReceivedNotes.receivedDate))

  // Payments for this supplier
  const payments = await db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.supplierId, supplierId),
        eq(supplierPayments.businessId, businessId),
      ),
    )
    .orderBy(asc(supplierPayments.paymentDate))

  // Build statement rows sorted by date
  type RawRow = {
    date: string
    reference: string
    description: string
    debit: number
    credit: number
  }

  const rawRows: RawRow[] = [
    ...grns.map((g) => ({
      date: g.receivedDate,
      reference: g.grnNumber,
      description: 'Goods received',
      debit: Math.round(Number(g.totalCost ?? '0') * 100) / 100,
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      reference: `SPAY-${p.id.slice(0, 8).toUpperCase()}`,
      description: `Payment (${p.paymentMethod.replace('_', ' ')})`,
      debit: 0,
      credit: Math.round(Number(p.amount) * 100) / 100,
    })),
  ]

  rawRows.sort((a, b) => a.date.localeCompare(b.date))

  // Build running balance
  let runningBalance = 0
  const rows = rawRows.map((r) => {
    runningBalance = Math.round((runningBalance + r.debit - r.credit) * 100) / 100
    const [y, m, d] = r.date.split('-')
    return {
      date: `${d}/${m}/${y}`,
      reference: r.reference,
      description: r.description,
      debit: r.debit,
      credit: r.credit,
      balance: runningBalance,
    }
  })

  const asAt = new Date().toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const fromDate = rows.length > 0 ? rows[0].date : asAt
  const toDate = asAt

  return {
    business: {
      name: business?.name ?? '',
      address: business?.address ?? null,
      phone: business?.phone ?? null,
      tin: business?.tin ?? null,
    },
    supplier: {
      name: supplier.name,
      phone: supplier.phone,
      location: supplier.location,
    },
    dateRange: { from: fromDate, to: toDate },
    rows,
    outstandingBalance: runningBalance,
    asAt,
  }
}
