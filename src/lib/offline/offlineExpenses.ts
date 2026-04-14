// BROWSER ONLY
import { localDb } from '@/db/local/dexie'
import { enqueueSync, enqueueDeferredJournal } from '@/lib/offline/offlineWrite'
import {
  categoryToAccountCode,
  FIXED_ASSETS_ACCOUNT_CODE,
  INPUT_VAT_ACCOUNT_CODE,
} from '@/lib/expenses/categories'
import type { CreateExpenseInput } from '@/actions/expenses'

// ─── Account code constants ───────────────────────────────────────────────────

const PAYMENT_ACCOUNT_CODES: Record<string, string> = {
  cash: '1001',
  momo_mtn: '1002',
  momo_telecel: '1003',
  momo_airtel: '1004',
  bank: '1005',
}

// ─── Input type ───────────────────────────────────────────────────────────────

export type OfflineExpenseInput = CreateExpenseInput & {
  businessId: string
  approvalStatus: 'pending_approval' | 'approved'
  // Pre-computed VAT split (from previewExpenseVat call in the form, if VAT-inclusive)
  netAmount?: number
  vatAmount?: number
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Write an expense to Dexie when the network is unavailable.
 * Enqueues a sync item and (when approved) a deferred journal blueprint.
 * Returns the locally-generated expenseId.
 */
export async function writeExpenseOffline(input: OfflineExpenseInput): Promise<string> {
  const expenseId = crypto.randomUUID()
  const now = new Date().toISOString()

  const expense = {
    id: expenseId,
    businessId: input.businessId,
    expenseDate: input.expenseDate,
    category: input.category ?? null,
    accountId: null, // resolved server-side on promotion
    amount: input.amount,
    paymentMethod: input.paymentMethod ?? null,
    description: input.description,
    receiptUrl: input.receiptUrl ?? null,
    isCapitalExpense: input.isCapitalExpense ?? false,
    approvalStatus: input.approvalStatus,
    journalEntryId: null,
    aiGenerated: false,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }

  // ── Build deferred journal lines (only when approved) ─────────────────────
  if (input.approvalStatus === 'approved') {
    const expenseAccountCode = input.isCapitalExpense
      ? FIXED_ASSETS_ACCOUNT_CODE
      : (categoryToAccountCode(input.category) ?? '6009')

    const paymentAccountCode = PAYMENT_ACCOUNT_CODES[input.paymentMethod] ?? '1001'
    const isVatInclusive = !!(
      input.includesVat &&
      input.netAmount !== undefined &&
      input.vatAmount &&
      input.vatAmount > 0
    )

    const journalLines: Array<{
      accountCode: string
      debitAmount: number
      creditAmount: number
      currency: string
      fxRate: number
    }> = []

    if (input.isCapitalExpense) {
      journalLines.push({
        accountCode: expenseAccountCode,
        debitAmount: input.amount,
        creditAmount: 0,
        currency: 'GHS',
        fxRate: 1,
      })
    } else if (isVatInclusive) {
      journalLines.push({
        accountCode: expenseAccountCode,
        debitAmount: input.netAmount!,
        creditAmount: 0,
        currency: 'GHS',
        fxRate: 1,
      })
      journalLines.push({
        accountCode: INPUT_VAT_ACCOUNT_CODE,
        debitAmount: input.vatAmount!,
        creditAmount: 0,
        currency: 'GHS',
        fxRate: 1,
      })
    } else {
      journalLines.push({
        accountCode: expenseAccountCode,
        debitAmount: input.amount,
        creditAmount: 0,
        currency: 'GHS',
        fxRate: 1,
      })
    }

    journalLines.push({
      accountCode: paymentAccountCode,
      debitAmount: 0,
      creditAmount: input.amount,
      currency: 'GHS',
      fxRate: 1,
    })

    await localDb.transaction(
      'rw',
      [localDb.expenses, localDb.syncQueue, localDb.deferredJournals],
      async () => {
        await localDb.expenses.add(expense)
        await enqueueSync('expenses', expenseId, { ...expense })
        await enqueueDeferredJournal({
          id: crypto.randomUUID(),
          businessId: input.businessId,
          sourceTable: 'expenses',
          sourceId: expenseId,
          proposedEntry: {
            entryDate: input.expenseDate,
            description: input.description,
            sourceType: 'expense',
            lines: journalLines,
          },
        })
      },
    )
  } else {
    // pending_approval: no journal until approved server-side
    await localDb.transaction('rw', [localDb.expenses, localDb.syncQueue], async () => {
      await localDb.expenses.add(expense)
      await enqueueSync('expenses', expenseId, { ...expense })
    })
  }

  return expenseId
}
