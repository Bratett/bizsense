'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deactivateCustomer, type CustomerWithBalance } from '@/actions/customers'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function avatarColor(name: string): string {
  const COLORS = [
    'bg-green-700',
    'bg-blue-600',
    'bg-amber-600',
    'bg-purple-600',
    'bg-teal-600',
    'bg-orange-600',
    'bg-rose-600',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export default function CustomerDetail({ customer }: { customer: CustomerWithBalance }) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDeactivate() {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await deactivateCustomer(customer.id)
      if (result.success) {
        router.push('/customers')
      } else {
        setShowConfirm(false)
        setDeactivateError(result.error)
      }
    })
  }

  const creditLimit = Number(customer.creditLimit)
  const balance = customer.outstandingBalance
  const utilizationPct = creditLimit > 0 ? Math.min((balance / creditLimit) * 100, 100) : 0
  const utilizationColor =
    utilizationPct >= 80
      ? 'bg-red-500'
      : utilizationPct >= 50
        ? 'bg-amber-500'
        : 'bg-green-600'

  const balanceIsZero = balance === 0
  const color = avatarColor(customer.name)
  const inits = initials(customer.name)

  return (
    <main className="min-h-screen bg-[#F5F5F0] p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Back nav */}
        <div className="flex items-center gap-2">
          <Link
            href="/customers"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            aria-label="Back to customers"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Customers
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-800 truncate">{customer.name}</span>
        </div>

        {/* Deactivate error */}
        {deactivateError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {deactivateError}
          </div>
        )}

        {/* Two-column layout */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[300px,1fr]">
          {/* ── Left Sidebar ── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${color}`}
                >
                  {inits}
                </div>
                <h1 className="mt-3 text-lg font-bold text-gray-900">{customer.name}</h1>
                {!customer.isActive && (
                  <span className="mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    Inactive
                  </span>
                )}
                {customer.location && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    {customer.location}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="my-4 border-t border-gray-100" />

              {/* Contact rows */}
              <div className="space-y-3">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-gray-50"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">PHONE</p>
                      <p className="text-sm font-medium text-green-700">{customer.phone}</p>
                    </div>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-gray-50"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">EMAIL</p>
                      <p className="truncate text-sm font-medium text-gray-800">{customer.email}</p>
                    </div>
                  </a>
                )}
                {customer.momoNumber && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">MOMO</p>
                      <p className="text-sm font-medium text-gray-800">{customer.momoNumber}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Credit Utilization */}
              {creditLimit > 0 && (
                <>
                  <div className="my-4 border-t border-gray-100" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Credit Utilization</p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-base font-bold text-gray-900">GHS {formatGHS(balance)}</span>
                      <span className="text-xs text-gray-400">of GHS {formatGHS(creditLimit)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${utilizationColor}`}
                        style={{ width: `${utilizationPct}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="mt-5 space-y-2">
                <Link
                  href={`/orders/new?customerId=${customer.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                  </svg>
                  New Sale
                </Link>
                <Link
                  href={`/customers/${customer.id}/edit`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  Edit
                </Link>
              </div>
            </div>
          </div>

          {/* ── Right Column ── */}
          <div className="flex flex-col gap-4">
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Outstanding Balance */}
              <div
                className={`rounded-2xl border p-4 ${balanceIsZero ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wider ${balanceIsZero ? 'text-green-600' : 'text-amber-600'}`}>
                  Outstanding
                </p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${balanceIsZero ? 'text-green-700' : 'text-amber-700'}`}>
                  GHS {formatGHS(balance)}
                </p>
              </div>

              {/* Credit Limit */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Credit Limit</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                  {creditLimit > 0 ? `GHS ${formatGHS(creditLimit)}` : 'None'}
                </p>
              </div>

              {/* Customer Since */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Customer Since</p>
                <p className="mt-1 text-base font-bold text-gray-900">
                  {customer.createdAt.toLocaleDateString('en-GH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Profile details card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Profile Details</h2>
              <dl className="mt-4 divide-y divide-gray-100">
                {customer.notes && (
                  <ProfileRow label="Notes" value={customer.notes} />
                )}
                <ProfileRow label="Name" value={customer.name} />
                {customer.phone && <ProfileRow label="Phone" value={customer.phone} />}
                {customer.email && <ProfileRow label="Email" value={customer.email} />}
                {customer.location && <ProfileRow label="Location" value={customer.location} />}
                {customer.momoNumber && <ProfileRow label="MoMo Number" value={customer.momoNumber} />}
                <ProfileRow
                  label="Credit Limit"
                  value={creditLimit > 0 ? `GHS ${formatGHS(creditLimit)}` : 'None'}
                />
              </dl>
            </div>

            {/* Deactivate */}
            {customer.isActive && (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
              >
                Deactivate Customer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Deactivate Customer?</h3>
            <p className="mt-2 text-sm text-gray-500">
              {customer.name} will be hidden from your customer list. You can reactivate them later
              from settings.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isPending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2.5">
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="ml-4 max-w-[60%] text-right text-sm text-gray-900">{value}</dd>
    </div>
  )
}
