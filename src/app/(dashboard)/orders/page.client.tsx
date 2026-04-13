'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Plus } from 'lucide-react'
import type { OrderListItem } from '@/actions/orders'
import SwipeableRow from '@/components/SwipeableRow.client'
import { formatGhs, formatDate } from '@/lib/format'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { Alert, AlertDescription } from '@/components/ui/alert'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  momo_mtn: 'MTN MoMo',
  momo_telecel: 'Telecel',
  momo_airtel: 'AirtelTigo',
  bank: 'Bank',
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'unpaid', label: 'Unpaid' },
] as const

function PaymentBadge({
  paymentStatus,
  totalAmount,
  amountPaid,
}: {
  paymentStatus: string
  totalAmount: string | null
  amountPaid: string | null
}) {
  const outstanding = Math.max(0, Number(totalAmount ?? 0) - Number(amountPaid ?? 0))
  if (paymentStatus === 'paid') {
    return <StatusBadge variant="paid">Paid</StatusBadge>
  }
  if (paymentStatus === 'unpaid') {
    return <StatusBadge variant="unpaid">Unpaid &middot; GHS {outstanding.toFixed(2)}</StatusBadge>
  }
  return (
    <StatusBadge variant="partial">Partial &middot; GHS {outstanding.toFixed(2)} due</StatusBadge>
  )
}

export default function OrderList({
  initialOrders,
  activeTab,
}: {
  initialOrders: OrderListItem[]
  activeTab: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const filtered = initialOrders.filter((o) => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      o.orderNumber.toLowerCase().includes(term) ||
      (o.customerName && o.customerName.toLowerCase().includes(term))
    )
  })

  const handleTabClick = (key: string) => {
    const params = new URLSearchParams()
    if (key !== 'all') params.set('tab', key)
    router.push('/orders' + (params.toString() ? `?${params}` : ''))
  }

  // Outstanding summary for unpaid tab
  const showOutstandingSummary = activeTab === 'unpaid'
  const totalOutstanding = initialOrders.reduce((sum, o) => {
    return sum + Math.max(0, Number(o.totalAmount ?? 0) - Number(o.amountPaid ?? 0))
  }, 0)

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Orders"
          actions={
            <Button size="lg" render={<Link href="/orders/new" />}>
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
          }
        />

        {/* Tab bar */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => handleTabClick(val as string)}
          className="mt-4 flex-row"
        >
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Outstanding summary */}
        {showOutstandingSummary && initialOrders.length > 0 && (
          <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-800">
            <AlertDescription>
              GHS {totalOutstanding.toFixed(2)} outstanding across {initialOrders.length} invoice
              {initialOrders.length !== 1 ? 's' : ''}
            </AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="mt-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by order number or customer"
            className="w-full"
          />
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 && initialOrders.length === 0 && (
            <EmptyState
              icon={
                <svg
                  className="h-12 w-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                  />
                </svg>
              }
              title="No orders yet"
              subtitle="Record your first sale to get started."
              action={{ label: 'New Sale', href: '/orders/new' }}
            />
          )}

          {filtered.length === 0 && initialOrders.length > 0 && (
            <EmptyState
              icon={
                <svg
                  className="h-12 w-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              }
              title="No orders match your search"
            />
          )}

          {filtered.map((order) => (
            <SwipeableRow
              key={order.id}
              actions={[
                {
                  label: 'View',
                  color: 'bg-blue-500',
                  onClick: () => router.push(`/orders/${order.id}`),
                },
              ]}
            >
              <Link href={`/orders/${order.id}`} className="block">
                <Card className="p-4 transition-colors hover:bg-muted/30 active:bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{order.orderNumber}</p>
                        <PaymentBadge
                          paymentStatus={order.paymentStatus}
                          totalAmount={order.totalAmount}
                          amountPaid={order.amountPaid}
                        />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {order.customerName || 'Walk-in'} &middot; {formatDate(order.orderDate)}
                      </p>
                      {order.paymentMethod && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <p className="text-base font-semibold">{formatGhs(order.totalAmount)}</p>
                      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                </Card>
              </Link>
            </SwipeableRow>
          ))}
        </div>
      </div>
    </main>
  )
}
