import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { goodsReceivedNotes, suppliers, supplierPayments } from '@/db/schema'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | '31-60' | '61-90' | 'over90'

export type AgingBucketTotals = {
  current: number
  days31to60: number
  days61to90: number
  over90: number
  total: number
}

export type AllocatedGrn = {
  grnId: string
  grnNumber: string
  receivedDate: string
  dueDate: string
  originalAmount: number
  amountPaid: number
  outstanding: number
  ageInDays: number
  bucket: AgingBucket
}

export type SupplierAgingRow = {
  supplierId: string
  supplierName: string
  phone: string | null
  creditTermsDays: number
  grns: AllocatedGrn[]
  totals: AgingBucketTotals
}

export type PayablesAgingReport = {
  generatedAt: Date
  suppliers: SupplierAgingRow[]
  grandTotals: AgingBucketTotals
}

type GrnRecord = {
  id: string
  grnNumber: string
  receivedDate: string
  originalAmount: number
  supplierId: string
}

type PaymentRecord = {
  id: string
  grnId: string | null
  amount: number
  paymentDate: string
}

// ─── allocatePaymentsToGrns ───────────────────────────────────────────────────
//
// Pure function — no DB calls. Testable in isolation.
//
// Allocation rules:
//   1. Payments linked to a specific grnId → applied directly to that GRN
//   2. Unlinked payments → allocated to oldest outstanding GRN first (FIFO)
//
// GRNs are sorted by receivedDate ASC (oldest first) to determine FIFO order.
// Payments within each category are sorted by paymentDate ASC.

export function allocatePaymentsToGrns(
  grns: GrnRecord[],
  payments: PaymentRecord[],
): Array<GrnRecord & { amountPaid: number }> {
  // Track remaining balance per GRN
  const remaining = new Map<string, number>()
  for (const grn of grns) {
    remaining.set(grn.id, grn.originalAmount)
  }

  // Sort GRNs by receivedDate ASC for FIFO reference
  const sortedGrns = [...grns].sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))

  // Sort payments by paymentDate ASC
  const sortedPayments = [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))

  const paid = new Map<string, number>()
  for (const grn of grns) {
    paid.set(grn.id, 0)
  }

  for (const payment of sortedPayments) {
    let leftover = payment.amount

    if (payment.grnId && remaining.has(payment.grnId)) {
      // Linked payment — apply directly to the specified GRN
      const rem = remaining.get(payment.grnId)!
      const applied = Math.min(leftover, rem)
      remaining.set(payment.grnId, rem - applied)
      paid.set(payment.grnId, (paid.get(payment.grnId) ?? 0) + applied)
    } else {
      // Unlinked payment — FIFO: apply to oldest outstanding GRN first
      for (const grn of sortedGrns) {
        if (leftover <= 0) break
        const rem = remaining.get(grn.id) ?? 0
        if (rem <= 0) continue

        const applied = Math.min(leftover, rem)
        remaining.set(grn.id, rem - applied)
        paid.set(grn.id, (paid.get(grn.id) ?? 0) + applied)
        leftover -= applied
      }
    }
  }

  return grns.map((grn) => ({
    ...grn,
    amountPaid: Math.round((paid.get(grn.id) ?? 0) * 100) / 100,
  }))
}

// ─── Bucket helpers ───────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function assignBucket(ageInDays: number): AgingBucket {
  if (ageInDays <= 30) return 'current'
  if (ageInDays <= 60) return '31-60'
  if (ageInDays <= 90) return '61-90'
  return 'over90'
}

function emptyBuckets(): AgingBucketTotals {
  return { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 }
}

function addToBuckets(totals: AgingBucketTotals, amount: number, bucket: AgingBucket): void {
  totals.total = Math.round((totals.total + amount) * 100) / 100
  if (bucket === 'current') totals.current = Math.round((totals.current + amount) * 100) / 100
  else if (bucket === '31-60') totals.days31to60 = Math.round((totals.days31to60 + amount) * 100) / 100
  else if (bucket === '61-90') totals.days61to90 = Math.round((totals.days61to90 + amount) * 100) / 100
  else totals.over90 = Math.round((totals.over90 + amount) * 100) / 100
}

// ─── computePayablesAging ─────────────────────────────────────────────────────

