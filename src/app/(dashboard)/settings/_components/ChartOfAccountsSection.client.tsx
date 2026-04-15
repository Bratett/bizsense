'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Plus } from 'lucide-react'
import { addAccount, type SettingsActionResult } from '@/actions/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { AccountRecord } from '../page.client'

const initialState: SettingsActionResult = { success: false, error: '' }

const ACCOUNT_TYPE_ORDER = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
  'cogs',
] as const

const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
  cogs: 'Cost of Goods Sold',
}

const TYPE_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  asset: 'default',
  liability: 'secondary',
  equity: 'secondary',
  revenue: 'default',
  expense: 'outline',
  cogs: 'outline',
}

interface Props {
  accounts: AccountRecord[]
  userRole: string
}

export default function ChartOfAccountsSection({ accounts, userRole }: Props) {
  const canEdit = userRole === 'owner'
  const [showAddForm, setShowAddForm] = useState(false)
  const [state, formAction, isPending] = useActionState(addAccount, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success('Account added')
      setShowAddForm(false)
    }
  }, [state.success])

  const fieldErrors = !state.success ? state.fieldErrors : undefined

  // Group accounts by type
  const grouped = ACCOUNT_TYPE_ORDER.reduce<Record<string, AccountRecord[]>>((acc, type) => {
    acc[type] = accounts.filter((a) => a.type === type)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Chart of Accounts</h2>
          <p className="mt-1 text-sm text-gray-500">
            The default accounts are seeded from Ghana&apos;s standard chart of accounts.
            System accounts cannot be deleted.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Account
          </Button>
        )}
      </div>

      {/* Add account form */}
      {showAddForm && canEdit && (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">New Custom Account</h3>
          {!state.success && state.error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <form action={formAction} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="acc-code" className="text-xs">
                Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="acc-code"
                name="code"
                placeholder="e.g. 6010"
                className={cn('h-9 text-sm', fieldErrors?.code && 'border-destructive')}
                disabled={isPending}
              />
              {fieldErrors?.code && (
                <p className="text-xs text-destructive">{fieldErrors.code}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-name" className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="acc-name"
                name="name"
                placeholder="Account name"
                className={cn('h-9 text-sm', fieldErrors?.name && 'border-destructive')}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-type" className="text-xs">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select name="type" disabled={isPending}>
                <SelectTrigger id="acc-type" className="h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors?.type && (
                <p className="text-xs text-destructive">{fieldErrors.type}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-cf" className="text-xs">Cash Flow</Label>
              <Select name="cashFlowActivity" defaultValue="operating" disabled={isPending}>
                <SelectTrigger id="acc-cf" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operating">Operating</SelectItem>
                  <SelectItem value="investing">Investing</SelectItem>
                  <SelectItem value="financing">Financing</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="acc-subtype" className="text-xs">Subtype</Label>
              <Input
                id="acc-subtype"
                name="subtype"
                placeholder="Optional"
                className="h-9 text-sm"
                disabled={isPending}
              />
            </div>
            <div className="col-span-2 flex items-end gap-2 md:col-span-3">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? 'Adding…' : 'Add Account'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Account groups */}
      <div className="space-y-6">
        {ACCOUNT_TYPE_ORDER.map((type) => {
          const group = grouped[type]
          if (!group || group.length === 0) return null
          return (
            <div key={type}>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={TYPE_BADGE[type] ?? 'outline'} className="text-xs">
                  {TYPE_LABELS[type]}
                </Badge>
                <span className="text-xs text-gray-400">{group.length} accounts</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-20 px-3 py-2 text-left text-xs font-medium text-gray-500">
                        Code
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        Name
                      </th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-gray-500 md:table-cell">
                        Subtype
                      </th>
                      <th className="hidden px-3 py-2 text-left text-xs font-medium text-gray-500 md:table-cell">
                        Cash Flow
                      </th>
                      <th className="w-8 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {group.map((account) => (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">
                          {account.code}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-gray-900">{account.name}</td>
                        <td className="hidden px-3 py-2.5 text-xs text-gray-500 md:table-cell">
                          {account.subtype ?? '—'}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs capitalize text-gray-500 md:table-cell">
                          {account.cashFlowActivity ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {account.isSystem ? (
                            <Lock className="ml-auto h-3 w-3 text-gray-300" />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
