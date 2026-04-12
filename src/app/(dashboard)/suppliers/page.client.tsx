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
    <main className="min-h-screen bg-[#F5F5F0] p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Supply Chain Management
            </p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Suppliers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your suppliers, purchase orders, and outstanding payables.
            </p>
          </div>
          <Link
            href="/suppliers/new"
            className="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 active:bg-green-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Supplier
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="mt-6 flex gap-2">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="search"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            Filters
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </button>
        </div>

        {/* Column headers (desktop) */}
        {filtered.length > 0 && (
          <div className="mt-4 hidden grid-cols-[1fr,140px,160px,160px,80px] items-center gap-4 px-4 md:grid">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Supplier</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Phone</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Location</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</span>
          </div>
        )}

        {/* List */}
        <div className="mt-2 space-y-2">
          {filtered.length === 0 && initialSuppliers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              <p className="mt-3 text-sm font-medium text-gray-900">No suppliers yet</p>
              <p className="mt-1 text-sm text-gray-500">Add your first supplier to manage purchases.</p>
              <Link
                href="/suppliers/new"
                className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Add Supplier
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialSuppliers.length > 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-gray-900">No suppliers match your search</p>
              <p className="mt-1 text-sm text-gray-500">Try a different name or phone number.</p>
            </div>
          )}

          {filtered.map((supplier) => {
            const color = avatarColor(supplier.name)
            const inits = initials(supplier.name)
            return (
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
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}
                  >
                    {inits}
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{supplier.name}</p>
                    {supplier.phone && (
                      <p className="mt-0.5 text-xs text-gray-500">{supplier.phone}</p>
                    )}
                    {supplier.location && (
                      <p className="mt-0.5 text-xs text-gray-400">{supplier.location}</p>
                    )}
                    {/* Status badges */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {supplier.outstandingPayable > 0 && (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          GHS {formatGHS(supplier.outstandingPayable)} owed
                        </span>
                      )}
                      {supplier.openPoCount > 0 && (
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {supplier.openPoCount} open PO{supplier.openPoCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {supplier.outstandingPayable === 0 && supplier.openPoCount === 0 && (
                        <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          All clear
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions (desktop) */}
                  <div className="hidden items-center gap-2 md:flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(`/suppliers/${supplier.id}/edit`)
                      }}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Chevron (mobile) */}
                  <svg className="h-4 w-4 flex-shrink-0 text-gray-300 md:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </SwipeableRow>
            )
          })}
        </div>

        {/* Footer count */}
        {filtered.length > 0 && (
          <p className="mt-4 text-center text-xs text-gray-400">
            Showing {filtered.length} of {initialSuppliers.length} supplier{initialSuppliers.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </main>
  )
}
