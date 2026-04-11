'use server'

import { and, eq, desc, gte, lte, ilike, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, expenses, businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { requireRole } from '@/lib/auth/requireRole'
import { atomicTransactionWrite } from '@/lib/atomic'
import { reverseJournalEntry } from '@/lib/ledger'
import type { JournalLineInput, PostJournalEntryInput } from '@/lib/ledger'
import { reverseCalculateVat } from '@/lib/expenses/vatReverse'
import {
  categoryToAccountCode,
  FIXED_ASSETS_ACCOUNT_CODE,
  INPUT_VAT_ACCOUNT_CODE,
} from '@/lib/expenses/categories'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'momo_mtn' | 'momo_telecel' | 'momo_airtel' | 'bank'

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly'

export type CreateExpenseInput = {
  expenseDate: string
  category: string
  amount: number
  paymentMethod: PaymentMethod
  description: string
  includesVat?: boolean
  isCapitalExpense?: boolean
  supplierId?: string
  notes?: string
  receiptUrl?: string
  momoReference?: string
  bankReference?: string
  isRecurring?: boolean
  recurrenceFrequency?: RecurrenceFrequency
}

export type ExpenseActionResult =
  | { success: true; expenseId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export type ExpenseListItem = {
  id: string
  expenseDate: string
  category: string | null
  description: string
  amount: string
  paymentMethod: string
  approvalStatus: string
  isCapitalExpense: boolean
  accountName: string | null
  receiptUrl: string | null
}

export type ExpenseDetail = {
  id: string
  expenseDate: string
  category: string | null
  description: string
  amount: string
  paymentMethod: string
  approvalStatus: string
  isCapitalExpense: boolean
  accountId: string
  accountName: string | null
  accountCode: string | null
  supplierId: string | null
  receiptUrl: string | null
  notes: string | null
  journalEntryId: string | null
  approvedBy: string | null
  approvedAt: Date | null
  createdBy: string | null
  createdAt: Date
}

export type ExpenseSummary = {
  totalByCategory: Array<{ category: string; total: number }>
  grandTotal: number
  pendingApprovalTotal: number
  pendingApprovalCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<PaymentMethod, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'momo_mtn',
  'momo_telecel',
  'momo_airtel',
  'bank',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveAccountIds(businessId: string, codes: string[]) {
  const uniqueCodes = [...new Set(codes)]
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.businessId, businessId), inArray(accounts.code, uniqueCodes)))

  return Object.fromEntries(rows.map((a) => [a.code, a.id])) as Record<string, string>
}

function buildExpenseJournalLines(
  expenseAccountId: string,
  paymentAccountId: string,
  amount: number,
  isCapitalExpense: boolean,
  includesVat: boolean,
  netAmount: number,
  vatAmount: number,
  inputVatAccountId: string | undefined,
  fixedAssetsAccountId: string | undefined,
  description: string,
): JournalLineInput[] {
  const lines: JournalLineInput[] = []

  if (isCapitalExpense && fixedAssetsAccountId) {
    // Capital expense: Dr Fixed Assets, Cr Payment
    lines.push({
      accountId: fixedAssetsAccountId,
      debitAmount: amount,
      creditAmount: 0,
      memo: `Capital expense — ${description}`,
    })
  } else if (includesVat && vatAmount > 0 && inputVatAccountId) {
    // VAT-inclusive: Dr Expense (net), Dr Input VAT (vat), Cr Payment (gross)
    lines.push({
      accountId: expenseAccountId,
      debitAmount: netAmount,
      creditAmount: 0,
      memo: `Expense (net) — ${description}`,
    })
    lines.push({
      accountId: inputVatAccountId,
      debitAmount: vatAmount,
      creditAmount: 0,
      memo: `Input VAT — ${description}`,
    })
  } else {
    // Standard: Dr Expense, Cr Payment
    lines.push({
      accountId: expenseAccountId,
      debitAmount: amount,
      creditAmount: 0,
      memo: `Expense — ${description}`,
    })
  }

  lines.push({
    accountId: paymentAccountId,
    debitAmount: 0,
    creditAmount: amount,
    memo: `Payment — ${description}`,
  })

  return lines
}

