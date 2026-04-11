'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupplierListItem } from '@/actions/suppliers'
import SwipeableRow from '@/components/SwipeableRow.client'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function SupplierList({
  initialSuppliers,
}: {
  initialSuppliers: SupplierListItem[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = initialSuppliers.filter((s) => {
    if (!search) return true
    const term = search.toLowerCase()
    return s.name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term))
  })

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Suppliers</h1>
          <Link
            href="/suppliers/new"
            className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            Add Supplier
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
          {filtered.length === 0 && initialSuppliers.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No suppliers yet.</p>
              <p className="mt-1 text-sm text-gray-400">Add your first supplier to get started.</p>
              <Link
                href="/suppliers/new"
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Add Supplier
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialSuppliers.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-500">No suppliers match your search.</p>
            </div>
          )}

          {filtered.map((supplier) => (
            <SwipeableRow
              key={supplier.id}
              actions={[
                {
                  label: 'Edit',
                  color: 'bg-blue-500',
                  onClick: () => router.push(`/suppliers/${supplier.id}/edit`),
                },
              ]}
            >
              <Link
                href={`/suppliers/${supplier.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-gray-900">
                      {supplier.name}
                    </p>
                    {supplier.phone && (
                      <p className="mt-0.5 text-sm text-gray-500">{supplier.phone}</p>
                    )}
                    {supplier.location && (
                      <p className="mt-0.5 text-sm text-gray-400">{supplier.location}</p>
                    )}
                    {/* Badges */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {supplier.outstandingPayable > 0 && (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          GHS {formatGHS(supplier.outstandingPayable)} owed
                        </span>
                      )}
                      {supplier.openPoCount > 0 && (
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          PO {supplier.openPoCount}
                        </span>
                      )}
                    </div>
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
