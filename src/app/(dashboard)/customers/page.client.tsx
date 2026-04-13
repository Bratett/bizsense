'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import type { CustomerListItem } from '@/actions/customers'
import SwipeableRow from '@/components/SwipeableRow.client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { avatarColor, initials } from '@/lib/format'

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
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <PageHeader
          title="Customers"
          subtitle="Manage your trade partners, tracking their credits and transaction history."
          actions={
            <Button render={<Link href="/customers/new" />} size="lg">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              New Customer
            </Button>
          }
        />

        {/* Search + Filters */}
        <div className="mt-6 flex gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, phone, or location..."
            className="flex-1"
          />
          <Button variant="outline" size="lg">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            Filters
          </Button>
          <Button variant="outline" size="lg">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </Button>
        </div>

        {/* Column headers (desktop) */}
        {filtered.length > 0 && (
          <div className="mt-4 hidden grid-cols-[1fr,140px,160px,80px] items-center gap-4 px-4 md:grid">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
          </div>
        )}

        {/* List */}
        <div className="mt-2 space-y-2">
          {filtered.length === 0 && initialCustomers.length === 0 && (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No customers yet"
              subtitle="Add your first customer to get started."
              action={{ label: 'Add Customer', href: '/customers/new' }}
            />
          )}

          {filtered.length === 0 && initialCustomers.length > 0 && (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No customers match your search"
              subtitle="Try a different name or phone number."
            />
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
                  <Avatar className="size-11">
                    <AvatarFallback className={`text-sm font-bold text-white ${color}`}>
                      {inits}
                    </AvatarFallback>
                  </Avatar>

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
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Showing {filtered.length} of {initialCustomers.length} customer{initialCustomers.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </main>
  )
}