// ─── Create Expense ─────────────────────────────────────────────────────────

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseActionResult> {
  const session = await getServerSession()
  const { businessId, role } = session.user
  const userId = session.user.id

  // Validation
  const fieldErrors: Record<string, string> = {}

  if (!input.expenseDate) {
    fieldErrors.expenseDate = 'Expense date is required'
  }
  if (!input.category) {
    fieldErrors.category = 'Category is required'
  }
  if (!input.amount || input.amount <= 0) {
    fieldErrors.amount = 'Amount must be greater than 0'
  }
  if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
    fieldErrors.paymentMethod = 'Invalid payment method'
  }
  if (!input.description?.trim() || input.description.trim().length < 3) {
    fieldErrors.description = 'Description must be at least 3 characters'
  }
  if (input.paymentMethod?.startsWith('momo_') && !input.momoReference?.trim()) {
    fieldErrors.momoReference = 'MoMo reference is required for mobile money payments'
  }
  if (input.paymentMethod === 'bank' && !input.bankReference?.trim()) {
    fieldErrors.bankReference = 'Bank reference is required for bank payments'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // Resolve account codes
  const isCapital = input.isCapitalExpense || input.category === 'asset_purchase'
  const expenseAccountCode = isCapital
    ? FIXED_ASSETS_ACCOUNT_CODE
    : categoryToAccountCode(input.category)

  if (!expenseAccountCode) {
    return { success: false, error: `Unknown category: ${input.category}` }
  }

  const paymentAccountCode = PAYMENT_ACCOUNT_CODES[input.paymentMethod]
  const neededCodes = [expenseAccountCode, paymentAccountCode]

  // Check if VAT-inclusive — need business vatRegistered status + input VAT account
  let includesVat = false
  let netAmount = input.amount
  let vatAmount = 0

  if (input.includesVat && !isCapital) {
    const [business] = await db
      .select({ vatRegistered: businesses.vatRegistered })
      .from(businesses)
      .where(eq(businesses.id, businessId))

    if (business?.vatRegistered) {
      includesVat = true
      neededCodes.push(INPUT_VAT_ACCOUNT_CODE)

      const vatResult = await reverseCalculateVat(businessId, input.amount)
      netAmount = vatResult.netAmount
      vatAmount = vatResult.vatAmount
    }
  }

  if (isCapital && expenseAccountCode !== paymentAccountCode) {
    // Ensure we also have the fixed assets account if needed
    if (!neededCodes.includes(FIXED_ASSETS_ACCOUNT_CODE)) {
      neededCodes.push(FIXED_ASSETS_ACCOUNT_CODE)
    }
  }

  const accountMap = await resolveAccountIds(businessId, neededCodes)

  const expenseAccountId = accountMap[expenseAccountCode]
  const paymentAccountId = accountMap[paymentAccountCode]
  const inputVatAccountId = accountMap[INPUT_VAT_ACCOUNT_CODE]
  const fixedAssetsAccountId = accountMap[FIXED_ASSETS_ACCOUNT_CODE]

  if (!expenseAccountId) {
    return {
      success: false,
      error: `Expense account ${expenseAccountCode} not found. Please complete business setup.`,
    }
  }
  if (!paymentAccountId) {
    return {
      success: false,
      error: `Payment account ${paymentAccountCode} not found. Please complete business setup.`,
    }
  }
  if (includesVat && !inputVatAccountId) {
    return {
      success: false,
      error: 'Input VAT Recoverable account (1101) not found. Please complete business setup.',
    }
  }

  const expenseId = crypto.randomUUID()
  const approvalStatus = role === 'cashier' ? 'pending_approval' : 'approved'

  // Build recurrence rule string from frequency
  const isRecurring = !!input.isRecurring && !!input.recurrenceFrequency && !isCapital
  const recurrenceRule = isRecurring ? input.recurrenceFrequency! : null

  // Cashier: insert expense only, no journal entry
  if (approvalStatus === 'pending_approval') {
    await db.insert(expenses).values({
      id: expenseId,
      businessId,
      expenseDate: input.expenseDate,
      category: input.category,
      accountId: isCapital ? (fixedAssetsAccountId ?? expenseAccountId) : expenseAccountId,
      supplierId: input.supplierId ?? null,
      amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      description: input.description.trim(),
      receiptUrl: input.receiptUrl ?? null,
      approvalStatus: 'pending_approval',
      isCapitalExpense: isCapital,
      includesVat: includesVat,
      isRecurring,
      recurrenceRule,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    return { success: true, expenseId }
  }

  // Non-cashier: approved immediately with journal entry
  const journalLines = buildExpenseJournalLines(
    expenseAccountId,
    paymentAccountId,
    input.amount,
    isCapital,
    includesVat,
    netAmount,
    vatAmount,
    inputVatAccountId,
    fixedAssetsAccountId,
    input.description.trim(),
  )

  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: input.expenseDate,
    reference: `EXP-${expenseId.slice(0, 8).toUpperCase()}`,
    description: `Expense: ${input.description.trim()}`,
    sourceType: 'expense',
    sourceId: expenseId,
    createdBy: userId,
    lines: journalLines,
  }

  await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    await tx.insert(expenses).values({
      id: expenseId,
      businessId,
      expenseDate: input.expenseDate,
      category: input.category,
      accountId: isCapital ? (fixedAssetsAccountId ?? expenseAccountId) : expenseAccountId,
      supplierId: input.supplierId ?? null,
      amount: input.amount.toFixed(2),
      paymentMethod: input.paymentMethod,
      description: input.description.trim(),
      receiptUrl: input.receiptUrl ?? null,
      approvalStatus: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      isCapitalExpense: isCapital,
      includesVat: includesVat,
      isRecurring,
      recurrenceRule,
      notes: input.notes ?? null,
      journalEntryId,
      createdBy: userId,
    })
  })

  return { success: true, expenseId }
}

