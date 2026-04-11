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

  const balanceColor =
    customer.outstandingBalance === 0
      ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-amber-700 bg-amber-50 border-amber-200'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Back to customers"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-gray-900">{customer.name}</h1>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="text-sm text-green-700 hover:underline">
                {customer.phone}
              </a>
            )}
          </div>
          {!customer.isActive && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              Inactive
            </span>
          )}
        </div>

        {/* Deactivate error */}
        {deactivateError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {deactivateError}
          </div>
        )}

        {/* Balance Card */}
        <div className={`mt-4 rounded-xl border p-4 ${balanceColor}`}>
          <p className="text-xs font-medium opacity-70">Outstanding Balance</p>
          <p className="mt-1 text-2xl font-semibold">
            GHS {formatGHS(customer.outstandingBalance)}
          </p>
        </div>

        {/* Profile */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Profile</h2>
          <dl className="mt-3 space-y-3">
            <ProfileField label="Name" value={customer.name} />
            <ProfileField label="Phone" value={customer.phone} />
            <ProfileField label="Email" value={customer.email} />
            <ProfileField label="Location" value={customer.location} />
            <ProfileField label="MoMo Number" value={customer.momoNumber} />
            <ProfileField
              label="Credit Limit"
              value={`GHS ${formatGHS(Number(customer.creditLimit))}`}
            />
            <ProfileField label="Notes" value={customer.notes} />
            <ProfileField
              label="Customer Since"
              value={customer.createdAt.toLocaleDateString('en-GH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
          </dl>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <Link
            href={`/orders/new?customerId=${customer.id}`}
            className="flex-1 rounded-lg bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            New Sale
          </Link>
          <Link
            href={`/customers/${customer.id}/edit`}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            Edit
          </Link>
        </div>

        {customer.isActive && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="mt-3 w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
          >
            Deactivate Customer
          </button>
        )}

        {/* Confirmation Modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Deactivate Customer?</h3>
              <p className="mt-2 text-sm text-gray-500">
                {customer.name} will be hidden from your customer list. You can reactivate them
                later from settings.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isPending ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  )
}
