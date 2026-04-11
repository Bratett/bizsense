import Link from 'next/link'
import { getServerSession } from '@/lib/session'
import { getDashboardData } from './queries'
import {
  getDashboardTodaySales,
  getDashboardCashBalance,
  getDashboardReceivables,
  getDashboardPayables,
  getDashboardPendingApprovals,
  getDashboardActivity,
  getDashboardChartData,
  getDashboardLowStock,
} from '@/lib/dashboard/queries'
import FirstTimeOverlay from './FirstTimeOverlay.client'
import DashboardChart from './DashboardChart.client'
import ActivityFeed from './ActivityFeed.client'
import SyncIndicator from '@/components/SyncIndicator.client'

function getGreeting(): string {
  const hour = new Date().getUTCHours() // Ghana is UTC+0
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(): string {
  const now = new Date()
  const day = String(now.getUTCDate()).padStart(2, '0')
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const year = now.getUTCFullYear()
  return `${day}/${month}/${year}`
}

// ─── Quick action config ──────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Record Sale',
    href: '/orders/new',
    color: 'bg-green-50 text-green-700',
    icon: (
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    label: 'Record Expense',
    href: '/expenses/new',
    color: 'bg-red-50 text-red-600',
    icon: (
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3"
        />
      </svg>
    ),
  },
  {
    label: 'Receive Payment',
    href: '/payments/new',
    color: 'bg-blue-50 text-blue-600',
    icon: (
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
      </svg>
    ),
  },
  {
    label: 'AI Assistant',
    href: '/ai',
    color: 'bg-purple-50 text-purple-600',
    icon: (
      <svg
        width="24"
        height="24"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    ),
  },
]

// ─── Lock icon for restricted cards ───────────────────────────────────────────

function LockedCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getServerSession()
  const { businessId, role, fullName, id: userId } = session.user

  const showFinancials = ['owner', 'manager', 'accountant'].includes(role)
  const showApprovals = ['owner', 'manager'].includes(role)

  // Fetch all dashboard data in parallel
  // TODO Sprint 9: replace with Dexie-first read
  const [
    legacy,
    todaySales,
    cashBalance,
    receivables,
    payables,
    pendingApprovals,
    activity,
    chartData,
    lowStock,
  ] = await Promise.all([
    getDashboardData(businessId),
    getDashboardTodaySales(businessId),
    showFinancials ? getDashboardCashBalance(businessId) : null,
    showFinancials ? getDashboardReceivables(businessId) : null,
    showFinancials ? getDashboardPayables(businessId) : null,
    showApprovals ? getDashboardPendingApprovals(businessId) : null,
    getDashboardActivity(businessId, userId, role),
    showFinancials ? getDashboardChartData(businessId) : null,
    getDashboardLowStock(businessId),
  ])

  const greeting = getGreeting()
  const displayName = fullName || 'there'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      {!legacy.hasLiveTransactions && <FirstTimeOverlay />}

      <div className="mx-auto max-w-5xl space-y-6">
        {/* ─── Greeting ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {greeting}, {displayName}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {legacy.businessName} &middot; {formatDate()}
            </p>
          </div>
          <div className="md:hidden">
            <SyncIndicator />
          </div>
        </div>

        {/* ─── Desktop two-column layout ─────────────────────────── */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Left column: metrics + quick actions + alerts */}
          <div className="flex-1 space-y-6">
            {/* ─── Metric Cards (2x2 grid) ──────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Today's Sales — visible to all roles */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">Today&apos;s Sales</p>
                <p
                  className={`mt-1 text-2xl font-semibold tabular-nums ${
                    todaySales.total > 0 ? 'text-green-700' : 'text-gray-900'
                  }`}
                >
                  GHS {formatGHS(todaySales.total)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {todaySales.count} {todaySales.count === 1 ? 'sale' : 'sales'} today
                </p>
              </div>

              {/* Cash Balance */}
              {showFinancials && cashBalance ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">Cash Balance</p>
                  <p
                    className={`mt-1 text-2xl font-semibold tabular-nums ${
                      cashBalance.totalBalance < 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    GHS {formatGHS(cashBalance.totalBalance)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Cash + MoMo + Bank</p>
                </div>
              ) : (
                <LockedCard label="Cash Balance" />
              )}

              {/* Outstanding Receivables */}
              {showFinancials && receivables ? (
                <Link
                  href="/reports/receivables"
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <p className="text-xs font-medium text-gray-500">Receivables</p>
                  <p
                    className={`mt-1 text-2xl font-semibold tabular-nums ${
                      receivables.total > 0 ? 'text-yellow-600' : 'text-green-700'
                    }`}
                  >
                    GHS {formatGHS(receivables.total)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {receivables.count} unpaid {receivables.count === 1 ? 'invoice' : 'invoices'}
                  </p>
                </Link>
              ) : (
                <LockedCard label="Receivables" />
              )}

              {/* Low Stock — visible to all roles */}
              <Link
                href="/inventory?filter=low_stock"
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                <p className="text-xs font-medium text-gray-500">Low Stock</p>
                {lowStock.count > 0 ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
                      {lowStock.count} {lowStock.count === 1 ? 'product' : 'products'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">Below reorder level</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-2xl font-semibold text-green-700">All stocked</p>
                    <p className="mt-0.5 text-xs text-gray-500">No items below reorder level</p>
                  </>
                )}
              </Link>
            </div>

            {/* ─── Quick Actions ──────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}
                  >
                    {action.icon}
                  </span>
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">
                    {action.label}
                  </span>
                </Link>
              ))}
            </div>

            {/* ─── Alerts Panel ───────────────────────────────────── */}
            <div className="space-y-2">
              {/* Overdue invoices alert */}
              {showFinancials && receivables && receivables.count > 0 && (
                <Link
                  href="/reports/receivables"
                  className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 transition-colors hover:bg-red-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                    <svg
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      {receivables.count} unpaid {receivables.count === 1 ? 'invoice' : 'invoices'}{' '}
                      &middot; GHS {formatGHS(receivables.total)}
                    </p>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </Link>
              )}

              {/* Low stock alert */}
              {lowStock.count > 0 && (
                <Link
                  href="/inventory?filter=low_stock"
                  className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <svg
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                      />
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      {lowStock.count} {lowStock.count === 1 ? 'item' : 'items'} below reorder level
                    </p>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-amber-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </Link>
              )}

              {/* Pending approvals alert */}
              {showApprovals && pendingApprovals && pendingApprovals.count > 0 && (
                <Link
                  href="/expenses?filter=pending_approval"
                  className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 transition-colors hover:bg-yellow-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100 text-yellow-700">
                    <svg
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      {pendingApprovals.count}{' '}
                      {pendingApprovals.count === 1 ? 'expense' : 'expenses'} awaiting approval
                    </p>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-yellow-600"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </Link>
              )}
            </div>
          </div>

          {/* Right column: activity feed + chart */}
          <div className="md:w-[400px] space-y-6">
            {/* ─── Revenue vs Expenses Chart ──────────────────────── */}
            {showFinancials && chartData && <DashboardChart data={chartData} />}

            {/* ─── Activity Feed ──────────────────────────────────── */}
            <ActivityFeed items={activity} />

            {/* ─── Ledger link ────────────────────────────────────── */}
            <div className="text-center pb-4">
              <Link
                href="/ledger"
                className="text-sm font-medium text-green-700 hover:text-green-800"
              >
                View full ledger &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
