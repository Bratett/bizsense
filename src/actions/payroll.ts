'use server'

import { and, asc, count, desc, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import { db } from '@/db'
import { payeBands, payrollLines, payrollRuns, staff } from '@/db/schema/payroll'
import { businesses, users } from '@/db/schema/core'
import { accounts } from '@/db/schema/accounts'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { atomicTransactionWrite } from '@/lib/atomic'
import type { PostJournalEntryInput } from '@/lib/ledger'
import {
  computePayrollDeductions,
  verifyPayrollBalance,
  type PayeBand,
  type PayrollDeductions,
} from '@/lib/payroll/paye'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayrollRunSummary = {
  id: string
  periodStart: string
  periodEnd: string
  status: string
  totalGross: string | null
  totalDeductions: string | null
  totalNet: string | null
  createdAt: Date
  staffCount: number
}

export type PayrollLineDetail = {
  id: string
  staffId: string
  staffName: string
  grossSalary: string
  ssnitEmployee: string
  ssnitEmployer: string
  payeTax: string
  otherDeductions: string
  netSalary: string
  paymentMethod: string | null
  paymentReference: string | null
  isPaid: boolean
  paidAt: Date | null
}

export type PayslipData = {
  business: { name: string; phone: string | null; address: string | null }
  staff: {
    fullName: string
    roleTitle: string | null
    ssnitNumber: string | null
    tin: string | null
    phone: string | null
    momoNumber: string | null
  }
  period: { start: string; end: string }
  line: {
    grossSalary: string
    ssnitEmployee: string
    ssnitEmployer: string
    payeTax: string
    otherDeductions: string
    netSalary: string
    totalCostToEmployer: string
    isPaid: boolean
    paidAt: Date | null
    paymentMethod: string | null
    paymentReference: string | null
  }
}

export type PayrollRunWithLines = {
  id: string
  businessId: string
  periodStart: string
  periodEnd: string
  status: string
  totalGross: string | null
  totalDeductions: string | null
  totalNet: string | null
  journalEntryId: string | null
  approvedBy: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  lines: PayrollLineDetail[]
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function fetchPayeBands(businessId: string): Promise<PayeBand[]> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await db
    .select({
      lowerBound: payeBands.lowerBound,
      upperBound: payeBands.upperBound,
      rate: payeBands.rate,
    })
    .from(payeBands)
    .where(
      and(
        eq(payeBands.businessId, businessId),
        lte(payeBands.effectiveFrom, today),
        or(isNull(payeBands.effectiveTo), gte(payeBands.effectiveTo, today)),
      ),
    )
    .orderBy(payeBands.lowerBound)

  return rows.map((r) => ({
    lowerBound: Number(r.lowerBound),
    upperBound: r.upperBound !== null ? Number(r.upperBound) : null,
    rate: Number(r.rate),
  }))
}

async function fetchAccountByCode(businessId: string, code: string) {
  const [acct] = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), eq(accounts.code, code)))
  if (!acct) throw new Error(`Required account ${code} not found. Please complete business setup.`)
  return acct
}

async function resolvePayrollAccounts(businessId: string): Promise<Record<string, string>> {
  const codes = ['6001', '2200', '2300', '2500']
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, codes)))

  const map = Object.fromEntries(rows.map((a) => [a.code, a.id])) as Record<string, string>

  for (const code of codes) {
    if (!map[code]) {
      throw new Error(
        `Required payroll account ${code} not found. Please complete business setup.`,
      )
    }
  }

  return map
}

// ─── getPayrollRunById ────────────────────────────────────────────────────────

export async function getPayrollRunById(runId: string): Promise<PayrollRunWithLines> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.businessId, businessId)))

  if (!run) throw new Error('Payroll run not found')

  const lineRows = await db
    .select({
      id: payrollLines.id,
      staffId: payrollLines.staffId,
      staffName: staff.fullName,
      grossSalary: payrollLines.grossSalary,
      ssnitEmployee: payrollLines.ssnitEmployee,
      ssnitEmployer: payrollLines.ssnitEmployer,
      payeTax: payrollLines.payeTax,
      otherDeductions: payrollLines.otherDeductions,
      netSalary: payrollLines.netSalary,
      paymentMethod: payrollLines.paymentMethod,
      paymentReference: payrollLines.paymentReference,
      isPaid: payrollLines.isPaid,
      paidAt: payrollLines.paidAt,
    })
    .from(payrollLines)
    .innerJoin(staff, eq(payrollLines.staffId, staff.id))
    .where(eq(payrollLines.payrollRunId, runId))
    .orderBy(asc(staff.fullName))

  return { ...run, lines: lineRows }
}

