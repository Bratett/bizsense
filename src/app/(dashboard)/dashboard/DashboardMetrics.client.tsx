'use client'

import Link from 'next/link'
import { useDashboardMetrics } from '@/lib/offline/dexieHooks'
import { formatGhs } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function LockedCard({ label }: { label: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <div className="mt-2 flex items-center gap-1.5 text-gray-400">
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <span className="text-xs">Ask your manager for access</span>
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardMetricsProps {
  businessId: string
  showFinancials: boolean
  // SSR fallback values — shown while Dexie loads
  ssrTodaySales: number
  ssrTodaySalesCount: number
  ssrCashBalance: number | null
  ssrReceivables: number | null
  ssrReceivablesCount: number | null
  ssrLowStockCount: number
}

export function DashboardMetrics({
  businessId,
  showFinancials,
  ssrTodaySales,
  ssrTodaySalesCount,
  ssrCashBalance,
  ssrReceivables,
  ssrReceivablesCount,
  ssrLowStockCount,
}: DashboardMetricsProps) {
  // Build SSR-shaped initial data so useLiveQuery returns non-undefined
  // on the very first render — eliminates skeleton flash entirely.
  const ssrInitial =
    ssrCashBalance !== null && ssrReceivables !== null && ssrReceivablesCount !== null
      ? {
          todaySales: ssrTodaySales,
          todaySalesCount: ssrTodaySalesCount,
          cashBalance: ssrCashBalance,
          outstandingReceivables: ssrReceivables,
          receivablesCount: ssrReceivablesCount,
          lowStockCount: ssrLowStockCount,
        }
      : undefined

  const metrics = useDashboardMetrics(businessId, ssrInitial)

  // useLiveQuery returns undefined on first render if no initialData is passed.
  // Fall back to SSR values so there is no skeleton flash.
  const todaySales = metrics?.todaySales ?? ssrTodaySales
  const todaySalesCount = metrics?.todaySalesCount ?? ssrTodaySalesCount
  const cashBalance = metrics?.cashBalance ?? ssrCashBalance
  const receivables = metrics?.outstandingReceivables ?? ssrReceivables
  const receivablesCount = metrics?.receivablesCount ?? ssrReceivablesCount
  const lowStockCount = metrics?.lowStockCount ?? ssrLowStockCount

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Today's Sales — visible to all roles */}
      <Card size="sm">
        <CardContent>
          <p className="text-xs font-medium text-gray-500">Today&apos;s Sales</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums',
              todaySales > 0 ? 'text-green-700' : 'text-gray-900',
            )}
          >
            {formatGhs(todaySales)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {todaySalesCount} {todaySalesCount === 1 ? 'sale' : 'sales'} today
          </p>
        </CardContent>
      </Card>

      {/* Cash Balance */}
      {showFinancials && cashBalance !== null ? (
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium text-gray-500">Cash Balance</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums',
                cashBalance < 0 ? 'text-red-600' : 'text-gray-900',
              )}
            >
              {formatGhs(cashBalance)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Cash + MoMo + Bank</p>
            <Link
              href="/momo/reconcile"
              className="mt-1 inline-block text-xs font-medium text-green-700 hover:underline"
            >
              Reconcile →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <LockedCard label="Cash Balance" />
      )}

      {/* Outstanding Receivables */}
      {showFinancials && receivables !== null ? (
        <Link href="/reports/receivables" className="block">
          <Card size="sm" className="transition-colors hover:bg-muted/50">
            <CardContent>
              <p className="text-xs font-medium text-gray-500">Receivables</p>
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold tabular-nums',
                  (receivables ?? 0) > 0 ? 'text-yellow-600' : 'text-green-700',
                )}
              >
                {formatGhs(receivables ?? 0)}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {receivablesCount ?? 0} unpaid{' '}
                {(receivablesCount ?? 0) === 1 ? 'invoice' : 'invoices'}
              </p>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <LockedCard label="Receivables" />
      )}

      {/* Low Stock — visible to all roles */}
      <Link href="/inventory?filter=low_stock" className="block">
        <Card size="sm" className="transition-colors hover:bg-muted/50 active:bg-muted">
          <CardContent>
            <p className="text-xs font-medium text-gray-500">Low Stock</p>
            {lowStockCount > 0 ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
                  {lowStockCount} {lowStockCount === 1 ? 'product' : 'products'}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">Below reorder level</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold text-green-700">All stocked</p>
                <p className="mt-0.5 text-xs text-gray-500">No items below reorder level</p>
              </>
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
