'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CustomerListItem } from '@/actions/customers'
import SwipeableRow from '@/components/SwipeableRow.client'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function CustomerList({
  initialCustomers,
}: {
  initialCustomers: CustomerListItem[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = initialCustomers.filter((c) => {
    if (!search) return true
    const term = search.toLowerCase()
    return c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
  })

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
          <Link
            href="/customers/new"
            className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            Add Customer
          </Link>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="search"
            placeholder="Search by name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 && initialCustomers.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No customers yet.</p>
              <p className="mt-1 text-sm text-gray-400">Add your first customer to get started.</p>
              <Link
                href="/customers/new"
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Add Customer
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialCustomers.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No customers match your search.</p>
            </div>
          )}

          {filtered.map((customer) => (
            <SwipeableRow
              key={customer.id}
              actions={[
                {
                  label: 'Edit',
                  color: 'bg-blue-500',
                  onClick: () => router.push(`/customers/${customer.id}/edit`),
                },
              ]}
            >
              <Link
                href={`/customers/${customer.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-gray-900">
                      {customer.name}
                    </p>
                    {customer.phone && (
                      <p className="mt-0.5 text-sm text-gray-500">{customer.phone}</p>
                    )}
                    {customer.location && (
                      <p className="mt-0.5 text-sm text-gray-400">{customer.location}</p>
                    )}
                  </div>
                  {/* Chevron */}
                  <svg
                    className="ml-2 h-5 w-5 flex-shrink-0 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </SwipeableRow>
          ))}
        </div>
      </div>
    </main>
  )
}
