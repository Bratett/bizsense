import { eq } from 'drizzle-orm'
import { accounts } from '@/db/schema'
import type { DrizzleTransaction } from '@/lib/ledger'

export type SeededAccounts = Record<string, string>

type AccountSeed = {
  code: string
  name: string
  type: string
  subtype: string | null
  cashFlowActivity: string
}

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  // ── Assets ──────────────────────────────────────────────────────────────────
  {
    code: '1001',
    name: 'Cash on Hand',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1002',
    name: 'MTN MoMo Account',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1003',
    name: 'Telecel Cash Account',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1004',
    name: 'AirtelTigo Money Account',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1005',
    name: 'Bank Account',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1100',
    name: 'Accounts Receivable',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1101',
    name: 'Input VAT Recoverable',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1200',
    name: 'Inventory',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1300',
    name: 'Prepaid Expenses',
    type: 'asset',
    subtype: 'current_asset',
    cashFlowActivity: 'operating',
  },
  {
    code: '1500',
    name: 'Fixed Assets — Cost',
    type: 'asset',
    subtype: 'fixed_asset',
    cashFlowActivity: 'investing',
  },
  {
    code: '1510',
    name: 'Accumulated Depreciation',
    type: 'asset',
    subtype: 'fixed_asset',
    cashFlowActivity: 'investing',
  },

  // ── Liabilities ─────────────────────────────────────────────────────────────
  {
    code: '2001',
    name: 'Accounts Payable',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },
  {
    code: '2100',
    name: 'VAT Payable',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },
  {
    code: '2101',
    name: 'Opening Balance Adjustment',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },
  {
    code: '2200',
    name: 'SSNIT Payable',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },
  {
    code: '2300',
    name: 'PAYE Payable',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },
  {
    code: '2400',
    name: 'Loans Payable',
    type: 'liability',
    subtype: 'long_term_liability',
    cashFlowActivity: 'financing',
  },
  {
    code: '2500',
    name: 'Net Salaries Payable',
    type: 'liability',
    subtype: 'current_liability',
    cashFlowActivity: 'operating',
  },

  // ── Equity ───────────────────────────────────────────────────────────────────
  {
    code: '3001',
    name: "Owner's Equity / Capital",
    type: 'equity',
    subtype: 'owners_equity',
    cashFlowActivity: 'financing',
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    type: 'equity',
    subtype: 'owners_equity',
    cashFlowActivity: 'financing',
  },

  // ── Revenue ──────────────────────────────────────────────────────────────────
  {
    code: '4001',
    name: 'Sales Revenue',
    type: 'revenue',
    subtype: 'operating_revenue',
    cashFlowActivity: 'operating',
  },
  {
    code: '4002',
    name: 'Service Revenue',
    type: 'revenue',
    subtype: 'operating_revenue',
    cashFlowActivity: 'operating',
  },
  {
    code: '4003',
    name: 'FX Gain / (Loss)',
    type: 'revenue',
    subtype: 'other_income',
    cashFlowActivity: 'operating',
  },
  {
    code: '4004',
    name: 'Other Income',
    type: 'revenue',
    subtype: 'other_income',
    cashFlowActivity: 'operating',
  },

  // ── COGS ─────────────────────────────────────────────────────────────────────
  {
    code: '5001',
    name: 'Cost of Goods Sold',
    type: 'cogs',
    subtype: 'cogs',
    cashFlowActivity: 'operating',
  },

  // ── Expenses ─────────────────────────────────────────────────────────────────
  {
    code: '6001',
    name: 'Salaries & Wages',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6002',
    name: 'Rent',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6003',
    name: 'Utilities',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6004',
    name: 'Transport & Fuel',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6005',
    name: 'Marketing & Advertising',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6006',
    name: 'Bank Charges',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6007',
    name: 'Repairs & Maintenance',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6008',
    name: 'Depreciation Expense',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
  {
    code: '6009',
    name: 'Miscellaneous Expenses',
    type: 'expense',
    subtype: 'operating_expense',
    cashFlowActivity: 'operating',
  },
]

/**
 * Seeds the default Chart of Accounts for a new business.
 *
 * Called once inside a Drizzle transaction during onboarding Step 1.
 * Idempotent — if called twice for the same businessId, no duplicates are created.
 *
 * Returns account IDs keyed by account code so downstream code (e.g. tax seeder,
 * opening balance entries) can reference accounts without additional lookups.
 */
export async function seedChartOfAccounts(
  tx: DrizzleTransaction,
  businessId: string,
): Promise<SeededAccounts> {
  const existing = await tx
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.businessId, businessId))

  const result: SeededAccounts = {}
  const existingCodes = new Set<string>()

  for (const row of existing) {
    result[row.code] = row.id
    existingCodes.add(row.code)
  }

  const toInsert = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code))

  if (toInsert.length === 0) return result

  const inserted = await tx
    .insert(accounts)
    .values(
      toInsert.map((a) => ({
        businessId,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        cashFlowActivity: a.cashFlowActivity,
        isSystem: true,
        currency: 'GHS',
      })),
    )
    .returning({ id: accounts.id, code: accounts.code })

  for (const row of inserted) {
    result[row.code] = row.id
  }

  return result
}
