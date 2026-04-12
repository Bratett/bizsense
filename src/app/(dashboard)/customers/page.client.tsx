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
    <main className="min-h-screen bg-[#F5F5F0] p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Relationship Management
            </p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Customers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your trade partners, tracking their credits and transaction history.
            </p>
          </div>
          <Link
            href="/customers/new"
            className="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 active:bg-green-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
            New Customer
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
              placeholder="Search by name, phone, or location..."
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
          <div className="mt-4 hidden grid-cols-[1fr,140px,160px,80px] items-center gap-4 px-4 md:grid">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Customer</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Phone</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Location</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</span>
          </div>
        )}

        {/* List */}
        <div className="mt-2 space-y-2">
          {filtered.length === 0 && initialCustomers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-gray-900">No customers yet</p>
              <p className="mt-1 text-sm text-gray-500">Add your first customer to get started.</p>
              <Link
                href="/customers/new"
                className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Add Customer
              </Link>
            </div>
          )}

          {filtered.length === 0 && initialCustomers.length > 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-gray-900">No customers match your search</p>
              <p className="mt-1 text-sm text-gray-500">Try a different name or phone number.</p>
            </div>
          )}

          {filtered.map((customer) => {
            const color = avatarColor(customer.name)
            const inits = initials(customer.name)
            return (
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
                  className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}
                  >
                    {inits}
                  </div>

                  {/* Name + phone + location */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{customer.name}</p>
                    {customer.phone && (
                      <p className="mt-0.5 text-xs text-gray-500">{customer.phone}</p>
                    )}
                    {customer.location && (
                      <p className="mt-0.5 text-xs text-gray-400">{customer.location}</p>
                    )}
                  </div>

                  {/* Actions (desktop) */}
                  <div className="hidden items-center gap-2 md:flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(`/customers/${customer.id}/edit`)
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
            Showing {filtered.length} of {initialCustomers.length} customer{initialCustomers.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </main>
  )
}