// ─── getPayrollRuns ───────────────────────────────────────────────────────────

export async function getPayrollRuns(): Promise<PayrollRunSummary[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  const runs = await db
    .select({
      id: payrollRuns.id,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
      totalGross: payrollRuns.totalGross,
      totalDeductions: payrollRuns.totalDeductions,
      totalNet: payrollRuns.totalNet,
      createdAt: payrollRuns.createdAt,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.businessId, businessId))
    .orderBy(desc(payrollRuns.periodStart))

  if (runs.length === 0) return []

  const runIds = runs.map((r) => r.id)
  const countRows = await db
    .select({
      runId: payrollLines.payrollRunId,
      staffCount: count(payrollLines.id),
    })
    .from(payrollLines)
    .where(inArray(payrollLines.payrollRunId, runIds))
    .groupBy(payrollLines.payrollRunId)

  const countMap = Object.fromEntries(countRows.map((r) => [r.runId, Number(r.staffCount)]))

  return runs.map((r) => ({
    ...r,
    staffCount: countMap[r.id] ?? 0,
  }))
}

// ─── initiatePayrollRun ───────────────────────────────────────────────────────

export async function initiatePayrollRun(input: {
  periodStart: string
  periodEnd: string
}): Promise<{ runId: string }> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // 1. Check for existing run for this period
  const existing = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.periodStart, input.periodStart),
        eq(payrollRuns.periodEnd, input.periodEnd),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    throw new Error(
      'A payroll run already exists for this period. Edit or delete the existing run.',
    )
  }

  // 2. Fetch all active staff
  const activeStaff = await db
    .select()
    .from(staff)
    .where(and(eq(staff.businessId, businessId), eq(staff.isActive, true)))
    .orderBy(asc(staff.fullName))

  if (activeStaff.length === 0) {
    throw new Error('No active staff members found. Add staff before processing payroll.')
  }

  // 3. Fetch active PAYE bands
  const bands = await fetchPayeBands(businessId)

  if (bands.length === 0) {
    throw new Error(
      'PAYE bands not configured. Contact support to seed the tax configuration.',
    )
  }

  // 4. Compute deductions for each staff member
  const lineData = activeStaff.map((member) => {
    const gross = Number(member.baseSalary ?? 0)
    const deductions = computePayrollDeductions(gross, bands)
    return {
      staffId: member.id,
      grossSalary: String(deductions.grossSalary),
      ssnitEmployee: String(deductions.ssnitEmployee),
      ssnitEmployer: String(deductions.ssnitEmployer),
      payeTax: String(deductions.payeTax),
      otherDeductions: '0',
      netSalary: String(deductions.netSalary),
    }
  })

  const totalGross = lineData.reduce((s, l) => s + Number(l.grossSalary), 0)
  const totalDeductions = lineData.reduce(
    (s, l) => s + Number(l.ssnitEmployee) + Number(l.payeTax),
    0,
  )
  const totalNet = lineData.reduce((s, l) => s + Number(l.netSalary), 0)

  // 5. Insert payrollRun + lines atomically (no journal entry at draft stage)
  const runId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(payrollRuns)
      .values({
        businessId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'draft',
        totalGross: String(Math.round(totalGross * 100) / 100),
        totalDeductions: String(Math.round(totalDeductions * 100) / 100),
        totalNet: String(Math.round(totalNet * 100) / 100),
        createdBy: user.id,
      })
      .returning({ id: payrollRuns.id })

    await tx.insert(payrollLines).values(
      lineData.map((l) => ({ ...l, payrollRunId: run.id })),
    )

    return run.id
  })

  return { runId }
}

// ─── updatePayrollLine ────────────────────────────────────────────────────────