// ─── Approve Expense ────────────────────────────────────────────────────────

export async function approveExpense(expenseId: string): Promise<ExpenseActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const [expense] = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.businessId, businessId),
        eq(expenses.approvalStatus, 'pending_approval'),
      ),
    )

  if (!expense) {
    return { success: false, error: 'Expense not found or not pending approval' }
  }

  // Resolve accounts
  const expenseAccountCode = expense.isCapitalExpense
    ? FIXED_ASSETS_ACCOUNT_CODE
    : await db
        .select({ code: accounts.code })
        .from(accounts)
        .where(eq(accounts.id, expense.accountId))
        .then((rows) => rows[0]?.code ?? null)

  if (!expenseAccountCode) {
    return { success: false, error: 'Expense account not found' }
  }

  const paymentAccountCode = PAYMENT_ACCOUNT_CODES[expense.paymentMethod as PaymentMethod]
  if (!paymentAccountCode) {
    return { success: false, error: 'Invalid payment method on expense' }
  }

  const amount = Number(expense.amount)
  const neededCodes = [expenseAccountCode, paymentAccountCode]

  let includesVat = false
  let netAmount = amount
  let vatAmount = 0

  if (expense.includesVat && !expense.isCapitalExpense) {
    includesVat = true
    neededCodes.push(INPUT_VAT_ACCOUNT_CODE)

    const vatResult = await reverseCalculateVat(businessId, amount)
    netAmount = vatResult.netAmount
    vatAmount = vatResult.vatAmount
  }

  neededCodes.push(INPUT_VAT_ACCOUNT_CODE)
  const accountMap = await resolveAccountIds(businessId, neededCodes)

  const expenseAccountId = expense.isCapitalExpense
    ? accountMap[FIXED_ASSETS_ACCOUNT_CODE]
    : accountMap[expenseAccountCode]
  const paymentAccountId = accountMap[paymentAccountCode]

  if (!expenseAccountId || !paymentAccountId) {
    return { success: false, error: 'Required accounts not found. Please complete business setup.' }
  }

  const journalLines = buildExpenseJournalLines(
    expense.accountId,
    paymentAccountId,
    amount,
    expense.isCapitalExpense,
    includesVat,
    netAmount,
    vatAmount,
    accountMap[INPUT_VAT_ACCOUNT_CODE],
    accountMap[FIXED_ASSETS_ACCOUNT_CODE],
    expense.description,
  )

  const journalInput: PostJournalEntryInput = {
    businessId,
    entryDate: expense.expenseDate,
    reference: `EXP-${expenseId.slice(0, 8).toUpperCase()}`,
    description: `Expense: ${expense.description}`,
    sourceType: 'expense',
    sourceId: expenseId,
    createdBy: user.id,
    lines: journalLines,
  }

  await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
    await tx
      .update(expenses)
      .set({
        journalEntryId,
        approvalStatus: 'approved',
        approvedBy: user.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId))
  })

  return { success: true, expenseId }
}

// ─── Reject Expense ─────────────────────────────────────────────────────────

