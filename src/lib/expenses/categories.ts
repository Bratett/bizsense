export const EXPENSE_CATEGORIES = [
  { key: 'salaries', label: 'Salaries & Wages', accountCode: '6001' },
  { key: 'rent', label: 'Rent', accountCode: '6002' },
  { key: 'utilities', label: 'Utilities', accountCode: '6003' },
  { key: 'transport', label: 'Transport & Fuel', accountCode: '6004' },
  { key: 'marketing', label: 'Marketing', accountCode: '6005' },
  { key: 'bank_charges', label: 'Bank Charges', accountCode: '6006' },
  { key: 'repairs', label: 'Repairs & Maintenance', accountCode: '6007' },
  { key: 'depreciation', label: 'Depreciation', accountCode: '6008' },
  { key: 'miscellaneous', label: 'Miscellaneous', accountCode: '6009' },
  { key: 'asset_purchase', label: 'Asset Purchase', accountCode: '1500' },
] as const

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]['key']

export const FIXED_ASSETS_ACCOUNT_CODE = '1500'
export const INPUT_VAT_ACCOUNT_CODE = '1101'

export function categoryToAccountCode(key: string): string | null {
  const found = EXPENSE_CATEGORIES.find((c) => c.key === key)
  return found?.accountCode ?? null
}

export function getCategoryLabel(key: string): string | null {
  const found = EXPENSE_CATEGORIES.find((c) => c.key === key)
  return found?.label ?? null
}