export async function updatePayrollLine(
  lineId: string,
  updates: { otherDeductions?: number },
): Promise<{ lineId: string; totalGross: string; totalDeductions: string; totalNet: string }> {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const { businessId } = user

  // 1. Fetch line + run with ownership and draft-status check
  const [lineRow] = await db
    .select({
      lineId: payrollLines.id,
      runId: payrollRuns.id,
      grossSalary: payrollLines.grossSalary,
      currentOtherDeductions: payrollLines.otherDeductions,
    })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollLines.payrollRunId, payrollRuns.id))
    .where(
      and(
        eq(payrollLines.id, lineId),
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.status, 'draft'),
      ),
    )

  if (!lineRow) {
    throw new Error('Payroll line not found or run is not in draft status.')
  }

  // 2. Fetch active PAYE bands
  const bands = await fetchPayeBands(businessId)

  // 3. Recompute deductions
  const gross = Number(lineRow.grossSalary)
  const other = updates.otherDeductions ?? Number(lineRow.currentOtherDeductions)
  const deductions = computePayrollDeductions(gross, bands, other)

  // 4. Update line + recalculate run totals in a single transaction
  const result = await db.transaction(async (tx) => {
    await tx
      .update(payrollLines)
      .set({
        otherDeductions: String(other),
        ssnitEmployee: String(deductions.ssnitEmployee),
        ssnitEmployer: String(deductions.ssnitEmployer),
        payeTax: String(deductions.payeTax),
        netSalary: String(deductions.netSalary),
        updatedAt: new Date(),
      })
      .where(eq(payrollLines.id, lineId))

    // Read all updated lines to recompute run-level totals
    const allLines = await tx
      .select({
        grossSalary: payrollLines.grossSalary,
        ssnitEmployee: payrollLines.ssnitEmployee,
        payeTax: payrollLines.payeTax,
        netSalary: payrollLines.netSalary,
      })
      .from(payrollLines)
      .where(eq(payrollLines.payrollRunId, lineRow.runId))

    const newTotalGross = Math.round(allLines.reduce((s, l) => s + Number(l.grossSalary), 0) * 100) / 100
    const newTotalDeductions = Math.round(
      allLines.reduce((s, l) => s + Number(l.ssnitEmployee) + Number(l.payeTax), 0) * 100,
    ) / 100
    const newTotalNet = Math.round(allLines.reduce((s, l) => s + Number(l.netSalary), 0) * 100) / 100

    await tx
      .update(payrollRuns)
      .set({
        totalGross: String(newTotalGross),
        totalDeductions: String(newTotalDeductions),
        totalNet: String(newTotalNet),
        updatedAt: new Date(),
      })
      .where(eq(payrollRuns.id, lineRow.runId))

    return {
      lineId,
      totalGross: String(newTotalGross),
      totalDeductions: String(newTotalDeductions),
      totalNet: String(newTotalNet),
    }
  })

  return result
}

// ─── approvePayrollRun ────────────────────────────────────────────────────────

export async function approvePayrollRun(runId: string): Promise<{ isSingleUser: boolean }> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // 1. Fetch run — must be draft and owned by this business
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.id, runId),
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.status, 'draft'),
      ),
    )

  if (!run) throw new Error('Payroll run not found or not in draft status.')

  // 2. Segregation of duties check
  let isSingleUser = false

  if (run.createdBy && run.createdBy === user.id) {
    const [{ userCount }] = await db
      .select({ userCount: count() })
      .from(users)
      .where(eq(users.businessId, businessId))

    if (Number(userCount) > 1) {
      throw new Error(
        'You cannot approve a payroll run you created. Ask another authorised user to approve.',
      )
    }
    // Single-user business: allow but flag for UI warning
    isSingleUser = true
  }

  // 3. Fetch all payroll lines
  const lines = await db
    .select()
    .from(payrollLines)
    .where(eq(payrollLines.payrollRunId, runId))

  if (lines.length === 0) throw new Error('Payroll run has no lines.')

  // 4. Map to PayrollDeductions for balance verification
  const deductions: PayrollDeductions[] = lines.map((l) => ({
    grossSalary: Number(l.grossSalary),
    ssnitEmployee: Number(l.ssnitEmployee),
    ssnitEmployer: Number(l.ssnitEmployer),
    payeTax: Number(l.payeTax),
    otherDeductions: Number(l.otherDeductions),
    netSalary: Number(l.netSalary),
    totalCostToEmployer:
      Number(l.grossSalary) - Number(l.otherDeductions) + Number(l.ssnitEmployer),
  }))

  // 5. Verify journal balance BEFORE any writes
  const balance = verifyPayrollBalance(deductions)
  if (!balance.isBalanced) {
    throw new Error(
      `Payroll journal would be imbalanced: debits ${balance.debitTotal} ≠ credits ${balance.creditTotal}. This indicates a computation error. Please contact support.`,
    )
  }

  // 6. Resolve payroll account IDs (6001, 2200, 2300, 2500)
  const acctMap = await resolvePayrollAccounts(businessId)

  const totalDebit = balance.debitTotal
  const totalSsnit = deductions.reduce((s, l) => s + l.ssnitEmployee + l.ssnitEmployer, 0)
  const totalPaye = deductions.reduce((s, l) => s + l.payeTax, 0)
  const totalNet = deductions.reduce((s, l) => s + l.netSalary, 0)
  const periodLabel = `${run.periodStart} to ${run.periodEnd}`

  // 7. atomicTransactionWrite: post journal entry + update run status atomically
  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: run.periodEnd,
    reference: `PAY-${run.periodStart.slice(0, 7)}`,
    description: `Payroll — ${periodLabel}`,
    sourceType: 'payroll',
    sourceId: runId,
    createdBy: user.id,
    lines: [
      {
        accountId: acctMap['6001'],
        debitAmount: Math.round(totalDebit * 100) / 100,
        creditAmount: 0,
        memo: `Salaries & wages — ${periodLabel}`,
      },
      {
        accountId: acctMap['2200'],
        debitAmount: 0,
        creditAmount: Math.round(totalSsnit * 100) / 100,
        memo: `SSNIT payable — ${periodLabel}`,
      },
      {
        accountId: acctMap['2300'],
        debitAmount: 0,
        creditAmount: Math.round(totalPaye * 100) / 100,
        memo: `PAYE withheld — ${periodLabel}`,
      },
      {
        accountId: acctMap['2500'],
        debitAmount: 0,
        creditAmount: Math.round(totalNet * 100) / 100,
        memo: `Net salaries payable — ${periodLabel}`,
      },
    ],
  }

  await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    await tx
      .update(payrollRuns)
      .set({
        status: 'approved',
        journalEntryId,
        approvedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(payrollRuns.id, runId))
  })

  return { isSingleUser }
}