export async function rejectExpense(
  expenseId: string,
  reason?: string,
): Promise<ExpenseActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  const [expense] = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.businessId, businessId),
        eq(expenses.approvalStatus, 'pending_approval'),
      ),
    )

  if (!expense) {
    return { success: false, error: 'Expense not found or not pending approval' }
  }

  const existingNotes = expense.notes ?? ''
  const rejectionNote = reason ? `Rejected: ${reason}` : 'Rejected'
  const updatedNotes = existingNotes ? `${existingNotes}\n${rejectionNote}` : rejectionNote

  await db
    .update(expenses)
    .set({
      approvalStatus: 'rejected',
      notes: updatedNotes,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId))

  return { success: true, expenseId }
}

// ─── Reverse Expense ────────────────────────────────────────────────────────

export async function reverseExpense(
  expenseId: string,
  reason: string,
): Promise<ExpenseActionResult> {
  const user = await requireRole(['owner', 'manager'])
  const { businessId } = user

  if (!reason?.trim() || reason.trim().length < 5) {
    return { success: false, error: 'Reason must be at least 5 characters' }
  }

  const [expense] = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.businessId, businessId),
        eq(expenses.approvalStatus, 'approved'),
      ),
    )

  if (!expense) {
    return { success: false, error: 'Expense not found or not approved' }
  }

  if (!expense.journalEntryId) {
    return { success: false, error: 'Expense has no journal entry to reverse' }
  }

  await db.transaction(async (tx) => {
    await reverseJournalEntry(tx, expense.journalEntryId!, businessId, user.id, reason.trim())

    const existingNotes = expense.notes ?? ''
    const reversalNote = `Reversed: ${reason.trim()}`
    const updatedNotes = existingNotes ? `${existingNotes}\n${reversalNote}` : reversalNote

    await tx
      .update(expenses)
      .set({
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId))
  })

  return { success: true, expenseId }
}

// ─── Update Receipt ─────────────────────────────────────────────────────────

export async function updateExpenseReceipt(
  expenseId: string,
  receiptUrl: string,
): Promise<ExpenseActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))

  if (!expense) {
    return { success: false, error: 'Expense not found' }
  }

  await db
    .update(expenses)
    .set({ receiptUrl, updatedAt: new Date() })
    .where(eq(expenses.id, expenseId))

  return { success: true, expenseId }
}

// ─── List Expenses ──────────────────────────────────────────────────────────

type ExpenseListFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  category?: string
  approvalStatus?: string
}

export async function listExpenses(filters?: ExpenseListFilters): Promise<ExpenseListItem[]> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Default: last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const dateFrom = filters?.dateFrom ?? thirtyDaysAgo.toISOString().split('T')[0]
  const dateTo = filters?.dateTo ?? now.toISOString().split('T')[0]

  const conditions = [
    eq(expenses.businessId, businessId),
    gte(expenses.expenseDate, dateFrom),
    lte(expenses.expenseDate, dateTo),
  ]

  if (filters?.category) {
    conditions.push(eq(expenses.category, filters.category))
  }
  if (filters?.approvalStatus) {
    conditions.push(eq(expenses.approvalStatus, filters.approvalStatus))
  }
  if (filters?.search) {
    conditions.push(ilike(expenses.description, `%${filters.search}%`))
  }

  const rows = await db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      approvalStatus: expenses.approvalStatus,
      isCapitalExpense: expenses.isCapitalExpense,
      accountName: accounts.name,
      receiptUrl: expenses.receiptUrl,
    })
    .from(expenses)
    .leftJoin(accounts, eq(expenses.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))

  return rows
}

// ─── Get Expense By ID ──────────────────────────────────────────────────────

export async function getExpenseById(expenseId: string): Promise<ExpenseDetail> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [row] = await db
    .select({
      id: expenses.id,
      expenseDate: expenses.expenseDate,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      approvalStatus: expenses.approvalStatus,
      isCapitalExpense: expenses.isCapitalExpense,
      accountId: expenses.accountId,
      accountName: accounts.name,
      accountCode: accounts.code,
      supplierId: expenses.supplierId,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      journalEntryId: expenses.journalEntryId,
      approvedBy: expenses.approvedBy,
      approvedAt: expenses.approvedAt,
      createdBy: expenses.createdBy,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .leftJoin(accounts, eq(expenses.accountId, accounts.id))
    .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))

  if (!row) throw new Error('Expense not found')

  return row
}

// ─── Get Expense Summary ────────────────────────────────────────────────────

