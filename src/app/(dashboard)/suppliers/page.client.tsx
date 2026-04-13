'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupplierListItem } from '@/actions/suppliers'
import SwipeableRow from '@/components/SwipeableRow.client'
import { formatGhs, avatarColor, initials } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { Plus, SlidersHorizontal, Download, Pencil, ChevronRight, Truck } from 'lucide-react'

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
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <PageHeader
          title="Suppliers"
          subtitle="Manage your suppliers, purchase orders, and outstanding payables."
          actions={
            <Button render={<Link href="/suppliers/new" />}>
              <Plus className="h-4 w-4" />
              New Supplier
            </Button>
          }
        />

        {/* Search + Filters */}
        <div className="mt-6 flex gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or phone..."
            className="flex-1"
          />
          <Button variant="outline">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Column headers (desktop) */}
        {filtered.length > 0 && (
          <div className="mt-4 hidden grid-cols-[1fr,140px,160px,160px,80px] items-center gap-4 px-4 md:grid">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Supplier
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Phone
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Location
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Actions
            </span>
          </div>
        )}

        {/* List */}
        <div className="mt-2 space-y-2">
          {filtered.length === 0 && initialSuppliers.length === 0 && (
            <EmptyState
              icon={<Truck className="h-10 w-10" />}
              title="No suppliers yet"
              subtitle="Add your first supplier to manage purchases."
              action={{ label: 'Add Supplier', href: '/suppliers/new' }}
            />
          )}

          {filtered.length === 0 && initialSuppliers.length > 0 && (
            <EmptyState
              icon={<Truck className="h-10 w-10" />}
              title="No suppliers match your search"
              subtitle="Try a different name or phone number."
            />
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
                  <Avatar size="lg">
                    <AvatarFallback className={cn('text-sm font-bold text-white', color)}>
                      {inits}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {supplier.name}
                    </p>
                    {supplier.phone && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{supplier.phone}</p>
                    )}
                    {supplier.location && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70">{supplier.location}</p>
                    )}
                    {/* Status badges */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {supplier.outstandingPayable > 0 && (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700"
                        >
                          {formatGhs(supplier.outstandingPayable)} owed
                        </Badge>
                      )}
                      {supplier.openPoCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700"
                        >
                          {supplier.openPoCount} open PO{supplier.openPoCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {supplier.outstandingPayable === 0 && supplier.openPoCount === 0 && (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700"
                        >
                          All clear
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions (desktop) */}
                  <div className="hidden items-center gap-2 md:flex">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(`/suppliers/${supplier.id}/edit`)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>

                  {/* Chevron (mobile) */}
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 md:hidden" />
                </Link>
              </SwipeableRow>
            )
          })}
        </div>

        {/* Footer count */}
        {filtered.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Showing {filtered.length} of {initialSuppliers.length} supplier
            {initialSuppliers.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </main>
  )
}
