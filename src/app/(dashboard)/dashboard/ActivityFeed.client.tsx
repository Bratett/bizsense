'use client'

import { useRouter } from 'next/navigation'
import type { ActivityItem } from '@/lib/dashboard/queries'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

function SaleIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50">
      <svg
        width="18"
        height="18"
        fill="none"
        viewBox="0 0 24 24"
        stroke="#00704A"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
        />
      </svg>
    </div>
  )
}

function ExpenseIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
      <svg
        width="18"
        height="18"
        fill="none"
        viewBox="0 0 24 24"
        stroke="#D93025"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
    </div>
  )
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
        <p className="text-sm font-semibold text-gray-900">Recent Activity</p>
        <p className="mt-2 text-sm text-gray-500">No recent activity yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={`${item.type}-${item.id}`}>
            <button
              onClick={() => router.push(item.href)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              {item.type === 'sale' ? <SaleIcon /> : <ExpenseIcon />}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.description}</p>
                <p className="text-xs text-gray-500">
                  {item.type === 'sale'
                    ? 'Sale'
                    : item.status === 'pending_approval'
                      ? 'Expense'
                      : 'Expense'}
                  {' \u00b7 '}
                  {formatDate(item.date)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    item.type === 'sale' ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {item.type === 'sale' ? '+' : '-'}GHS {formatGHS(item.amount)}
                </p>
                {item.status === 'pending_approval' && (
                  <span className="inline-block mt-0.5 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                    Pending
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
