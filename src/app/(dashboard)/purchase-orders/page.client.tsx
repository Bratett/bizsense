'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import type { PurchaseOrderWithSupplier } from '@/actions/purchaseOrders'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatGhs, formatDate } from '@/lib/format'

type PoStatus = 'all' | 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled'

const STATUS_TABS: { key: PoStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'partially_received', label: 'Partial' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
]

const STATUS_VARIANT: Record<string, 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'> = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partial',
  received: 'received',
  cancelled: 'cancelled',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
}

export default function PurchaseOrderList({
  initialPos,
}: {
  initialPos: PurchaseOrderWithSupplier[]
}) {
  const [activeTab, setActiveTab] = useState<PoStatus>('all')
  const [search, setSearch] = useState('')

  const filtered = initialPos.filter((po) => {
    if (activeTab !== 'all' && po.status !== activeTab) return false
    if (search) {
      const term = search.toLowerCase()
      return (
        po.poNumber.toLowerCase().includes(term) || po.supplierName.toLowerCase().includes(term)
      )
    }
    return true
  })

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Purchase Orders"
          actions={
            <Button render={<Link href="/purchase-orders/new" />} size="lg">
              New PO
            </Button>
          }
        />

        {/* Status tabs */}
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="whitespace-nowrap"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by PO number or supplier"
          />
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 && initialPos.length === 0 && (
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="No purchase orders yet"
              subtitle="Create your first PO to order from a supplier."
              action={{ label: 'New PO', href: '/purchase-orders/new' }}
            />
          )}

          {filtered.length === 0 && initialPos.length > 0 && (
            <EmptyState icon={<Package className="h-10 w-10" />} title="No purchase orders match" />
          )}

          {filtered.map((po) => (
            <Link key={po.id} href={`/purchase-orders/${po.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{po.poNumber}</p>
                        <StatusBadge variant={STATUS_VARIANT[po.status] ?? 'draft'}>
                          {STATUS_LABEL[po.status] ?? po.status}
                        </StatusBadge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{po.supplierName}</p>
                      <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                        <span>Ordered: {formatDate(po.orderDate)}</span>
                        {po.expectedDate && (
                          <span>&middot; Expected: {formatDate(po.expectedDate)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <p className="text-base font-semibold text-foreground">
                        {formatGhs(po.totalAmount)}
                      </p>
                      <svg
                        className="h-5 w-5 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