export async function computePayablesAging(businessId: string): Promise<PayablesAgingReport> {
  const today = new Date().toISOString().split('T')[0]

  // ── Fetch all confirmed GRNs with supplier data ─────────────────────────────
  const grnRows = await db
    .select({
      id: goodsReceivedNotes.id,
      grnNumber: goodsReceivedNotes.grnNumber,
      receivedDate: goodsReceivedNotes.receivedDate,
      totalCost: goodsReceivedNotes.totalCost,
      supplierId: goodsReceivedNotes.supplierId,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      creditTermsDays: suppliers.creditTermsDays,
    })
    .from(goodsReceivedNotes)
    .innerJoin(suppliers, eq(goodsReceivedNotes.supplierId, suppliers.id))
    .where(
      and(
        eq(goodsReceivedNotes.businessId, businessId),
        eq(goodsReceivedNotes.status, 'confirmed'),
      ),
    )

  // ── Fetch all supplier payments for this business ───────────────────────────
  const paymentRows = await db
    .select({
      id: supplierPayments.id,
      supplierId: supplierPayments.supplierId,
      grnId: supplierPayments.grnId,
      amount: supplierPayments.amount,
      paymentDate: supplierPayments.paymentDate,
    })
    .from(supplierPayments)
    .where(eq(supplierPayments.businessId, businessId))

  // ── Group by supplier ───────────────────────────────────────────────────────
  const supplierMap = new Map<
    string,
    {
      supplierName: string
      supplierPhone: string | null
      creditTermsDays: number
      grns: GrnRecord[]
      payments: PaymentRecord[]
    }
  >()

  for (const row of grnRows) {
    if (!supplierMap.has(row.supplierId)) {
      supplierMap.set(row.supplierId, {
        supplierName: row.supplierName,
        supplierPhone: row.supplierPhone,
        creditTermsDays: row.creditTermsDays,
        grns: [],
        payments: [],
      })
    }
    supplierMap.get(row.supplierId)!.grns.push({
      id: row.id,
      grnNumber: row.grnNumber,
      receivedDate: row.receivedDate,
      originalAmount: Math.round(Number(row.totalCost ?? '0') * 100) / 100,
      supplierId: row.supplierId,
    })
  }

  for (const p of paymentRows) {
    const entry = supplierMap.get(p.supplierId)
    if (entry) {
      entry.payments.push({
        id: p.id,
        grnId: p.grnId,
        amount: Math.round(Number(p.amount) * 100) / 100,
        paymentDate: p.paymentDate,
      })
    }
  }

  // ── Build report per supplier ───────────────────────────────────────────────
  const grandTotals = emptyBuckets()
  const supplierRows: SupplierAgingRow[] = []

  for (const [supplierId, entry] of supplierMap.entries()) {
    const allocated = allocatePaymentsToGrns(entry.grns, entry.payments)
    const supplierTotals = emptyBuckets()
    const outstandingGrns: AllocatedGrn[] = []

    for (const grn of allocated) {
      const outstanding = Math.round((grn.originalAmount - grn.amountPaid) * 100) / 100
      if (outstanding <= 0) continue // fully paid — exclude from report

      const dueDate = addDays(grn.receivedDate, entry.creditTermsDays)
      const rawAge = daysBetween(dueDate, today) // positive if overdue
      const ageInDays = Math.max(0, rawAge)
      const bucket = assignBucket(ageInDays)

      outstandingGrns.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        receivedDate: grn.receivedDate,
        dueDate,
        originalAmount: grn.originalAmount,
        amountPaid: grn.amountPaid,
        outstanding,
        ageInDays,
        bucket,
      })

      addToBuckets(supplierTotals, outstanding, bucket)
    }

    if (outstandingGrns.length === 0) continue // no outstanding payables for this supplier

    supplierRows.push({
      supplierId,
      supplierName: entry.supplierName,
      phone: entry.supplierPhone,
      creditTermsDays: entry.creditTermsDays,
      grns: outstandingGrns,
      totals: supplierTotals,
    })

    addToBuckets(grandTotals, supplierTotals.current, 'current')
    addToBuckets(grandTotals, supplierTotals.days31to60, '31-60')
    addToBuckets(grandTotals, supplierTotals.days61to90, '61-90')
    addToBuckets(grandTotals, supplierTotals.over90, 'over90')
  }

  // Re-calculate grand total from buckets to avoid double-counting
  grandTotals.total = Math.round(
    (grandTotals.current + grandTotals.days31to60 + grandTotals.days61to90 + grandTotals.over90) * 100,
  ) / 100

  return {
    generatedAt: new Date(),
    suppliers: supplierRows.sort((a, b) => b.totals.total - a.totals.total),
    grandTotals,
  }
}