// ─── recordPayrollPayment ─────────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<string, string> = {
  cash: '1001',
  mtn_momo: '1002',
  telecel: '1003',
  airteltigo: '1004',
  bank: '1005',
}

export async function recordPayrollPayment(input: {
  payrollLineId: string
  paymentMethod: string
  paymentDate: string
  reference?: string
}): Promise<void> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // 1. Fetch line + run — must be approved and unpaid
  const [row] = await db
    .select({
      lineId: payrollLines.id,
      netSalary: payrollLines.netSalary,
      staffId: payrollLines.staffId,
      runId: payrollRuns.id,
      periodStart: payrollRuns.periodStart,
    })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollLines.payrollRunId, payrollRuns.id))
    .where(
      and(
        eq(payrollLines.id, input.payrollLineId),
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.status, 'approved'),
        eq(payrollLines.isPaid, false),
      ),
    )

  if (!row) {
    throw new Error('Payroll line not found, run not approved, or already paid.')
  }

  // 2. Resolve accounts
  const payAcctCode = PAYMENT_ACCOUNT_CODES[input.paymentMethod]
  if (!payAcctCode) throw new Error(`Unknown payment method: ${input.paymentMethod}`)

  const [payAcct, netSalAcct] = await Promise.all([
    fetchAccountByCode(businessId, payAcctCode),
    fetchAccountByCode(businessId, '2500'),
  ])

  // 3. Fetch staff name for description
  const [member] = await db
    .select({ fullName: staff.fullName })
    .from(staff)
    .where(eq(staff.id, row.staffId))

  const staffName = member?.fullName ?? 'Unknown staff'
  const netSalary = Number(row.netSalary)
  const reference = input.reference ?? `SPAY-${input.payrollLineId.slice(0, 8).toUpperCase()}`

  // 4. Post payment journal + mark line as paid atomically
  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: input.paymentDate,
    reference,
    description: `Salary payment — ${staffName} — ${row.periodStart}`,
    sourceType: 'payment',
    sourceId: input.payrollLineId,
    createdBy: user.id,
    lines: [
      {
        accountId: netSalAcct.id,
        debitAmount: Math.round(netSalary * 100) / 100,
        creditAmount: 0,
        memo: `Net salary — ${staffName}`,
      },
      {
        accountId: payAcct.id,
        debitAmount: 0,
        creditAmount: Math.round(netSalary * 100) / 100,
        memo: `Payment to ${staffName} via ${input.paymentMethod}`,
      },
    ],
  }

  await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    await tx
      .update(payrollLines)
      .set({
        isPaid: true,
        paidAt: new Date(),
        paymentMethod: input.paymentMethod,
        paymentReference: input.reference ?? null,
        paymentJournalEntryId: journalEntryId,
        updatedAt: new Date(),
      })
      .where(eq(payrollLines.id, input.payrollLineId))
  })

  // 5. If all lines in the run are now paid → mark run as 'paid'
  const [unpaid] = await db
    .select({ cnt: count(payrollLines.id) })
    .from(payrollLines)
    .where(
      and(
        eq(payrollLines.payrollRunId, row.runId),
        eq(payrollLines.isPaid, false),
      ),
    )

  if (Number(unpaid.cnt) === 0) {
    await db
      .update(payrollRuns)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(payrollRuns.id, row.runId))
  }
}