export async function getExpenseSummary(dateFrom: string, dateTo: string): Promise<ExpenseSummary> {
  const session = await getServerSession()
  const { businessId } = session.user

  // Approved expenses by category
  const categoryRows = await db
    .select({
      category: expenses.category,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.businessId, businessId),
        eq(expenses.approvalStatus, 'approved'),
        gte(expenses.expenseDate, dateFrom),
        lte(expenses.expenseDate, dateTo),
      ),
    )
    .groupBy(expenses.category)

  const totalByCategory = categoryRows.map((r) => ({
    category: r.category ?? 'Uncategorized',
    total: Number(r.total),
  }))

  const grandTotal = totalByCategory.reduce((sum, r) => sum + r.total, 0)

  // Pending approval totals
  const [pendingRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(expenses)
    .where(
      and(eq(expenses.businessId, businessId), eq(expenses.approvalStatus, 'pending_approval')),
    )

  return {
    totalByCategory,
    grandTotal,
    pendingApprovalTotal: Number(pendingRow?.total ?? 0),
    pendingApprovalCount: Number(pendingRow?.count ?? 0),
  }
}

// ─── Process Recurring Expenses ─────────────────────────────────────────────

/**
 * Scans for recurring expenses due for posting and auto-creates the next
 * instance. Called on app load (after sync) or on-demand.
 *
 * Logic:
 *   - Find all approved recurring expenses.
 *   - For each, determine the next due date from the most recent expense
 *     in the same recurrence chain (same businessId, category, description,
 *     amount, paymentMethod, isRecurring=true).
 *   - If the next due date <= today, create a new expense (non-recurring copy)
 *     with a journal entry.
 */
export async function processRecurringExpenses(): Promise<{
  processed: number
  errors: string[]
}> {
  const session = await getServerSession()
  const { businessId } = session.user
  const userId = session.user.id

  const today = new Date().toISOString().split('T')[0]
  let processed = 0
  const errors: string[] = []

  // Find all recurring expense templates
  const templates = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.businessId, businessId),
        eq(expenses.isRecurring, true),
        eq(expenses.approvalStatus, 'approved'),
      ),
    )
    .orderBy(desc(expenses.expenseDate))

  // Deduplicate by recurring chain (category + description + amount + paymentMethod)
  const seen = new Set<string>()
  const uniqueTemplates = templates.filter((t) => {
    const key = `${t.category}|${t.description}|${t.amount}|${t.paymentMethod}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  for (const template of uniqueTemplates) {
    try {
      const frequency = template.recurrenceRule as RecurrenceFrequency | null
      if (!frequency) continue

      // Find the most recent expense in the chain
      const [latest] = await db
        .select({ expenseDate: expenses.expenseDate })
        .from(expenses)
        .where(
          and(
            eq(expenses.businessId, businessId),
            eq(expenses.category, template.category!),
            eq(expenses.description, template.description),
            eq(expenses.amount, template.amount),
            eq(expenses.paymentMethod, template.paymentMethod),
          ),
        )
        .orderBy(desc(expenses.expenseDate))
        .limit(1)

      if (!latest) continue

      const lastDate = new Date(latest.expenseDate + 'T00:00:00Z')
      let nextDate: Date

      switch (frequency) {
        case 'weekly':
          nextDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
        case 'biweekly':
          nextDate = new Date(lastDate.getTime() + 14 * 24 * 60 * 60 * 1000)
          break
        case 'monthly': {
          nextDate = new Date(lastDate)
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
          break
        }
      }

      const nextDateStr = nextDate.toISOString().split('T')[0]
      if (nextDateStr > today) continue

      // Create the new expense instance (non-recurring, just a generated copy)
      const result = await createExpense({
        expenseDate: nextDateStr,
        category: template.category!,
        amount: Number(template.amount),
        paymentMethod: template.paymentMethod as PaymentMethod,
        description: template.description,
        includesVat: template.includesVat,
        isCapitalExpense: template.isCapitalExpense,
        supplierId: template.supplierId ?? undefined,
        notes: `Auto-generated from recurring expense (${frequency})`,
      })

      if (result.success) {
        processed++
      } else {
        errors.push(`Failed to post recurring "${template.description}": ${result.error}`)
      }
    } catch (err) {
      errors.push(
        `Error processing "${template.description}": ${err instanceof Error ? err.message : 'Unknown'}`,
      )
    }
  }

  return { processed, errors }
}

// ─── Preview Expense VAT ────────────────────────────────────────────────────

export async function previewExpenseVat(
  grossAmount: number,
): Promise<{ netAmount: number; vatAmount: number; effectiveRate: number }> {
  const session = await getServerSession()
  return reverseCalculateVat(session.user.businessId, grossAmount)
}