// ─── recordBatchPayrollPayment ────────────────────────────────────────────────

export async function recordBatchPayrollPayment(input: {
  payrollRunId: string
  paymentMethod: string
  paymentDate: string
}): Promise<{ paid: number; skipped: number }> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  // Fetch all unpaid line IDs for this approved run
  const unpaidLines = await db
    .select({ id: payrollLines.id })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollLines.payrollRunId))
    .where(
      and(
        eq(payrollLines.payrollRunId, input.payrollRunId),
        eq(payrollRuns.businessId, businessId),
        eq(payrollRuns.status, 'approved'),
        eq(payrollLines.isPaid, false),
      ),
    )

  let paid = 0
  let skipped = 0

  for (const line of unpaidLines) {
    try {
      await recordPayrollPayment({
        payrollLineId: line.id,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
      })
      paid++
    } catch {
      skipped++
    }
  }

  return { paid, skipped }
}

// ─── getPayslipData ───────────────────────────────────────────────────────────

export async function getPayslipData(payrollLineId: string): Promise<PayslipData> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select({
      // line
      grossSalary: payrollLines.grossSalary,
      ssnitEmployee: payrollLines.ssnitEmployee,
      ssnitEmployer: payrollLines.ssnitEmployer,
      payeTax: payrollLines.payeTax,
      otherDeductions: payrollLines.otherDeductions,
      netSalary: payrollLines.netSalary,
      isPaid: payrollLines.isPaid,
      paidAt: payrollLines.paidAt,
      paymentMethod: payrollLines.paymentMethod,
      paymentReference: payrollLines.paymentReference,
      // run
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      runBusinessId: payrollRuns.businessId,
      // staff
      staffFullName: staff.fullName,
      staffRoleTitle: staff.roleTitle,
      staffSsnitNumber: staff.ssnitNumber,
      staffTin: staff.tin,
      staffPhone: staff.phone,
      staffMomoNumber: staff.momoNumber,
      // business
      businessName: businesses.name,
      businessPhone: businesses.phone,
      businessAddress: businesses.address,
    })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollLines.payrollRunId, payrollRuns.id))
    .innerJoin(staff, eq(payrollLines.staffId, staff.id))
    .innerJoin(businesses, eq(payrollRuns.businessId, businesses.id))
    .where(
      and(
        eq(payrollLines.id, payrollLineId),
        eq(payrollRuns.businessId, businessId),
      ),
    )

  if (!row) throw new Error('Payroll line not found.')

  const grossNum = Number(row.grossSalary)
  const otherNum = Number(row.otherDeductions)
  const ssnitEmprNum = Number(row.ssnitEmployer)
  const totalCostToEmployer = grossNum - otherNum + ssnitEmprNum

  return {
    business: {
      name: row.businessName,
      phone: row.businessPhone,
      address: row.businessAddress,
    },
    staff: {
      fullName: row.staffFullName,
      roleTitle: row.staffRoleTitle,
      ssnitNumber: row.staffSsnitNumber,
      tin: row.staffTin,
      phone: row.staffPhone,
      momoNumber: row.staffMomoNumber,
    },
    period: { start: row.periodStart, end: row.periodEnd },
    line: {
      grossSalary: row.grossSalary,
      ssnitEmployee: row.ssnitEmployee,
      ssnitEmployer: row.ssnitEmployer,
      payeTax: row.payeTax,
      otherDeductions: row.otherDeductions,
      netSalary: row.netSalary,
      totalCostToEmployer: String(Math.round(totalCostToEmployer * 100) / 100),
      isPaid: row.isPaid,
      paidAt: row.paidAt,
      paymentMethod: row.paymentMethod,
      paymentReference: row.paymentReference,
    },
  }
}
